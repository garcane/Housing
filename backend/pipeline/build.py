"""Build the processed data the API serves.

    uv run python -m backend.pipeline.build

Reads the raw files in data/ and writes data/processed/:
  applications.parquet   full applications, cleaned, with land-type and Green Belt flags
  schemes.parquet        de-duplicated housing schemes (dwellings)
  brownfield.parquet     current London brownfield register sites
  authorities.json       per-authority aggregates (outcomes, timing, dwellings, land, population)
  london.json            London-wide figures and the key findings
  geo/*.geojson          borough boundaries, Green Belt and OSM land use, clipped to London
"""
import json
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import stats
from shapely import set_precision, wkt

from .cleaning import (
    BROWNFIELD_STATUS, LAND_ORDER, MIN_DECIDED, NAME_FIX, OSM_LAND_TYPE, OTHER_AUTHORITIES,
    display_name, dwelling_schemes, full_applications, slugify, wilson_ci,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data"
OUT = RAW / "processed"
BNG = 27700  # British National Grid (metres), for areas and distances
WGS84 = 4326


def log(msg, t0=[time.time()]):
    print(f"[{time.time() - t0[0]:6.1f}s] {msg}", flush=True)


def clean(v):
    """Make numpy / pandas values JSON-safe (NaN -> None)."""
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else round(float(v), 6)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def write_json(obj, path):
    path.write_text(json.dumps(clean(obj), ensure_ascii=False, indent=1), encoding="utf-8")


def write_geojson(gdf, path, precision=5):
    """WGS84 GeoJSON with coordinates snapped to `precision` decimals (5 d.p. ~ 1 m)."""
    g = gdf.to_crs(WGS84).copy()
    g["geometry"] = set_precision(g.geometry.values, 10 ** -precision)
    g = g[~g.geometry.is_empty]
    path.write_text(g.to_json(drop_id=True, na="null"), encoding="utf-8")


def within(points, polys):
    hit = gpd.sjoin(points[["geometry"]], polys[["geometry"]], how="inner", predicate="within")
    return points.index.isin(hit.index)


def rate_table(df, by):
    t = df.groupby(by).agg(n=("approved", "size"), approved=("approved", "sum"), median_days=("days", "median"))
    t["approval_rate"] = t["approved"] / t["n"]
    t["ci_low"], t["ci_high"] = wilson_ci(t["approved"], t["n"])
    return t


def records(df, index_name):
    return [{index_name: k, **r} for k, r in df.to_dict(orient="index").items()]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "geo").mkdir(exist_ok=True)

    # ---------------------------------------------------------------- raw data
    data = pd.read_csv(RAW / "housing.csv", low_memory=False)
    log(f"housing.csv: {len(data):,} rows")
    full = full_applications(data)
    full["authority"] = full["area_name"].map(display_name)
    full["slug"] = full["authority"].map(slugify)
    full["kind"] = np.where(full["area_name"].isin(OTHER_AUTHORITIES), "other", "borough")
    dec = full[full["decided"]]
    log(f"full applications: {len(full):,}; decided: {len(dec):,}")

    boroughs = gpd.read_file(RAW / "london_boroughs.geojson").rename(columns={"LAD23CD": "code", "LAD23NM": "borough"})
    boroughs["slug"] = boroughs["borough"].map(slugify)
    b_bng = boroughs[["code", "borough", "slug", "geometry"]].to_crs(BNG)
    b_bng["area_ha"] = b_bng.area / 1e4
    london_bng = b_bng.union_all()

    # ---------------------------------------------------------------- land layers (section 10)
    blr = pd.read_csv(RAW / "brownfield_land_register.csv", low_memory=False)
    blr = blr[blr["end-date"].isna() & blr["point"].notna() & blr["hectares"].notna()].copy()
    blr = gpd.GeoDataFrame(blr, geometry=blr["point"].map(wkt.loads), crs=WGS84).to_crs(BNG)
    blr = gpd.sjoin(blr, b_bng[["borough", "geometry"]], how="inner", predicate="within").drop(columns="index_right")
    blr["status"] = blr["planning-permission-status"].map(BROWNFIELD_STATUS).fillna("Other / unknown")
    log(f"brownfield sites in London: {len(blr):,}")

    osm = gpd.read_file(RAW / "osm_landuse_london.gpkg").to_crs(BNG)
    osm["land_type"] = osm["landuse"].map(OSM_LAND_TYPE)
    osm = osm[osm["land_type"].notna()]

    gb_raw = gpd.read_file(RAW / "green_belt_england.geojson", bbox=tuple(boroughs.total_bounds)).to_crs(BNG)
    gb = gpd.GeoDataFrame(geometry=[gb_raw.union_all()], crs=BNG)
    log("OSM land use and Green Belt loaded")

    pop = (pd.read_csv(RAW / "population_boroughs.csv")
           .rename(columns={"GEOGRAPHY_CODE": "code", "OBS_VALUE": "population", "DATE_NAME": "pop_year"}))

    # ---------------------------------------------------------------- per-application land flags
    geo = full[full["lat"].notna()].copy()
    geo = gpd.GeoDataFrame(geo, geometry=gpd.points_from_xy(geo["lng"], geo["lat"]), crs=WGS84).to_crs(BNG)
    blr_poly = blr[["hectares", "geometry"]].copy()
    blr_poly["geometry"] = blr_poly.buffer(np.maximum(np.sqrt(blr_poly["hectares"] * 1e4 / np.pi), 20))
    on_brown = within(geo, blr_poly)
    on_ind = within(geo, osm[osm["land_type"] == "Industrial"])
    on_green = within(geo, osm[osm["land_type"] == "Virgin / greenfield"])
    geo["in_green_belt"] = within(geo, gb)
    geo["land_type"] = np.select([on_brown, on_ind, on_green],
                                 ["Brownfield", "Industrial", "Virgin / greenfield"], default="Existing urban")
    # Borough by location, so development-corporation applications land in their host borough
    geo = gpd.sjoin(geo, b_bng[["borough", "geometry"]], how="left", predicate="within").drop(columns="index_right")
    full = full.join(geo[["land_type", "in_green_belt", "borough"]].rename(columns={"borough": "geo_borough"}))
    full["geo_borough"] = full["geo_borough"].fillna(full["area_name"].replace(NAME_FIX))
    full.loc[~full["geo_borough"].isin(boroughs["borough"]), "geo_borough"] = None
    dec = full[full["decided"]]
    log("land flags assigned")

    cols = ["uid", "name", "reference", "authority", "slug", "kind", "area_name", "geo_borough", "ward_name",
            "description", "app_size", "status", "decision", "outcome", "decided", "approved", "route", "decided_by",
            "start_date", "decided_date", "start_year", "start_q", "days", "stat_days", "in_time",
            "n_comments", "n_documents", "n_dwellings", "lat", "lng", "url", "land_type", "in_green_belt",
            "agent_company", "case_officer"]
    apps_out = full[cols].copy()
    apps_out["in_green_belt"] = apps_out["in_green_belt"].astype("boolean")
    apps_out.to_parquet(OUT / "applications.parquet", index=False)
    log(f"wrote applications.parquet ({len(apps_out):,} rows)")

    # ---------------------------------------------------------------- dwellings (section 9)
    homes = dwelling_schemes(data)
    homes = gpd.GeoDataFrame(homes, geometry=gpd.points_from_xy(homes["lng"], homes["lat"]), crs=WGS84)
    homes = gpd.sjoin(homes, boroughs[["borough", "geometry"]], how="left", predicate="within").drop(columns="index_right")
    homes["borough"] = homes["borough"].fillna(homes["area_name"].replace(NAME_FIX))
    homes = homes[homes["borough"].isin(boroughs["borough"])].copy()
    homes["slug"] = homes["borough"].map(slugify)
    pd.DataFrame(homes.drop(columns="geometry")).to_parquet(OUT / "schemes.parquet", index=False)

    dwell = homes.groupby("borough").agg(
        schemes=("n_dwellings", "size"),
        proposed_dwellings=("n_dwellings", "sum"),
        approved_schemes=("approved", "sum"),
        approved_dwellings=("n_dwellings", lambda v: v[homes.loc[v.index, "approved"]].sum()),
        median_scheme_size=("n_dwellings", "median"),
        largest_scheme=("n_dwellings", "max"),
    )
    dwell["share_of_london_approved"] = dwell["approved_dwellings"] / dwell["approved_dwellings"].sum()
    log(f"schemes: {len(homes):,}; approved dwellings {dwell['approved_dwellings'].sum():,.0f}")

    # ---------------------------------------------------------------- land by borough (section 10a)
    def area_by_borough(layer, label):
        dissolved = gpd.GeoDataFrame(geometry=[layer.union_all()], crs=BNG)
        inter = gpd.overlay(b_bng[["borough", "geometry"]], dissolved, how="intersection")
        return (inter.area / 1e4).groupby(inter["borough"]).sum().rename(label)

    land = b_bng.set_index("borough")[["code", "area_ha"]].join([
        blr.groupby("borough")["hectares"].sum().rename("brownfield_ha"),
        area_by_borough(osm[osm["land_type"] == "Industrial"], "industrial_ha"),
        area_by_borough(osm[osm["land_type"] == "Virgin / greenfield"], "greenfield_ha"),
        area_by_borough(gb, "green_belt_ha"),
    ]).fillna(0)
    land = land.reset_index().merge(pop[["code", "population", "pop_year"]], on="code").set_index("borough")
    land["available_ha"] = land[["brownfield_ha", "industrial_ha", "greenfield_ha"]].sum(axis=1)
    for c in ["brownfield_ha", "industrial_ha", "greenfield_ha", "green_belt_ha", "available_ha"]:
        land[c.replace("_ha", "_pct")] = land[c] / land["area_ha"]
    land["density_per_km2"] = land["population"] / (land["area_ha"] / 100)
    blr_perm = blr.assign(perm=blr["status"] == "Permissioned").groupby("borough").agg(
        brownfield_sites=("perm", "size"), brownfield_permissioned_share=("perm", "mean"),
        brownfield_max_dwellings=("maximum-net-dwellings", "sum"), register_updated=("entry-date", "max"))
    land = land.join(blr_perm)
    land = land.join(dwell)
    counts = ["schemes", "proposed_dwellings", "approved_schemes", "approved_dwellings", "share_of_london_approved"]
    land[counts] = land[counts].fillna(0)
    land["approved_per_km2"] = land["approved_dwellings"] / (land["area_ha"] / 100)
    land["approved_per_1000_people"] = land["approved_dwellings"] / land["population"] * 1000
    log("land aggregates done")

    bso = blr.to_crs(WGS84)
    pd.DataFrame({
        "borough": bso["borough"], "slug": bso["borough"].map(slugify), "address": bso["site-address"],
        "hectares": bso["hectares"], "status": bso["status"],
        "min_dwellings": pd.to_numeric(bso["minimum-net-dwellings"], errors="coerce"),
        "max_dwellings": pd.to_numeric(bso["maximum-net-dwellings"], errors="coerce"),
        "permission_type": bso["planning-permission-type"], "ownership": bso["ownership-status"],
        "url": bso["site-plan-url"], "entry_date": bso["entry-date"],
        "lat": bso.geometry.y, "lng": bso.geometry.x,
    }).to_parquet(OUT / "brownfield.parquet", index=False)

    # ---------------------------------------------------------------- per-authority aggregates
    oc = pd.crosstab(full["area_name"], full["outcome"])
    auth = pd.DataFrame({
        "total_full": oc.sum(axis=1), "approved": oc.get("Approved", 0), "rejected": oc.get("Rejected", 0),
        "withdrawn": oc.get("Withdrawn", 0), "undecided": oc.get("Undecided", 0),
    })
    auth["decided"] = auth["approved"] + auth["rejected"]
    auth["approval_rate"] = auth["approved"] / auth["decided"]
    auth["rejection_rate"] = 1 - auth["approval_rate"]
    auth["withdrawal_rate"] = auth["withdrawn"] / auth["total_full"]
    auth["ci_low"], auth["ci_high"] = wilson_ci(auth["approved"], auth["decided"])
    auth["reliable"] = auth["decided"] >= MIN_DECIDED

    valid = dec[dec["days"].notna()]
    time_a = valid.groupby("area_name").agg(
        median_days=("days", "median"), q1=("days", lambda s: s.quantile(.25)),
        q3=("days", lambda s: s.quantile(.75)), p90=("days", lambda s: s.quantile(.90)),
        mean_days=("days", "mean"), in_time=("in_time", "mean"))
    med_oc = valid.pivot_table(index="area_name", columns="outcome", values="days", aggfunc="median")
    time_a["median_approved"] = med_oc["Approved"]
    time_a["median_rejected"] = med_oc["Rejected"]
    known = dec[dec["route"].isin(["Committee", "Delegated"])]
    time_a["committee_share"] = known.groupby("area_name")["route"].apply(lambda s: (s == "Committee").mean())
    time_a["median_days_committee"] = valid[valid["route"] == "Committee"].groupby("area_name")["days"].median()
    time_a["median_days_delegated"] = valid[valid["route"] == "Delegated"].groupby("area_name")["days"].median()
    # Some portals stop publishing decision dates part-way through the period; record how much of the
    # timing data exists so the UI can flag medians that only describe the earlier years.
    time_a["days_coverage"] = dec.groupby("area_name")["days"].apply(lambda s: s.notna().mean())
    time_a["days_last_start"] = valid.groupby("area_name")["start_date"].max().dt.strftime("%Y-%m")
    auth = auth.join(time_a)

    boro_rows = auth.index[~auth.index.isin(OTHER_AUTHORITIES)]
    b_only = auth.loc[boro_rows]
    ranked = b_only[b_only["reliable"]]
    land_b = land.rename(index=slugify)

    def rank(series, ascending):
        return series.rank(ascending=ascending, method="min")

    ranks = pd.DataFrame({
        "approval_rate": rank(ranked["approval_rate"], False),
        "median_days": rank(ranked["median_days"], True),
        "in_time": rank(ranked["in_time"], False),
    }).rename(index=lambda a: slugify(display_name(a)))
    land_ranked = land_b.loc[land_b.index != slugify("City of London")]
    ranks_land = pd.DataFrame({
        "approved_dwellings": rank(land_ranked["approved_dwellings"], False),
        "approved_per_1000_people": rank(land_ranked["approved_per_1000_people"], False),
        "available_ha": rank(land_ranked["available_ha"], False),
        "density_per_km2": rank(land_ranked["density_per_km2"], False),
    })

    lt = dec[dec["land_type"].notna() & dec["geo_borough"].notna()]
    by_size = dec.groupby(["area_name", "app_size"]).agg(n=("approved", "size"), approved=("approved", "sum"))
    by_land = lt.groupby(["geo_borough", "land_type"]).agg(n=("approved", "size"), approved=("approved", "sum"))

    authorities = []
    for area, r in auth.iterrows():
        name = display_name(area)
        slug = slugify(name)
        kind = "other" if area in OTHER_AUTHORITIES else "borough"
        entry = {"slug": slug, "name": name, "area_name": area, "kind": kind, **r.to_dict()}
        sz = by_size.loc[area] if area in by_size.index.get_level_values(0) else None
        entry["by_size"] = [] if sz is None else [
            {"size": s, "n": int(v["n"]), "approval_rate": v["approved"] / v["n"]}
            for s, v in sz.reindex(["Small", "Medium", "Large"]).dropna().iterrows()]
        entry["ranks"] = {k: (None if slug not in ranks.index else ranks.loc[slug, k]) for k in ranks.columns}
        geo_name = name if name in land.index else None
        entry["geo_borough"] = geo_name
        entry["code"] = land.loc[geo_name, "code"] if geo_name else None
        if geo_name:
            lr = land.loc[geo_name]
            entry["dwellings"] = {k: lr.get(k) for k in [
                "schemes", "proposed_dwellings", "approved_schemes", "approved_dwellings", "median_scheme_size",
                "largest_scheme", "share_of_london_approved", "approved_per_km2", "approved_per_1000_people"]}
            entry["land"] = {k: lr.get(k) for k in [
                "area_ha", "population", "pop_year", "density_per_km2", "brownfield_ha", "industrial_ha",
                "greenfield_ha", "green_belt_ha", "available_ha", "brownfield_pct", "industrial_pct",
                "greenfield_pct", "green_belt_pct", "available_pct", "brownfield_sites",
                "brownfield_permissioned_share", "brownfield_max_dwellings", "register_updated"]}
            bl = by_land.loc[geo_name] if geo_name in by_land.index.get_level_values(0) else None
            entry["by_land_type"] = [] if bl is None else [
                {"land_type": t, "n": int(v["n"]), "approval_rate": v["approved"] / v["n"] if v["n"] >= 20 else None}
                for t, v in bl.reindex(LAND_ORDER).fillna(0).iterrows()]
            if slug in ranks_land.index:
                entry["ranks"].update(ranks_land.loc[slug].to_dict())
        else:
            entry["dwellings"] = entry["land"] = None
            entry["by_land_type"] = []
        authorities.append(entry)
    authorities.sort(key=lambda e: (e["kind"] != "borough", e["name"]))
    write_json({"n_ranked": int(len(ranked)), "authorities": authorities}, OUT / "authorities.json")
    log(f"wrote authorities.json ({len(authorities)} authorities)")

    # ---------------------------------------------------------------- London-wide (32 boroughs)
    bdec = dec[dec["kind"] == "borough"]
    bfull = full[full["kind"] == "borough"]
    bvalid = bdec[bdec["days"].notna()]
    lon_approval = bdec["approved"].mean()
    r_speed, p_speed = stats.spearmanr(ranked["median_days"], ranked["approval_rate"])
    a_days = bvalid.loc[bvalid["approved"], "days"]
    r_days = bvalid.loc[~bvalid["approved"], "days"]
    u = stats.mannwhitneyu(a_days, r_days)
    rank_biserial = 1 - 2 * u.statistic / (len(a_days) * len(r_days))
    lci = wilson_ci(bdec["approved"].sum(), len(bdec))

    lapps = lt[lt["kind"] == "borough"]
    rt_all = rate_table(lapps, "land_type").reindex(LAND_ORDER)
    rt_big = rate_table(lapps[lapps["app_size"].isin(["Medium", "Large"])], "land_type").reindex(LAND_ORDER)
    gbt = rate_table(lapps.assign(gb=np.where(lapps["in_green_belt"].fillna(False).astype(bool),
                                              "In Green Belt", "Outside Green Belt")), "gb")
    size_t = rate_table(bdec, "app_size").reindex(["Small", "Medium", "Large"])
    route_t = rate_table(bdec, "route")

    top = ranked["approval_rate"].nlargest(3)
    bot = ranked["approval_rate"].nsmallest(3)
    fast = ranked["median_days"].nsmallest(3)
    slow = ranked["median_days"].nlargest(3)
    named = lambda s: [{"name": display_name(k), "slug": slugify(display_name(k)), "value": v} for k, v in s.items()]
    land_b32 = land.drop(index="City of London")

    london = {
        "scope": "32 London boroughs (City of London and the two development corporations are reported separately)",
        "period": {"start_min": str(full["start_date"].min().date()), "start_max": str(full["start_date"].max().date()),
                   "decided_max": str(full["decided_date"].max().date())},
        "counts": {"all_rows": len(data), "full": len(bfull), "decided": len(bdec),
                   "withdrawn": int((bfull["outcome"] == "Withdrawn").sum()),
                   "undecided": int((bfull["outcome"] == "Undecided").sum())},
        "approval_rate": lon_approval, "rejection_rate": 1 - lon_approval,
        "approval_ci": list(lci),
        "withdrawal_rate": (bfull["outcome"] == "Withdrawn").mean(),
        "median_days": bvalid["days"].median(), "in_time": bvalid["in_time"].mean(),
        "median_days_approved": a_days.median(), "median_days_rejected": r_days.median(),
        "rank_biserial": rank_biserial,
        "speed_vs_approval": {"spearman_rho": r_speed, "p": p_speed},
        "approval_range": {"min": ranked["approval_rate"].min(), "max": ranked["approval_rate"].max()},
        "highest": named(top), "lowest": named(bot), "fastest": named(fast), "slowest": named(slow),
        "by_size": records(size_t, "size"),
        "by_route": records(route_t, "route"),
        "by_land_type": records(rt_all, "land_type"),
        "by_land_type_medium_large": records(rt_big, "land_type"),
        "green_belt": records(gbt, "group"),
        "dwellings": {
            "schemes": int(dwell["schemes"].sum()),
            "proposed": dwell["proposed_dwellings"].sum(), "approved": dwell["approved_dwellings"].sum(),
            "top5_share": dwell["approved_dwellings"].nlargest(5).sum() / dwell["approved_dwellings"].sum(),
        },
        "land": {k: land_b32[k].sum() for k in ["area_ha", "population", "brownfield_ha", "industrial_ha",
                                                 "greenfield_ha", "green_belt_ha", "available_ha"]}
                | {"brownfield_sites": int(len(blr)), "density_per_km2":
                   land_b32["population"].sum() / (land_b32["area_ha"].sum() / 100),
                   "pop_year": str(pop["pop_year"].iloc[0])},
        "timing_gaps": [{"name": display_name(k), "slug": slugify(display_name(k)), "coverage": r["days_coverage"],
                         "last_start": r["days_last_start"]}
                        for k, r in b_only.iterrows() if r["days_coverage"] < 0.8],
        "means": {  # borough-level means, for "vs London" comparisons of per-borough ratios
            "approved_per_1000_people": land_b32["approved_per_1000_people"].mean(),
            "available_pct": land_b32["available_pct"].mean(),
            "committee_share": b_only["committee_share"].mean(),
        },
    }
    write_json(london, OUT / "london.json")
    log("wrote london.json")

    # ---------------------------------------------------------------- geometry for the maps
    bgeo = boroughs[["code", "borough", "slug", "geometry"]].rename(columns={"borough": "name"})
    write_geojson(bgeo, OUT / "geo" / "boroughs.geojson")
    gb_l = gpd.GeoDataFrame(geometry=[gb.geometry.iloc[0].intersection(london_bng).simplify(15)], crs=BNG)
    write_geojson(gb_l, OUT / "geo" / "green_belt.geojson")
    lu = osm[["land_type", "geometry"]].copy()
    lu["geometry"] = lu.geometry.simplify(5)
    lu = lu[lu.area > 500]  # drop slivers under 0.05 ha to keep the file light
    write_geojson(lu, OUT / "geo" / "landuse.geojson")
    log("wrote geo/*.geojson")

    # ---------------------------------------------------------------- sanity print vs notebook section 8
    print(f"""
KEY NUMBERS (32 boroughs)
- {len(bfull):,} full applications; {len(bdec):,} decided.
- London approval {lon_approval:.1%}; range {ranked['approval_rate'].min():.1%} to {ranked['approval_rate'].max():.1%}
    Highest: {', '.join(f'{display_name(k)} {v:.0%}' for k, v in top.items())}
    Lowest:  {', '.join(f'{display_name(k)} {v:.0%}' for k, v in bot.items())}
- Median days {bvalid['days'].median():.0f}; in time {bvalid['in_time'].mean():.0%}
    Fastest: {', '.join(f'{display_name(k)} {v:.0f}d' for k, v in fast.items())}
    Slowest: {', '.join(f'{display_name(k)} {v:.0f}d' for k, v in slow.items())}
- Approved median {a_days.median():.0f}d vs rejected {r_days.median():.0f}d (r = {rank_biserial:.2f})
- Speed vs approval: rho = {r_speed:.2f} (p = {p_speed:.3f})
- Dwellings approved {dwell['approved_dwellings'].sum():,.0f} of {dwell['proposed_dwellings'].sum():,.0f} proposed
""")


if __name__ == "__main__":
    main()
