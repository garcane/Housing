"""London Planning API.

    uv run uvicorn backend.app.main:app --reload --port 8000

Serves the files written by `python -m backend.pipeline.build`. Aggregates that need geometry
(dwellings, land) are precomputed in authorities.json; everything that depends on user filters
(trends, distributions, search, exports) is queried live from Parquet with DuckDB.
"""
import csv
import io
import json
import tempfile
import threading
from pathlib import Path
from typing import Literal

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, StreamingResponse

# Kept inside backend/ so the API deploys on its own (e.g. a Vercel project with root directory `backend`).
DATA = Path(__file__).resolve().parents[1] / "data"
if not (DATA / "authorities.json").exists():
    raise RuntimeError("Processed data missing: run `uv run python -m backend.pipeline.build` first.")

LONDON = json.loads((DATA / "london.json").read_text(encoding="utf-8"))
_AUTH = json.loads((DATA / "authorities.json").read_text(encoding="utf-8"))
N_RANKED = _AUTH["n_ranked"]
AUTHORITIES = {a["slug"]: a for a in _AUTH["authorities"]}

# Serverless file systems are read-only apart from the temp dir, so point DuckDB's home there.
_db = duckdb.connect(config={"home_directory": tempfile.gettempdir()})
for view, file in [("apps", "applications"), ("schemes", "schemes"), ("brownfield", "brownfield")]:
    _db.execute(f"CREATE VIEW {view} AS SELECT * FROM read_parquet('{(DATA / file).as_posix()}.parquet')")
_local = threading.local()


def db():
    """One DuckDB cursor per worker thread (a connection isn't safe to share across threads)."""
    if not hasattr(_local, "cur"):
        _local.cur = _db.cursor()
    return _local.cur


def query(sql, params=()):
    cur = db().execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_authority(slug):
    a = AUTHORITIES.get(slug)
    if a is None:
        raise HTTPException(404, f"Unknown authority '{slug}'")
    return a


app = FastAPI(title="London Planning API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["GET"],
                   allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=2048)


# ------------------------------------------------------------------------------------ summaries
SUMMARY_KEYS = ["slug", "name", "kind", "code", "total_full", "decided", "approval_rate", "ci_low", "ci_high",
                "reliable", "median_days", "in_time", "withdrawal_rate", "ranks"]


def summary(a):
    s = {k: a.get(k) for k in SUMMARY_KEYS}
    d, l = a.get("dwellings") or {}, a.get("land") or {}
    s.update(approved_dwellings=d.get("approved_dwellings"), approved_per_1000_people=d.get("approved_per_1000_people"),
             population=l.get("population"), density_per_km2=l.get("density_per_km2"),
             available_ha=l.get("available_ha"), green_belt_pct=l.get("green_belt_pct"),
             brownfield_ha=l.get("brownfield_ha"))
    return s


@app.get("/api/health")
def health():
    return {"ok": True, "authorities": len(AUTHORITIES)}


@app.get("/api/london")
def london():
    return LONDON


@app.get("/api/authorities")
def authorities():
    return {"n_ranked": N_RANKED, "authorities": [summary(a) for a in AUTHORITIES.values()]}


@app.get("/api/authorities/{slug}")
def authority(slug: str):
    return {"n_ranked": N_RANKED, "authority": get_authority(slug), "london": LONDON}


# ------------------------------------------------------------------------------------ time series
def trend_rows(where, params):
    return query(f"""
        SELECT start_q AS quarter,
               count(*) AS n,
               avg(CASE WHEN outcome = 'Undecided' THEN 1 ELSE 0 END) AS undecided,
               avg(CASE WHEN decided THEN CAST(approved AS INT) END) AS approval_rate,
               median(CASE WHEN decided THEN days END) AS median_days,
               avg(CASE WHEN decided THEN in_time END) AS in_time
        FROM apps WHERE {where}
        GROUP BY 1 ORDER BY 1""", params)


@app.get("/api/trends")
def trends(slug: str | None = None):
    """Quarterly cohorts by start date. Quarters with >10% still undecided are right-censored."""
    london_rows = trend_rows("kind = 'borough'", ())
    out = {"london": london_rows}
    if slug:
        get_authority(slug)
        out["authority"] = trend_rows("slug = ?", (slug,))
    return out


@app.get("/api/authorities/{slug}/decision-times")
def decision_times(slug: str, bin_days: int = Query(14, ge=7, le=56), cap: int = Query(365, ge=56, le=1095)):
    """Histogram of days to decision for decided applications (authority vs London, as shares)."""
    get_authority(slug)
    sql = f"""
        SELECT least(floor(days / {bin_days}) * {bin_days}, {cap}) AS bin,
               count(*) FILTER (WHERE slug = ?) AS n_authority,
               count(*) FILTER (WHERE kind = 'borough') AS n_london
        FROM apps WHERE decided AND days IS NOT NULL GROUP BY 1 ORDER BY 1"""
    rows = query(sql, (slug,))
    ta = sum(r["n_authority"] for r in rows) or 1
    tl = sum(r["n_london"] for r in rows) or 1
    return {"bin_days": bin_days, "cap": cap, "bins": [
        {"from": r["bin"], "to": None if r["bin"] >= cap else r["bin"] + bin_days,
         "authority": r["n_authority"] / ta, "london": r["n_london"] / tl, "n": r["n_authority"]} for r in rows]}


@app.get("/api/authorities/{slug}/breakdowns")
def breakdowns(slug: str):
    """Approval rate and median days by size, route and ward for one authority."""
    get_authority(slug)
    def by(col):
        return query(f"""
            SELECT {col} AS key, count(*) AS n, avg(CAST(approved AS INT)) AS approval_rate, median(days) AS median_days
            FROM apps WHERE slug = ? AND decided AND {col} IS NOT NULL GROUP BY 1 ORDER BY n DESC""", (slug,))
    return {"size": by("app_size"), "route": by("route"),
            "ward": [w for w in by("ward_name") if w["n"] >= 30]}


# ------------------------------------------------------------------------------------ map layers
@app.get("/api/geo/{name}")
def geo(name: Literal["boroughs", "green_belt", "landuse"]):
    return FileResponse(DATA / "geo" / f"{name}.geojson", media_type="application/geo+json",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/points/applications")
def application_points(slug: str | None = None, decided_only: bool = True):
    """Compact columnar points for deck.gl: [lng, lat, outcome code, size code]."""
    where, params = ["lat IS NOT NULL"], []
    if slug:
        where.append("(slug = ? OR geo_borough = (SELECT any_value(geo_borough) FROM apps WHERE slug = ?))")
        params += [slug, slug]
    if decided_only:
        where.append("decided")
    rows = db().execute(f"""
        SELECT round(lng, 5), round(lat, 5),
               CASE outcome WHEN 'Approved' THEN 0 WHEN 'Rejected' THEN 1 WHEN 'Withdrawn' THEN 2 ELSE 3 END,
               CASE app_size WHEN 'Small' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Large' THEN 2 ELSE 0 END
        FROM apps WHERE {' AND '.join(where)}""", params).fetchall()
    return {"outcomes": ["Approved", "Rejected", "Withdrawn", "Undecided"], "sizes": ["Small", "Medium", "Large"],
            "points": rows}


@app.get("/api/points/schemes")
def scheme_points(slug: str | None = None):
    where, params = "lat IS NOT NULL", []
    if slug:
        where += " AND slug = ?"
        params.append(slug)
    return query(f"""SELECT uid, n_dwellings, approved, applications, app_type, CAST(start_date AS VARCHAR) AS start_date,
                            left(description, 280) AS description, lat, lng, borough, url
                     FROM schemes WHERE {where} ORDER BY n_dwellings DESC""", params)


@app.get("/api/points/brownfield")
def brownfield_points(slug: str | None = None):
    where, params = "TRUE", []
    if slug:
        where = "slug = ?"
        params.append(slug)
    return query(f"""SELECT address, hectares, status, min_dwellings, max_dwellings, lat, lng, borough, url
                     FROM brownfield WHERE {where} ORDER BY hectares DESC""", params)


# ------------------------------------------------------------------------------------ search
SORTS = {"newest": "start_date DESC", "oldest": "start_date ASC", "slowest": "days DESC NULLS LAST",
         "fastest": "days ASC NULLS LAST", "most_comments": "n_comments DESC NULLS LAST",
         "most_dwellings": "n_dwellings DESC NULLS LAST"}
SEARCH_COLS = """uid, name, reference, authority, slug, ward_name, left(description, 400) AS description, app_size,
    outcome, decision, route, CAST(start_date AS DATE) AS start_date, CAST(decided_date AS DATE) AS decided_date,
    days, in_time, n_comments, n_documents, n_dwellings, land_type, in_green_belt, lat, lng, url"""


def search_filters(slug, q, outcome, size, year, land_type, route, green_belt):
    where, params = ["TRUE"], []
    if slug:
        where.append("slug IN (SELECT unnest(string_split(?, ',')))")
        params.append(slug)
    if q:
        where.append("(description ILIKE ? OR uid ILIKE ? OR ward_name ILIKE ? OR agent_company ILIKE ?)")
        params += [f"%{q}%"] * 4
    for col, val in [("outcome", outcome), ("app_size", size), ("land_type", land_type), ("route", route)]:
        if val:
            where.append(f"{col} IN (SELECT unnest(string_split(?, ',')))")
            params.append(val)
    if year:
        where.append("start_year = ?")
        params.append(year)
    if green_belt is not None:
        where.append("coalesce(in_green_belt, false) = ?")
        params.append(green_belt)
    return " AND ".join(where), params




@app.get("/api/applications")
def applications(slug: str | None = None, q: str | None = None, outcome: str | None = None,
                 size: str | None = None, year: int | None = None, land_type: str | None = None,
                 route: str | None = None, green_belt: bool | None = None,
                 sort: Literal[tuple(SORTS)] = "newest",  # type: ignore[valid-type]
                 page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
    where, params = search_filters(slug, q, outcome, size, year, land_type, route, green_belt)
    total = db().execute(f"SELECT count(*) FROM apps WHERE {where}", params).fetchone()[0]
    rows = query(f"SELECT {SEARCH_COLS} FROM apps WHERE {where} ORDER BY {SORTS[sort]}, uid "
                 f"LIMIT {page_size} OFFSET {(page - 1) * page_size}", params)
    facets = query(f"""SELECT outcome, count(*) AS n FROM apps WHERE {where} GROUP BY 1 ORDER BY 2 DESC""", params)
    return {"total": total, "page": page, "page_size": page_size, "facets": {"outcome": facets}, "results": rows}


@app.get("/api/filters")
def filters():
    one = lambda col: [r[0] for r in db().execute(f"SELECT DISTINCT {col} FROM apps WHERE {col} IS NOT NULL ORDER BY 1").fetchall()]
    return {"outcome": one("outcome"), "size": ["Small", "Medium", "Large"], "year": one("start_year"),
            "land_type": ["Existing urban", "Brownfield", "Industrial", "Virgin / greenfield"],
            "route": one("route")}


# ------------------------------------------------------------------------------------ exports
def csv_response(rows, filename):
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/applications/export.csv")
def export_applications(slug: str | None = None, q: str | None = None, outcome: str | None = None,
                        size: str | None = None, year: int | None = None, land_type: str | None = None,
                        route: str | None = None, green_belt: bool | None = None):
    where, params = search_filters(slug, q, outcome, size, year, land_type, route, green_belt)
    rows = query(f"SELECT {SEARCH_COLS.replace('left(description, 400) AS description', 'description')} "
                 f"FROM apps WHERE {where} ORDER BY start_date DESC LIMIT 50000", params)
    return csv_response(rows, "london-planning-applications.csv")


def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(flatten(v, f"{prefix}{k}."))
        elif isinstance(v, list):
            for item in v:
                key = item.get("size") or item.get("land_type")
                for kk, vv in item.items():
                    if kk not in ("size", "land_type"):
                        out[f"{prefix}{k}.{key}.{kk}"] = vv
        else:
            out[f"{prefix}{k}"] = v
    return out


@app.get("/api/authorities/{slug}/export.csv")
def export_authority(slug: str):
    a = get_authority(slug)
    flat = flatten(a)
    rows = [{"metric": k, "value": v} for k, v in flat.items()]
    return csv_response(rows, f"{slug}-planning-profile.csv")


@app.get("/api/compare/export.csv")
def export_compare(slugs: str):
    auths = [get_authority(s) for s in slugs.split(",") if s]
    flats = [flatten(a) for a in auths]
    keys = list(dict.fromkeys(k for f in flats for k in f))
    rows = [{"metric": k, **{a["name"]: f.get(k) for a, f in zip(auths, flats)}} for k in keys]
    return csv_response(rows, "borough-comparison.csv")
