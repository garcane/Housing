# London Planning Atlas

Approval rates, decision times, new homes and available land for full planning applications across London's boroughs, 2022–2025. The analysis is in `main.ipynb`; this repo also serves it as a web app.

```
data/                 raw inputs (housing.csv, brownfield register, Green Belt, OSM land use, population, boundaries)
data/processed/       pipeline output served by the API (Parquet, JSON, GeoJSON)
backend/pipeline/     cleaning rules shared with the notebook + the build script
backend/app/          FastAPI + DuckDB API
frontend/             Next.js app (MapLibre + deck.gl maps, Observable Plot + Plotly charts)
```

## Run it locally

Needs Python 3.13 with [uv](https://docs.astral.sh/uv/), and Node 20+.

```bash
# 1. Build the processed data (about 1 minute). Rerun whenever anything in data/ changes.
uv sync
uv run python -m backend.pipeline.build

# 2. Start the API on :8000
uv run uvicorn backend.app.main:app --port 8000 --reload --reload-dir backend

# 3. Start the frontend on :3000 (in a second terminal)
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000. The frontend proxies `/api/*` to `API_URL` (default `http://127.0.0.1:8000`).

If `uv` fails with a certificate error on this network, add `--native-tls`.

## Pages

- **Overview** (`/`): London-wide headline figures, a choropleth you can switch between eight measures, approval rates with confidence intervals, speed vs approval, and a sortable table of every borough.
- **Borough profile** (`/borough/[slug]`): approvals and refusals, decision times (distribution, quarterly trends, wards), homes (scheme map), and land and population (brownfield, Green Belt, OSM land use). Includes CSV and PNG export.
- **Compare** (`/compare?b=a,b,c`): up to four authorities side by side.
- **Applications** (`/search`): full-text search and filters over about 98k applications, with links to council records and CSV export.
- **Other authorities**: City of London and the two Mayoral Development Corporations. They're kept out of rankings and London averages.
- **Methodology**: every caveat from the notebook, plus the decision-time data gaps.

## API

Interactive docs are at http://localhost:8000/docs. Main endpoints:

| Endpoint | What it returns |
|---|---|
| `GET /api/london` | London-wide figures and key findings |
| `GET /api/authorities`, `/api/authorities/{slug}` | Per-authority summaries and full profiles |
| `GET /api/trends?slug=` | Quarterly cohorts, for London and optionally one authority |
| `GET /api/authorities/{slug}/decision-times`, `/breakdowns` | Days-to-decision histogram; stats by size, route and ward |
| `GET /api/applications?...` | Paged search (`slug, q, outcome, size, year, land_type, route, green_belt, sort, page`) |
| `GET /api/points/{applications,schemes,brownfield}` | Map point layers |
| `GET /api/geo/{boroughs,green_belt,landuse}` | GeoJSON layers |
| `*.csv` | `/api/applications/export.csv`, `/api/authorities/{slug}/export.csv`, `/api/compare/export.csv?slugs=` |

## Data caveats

See `/methodology` for the full list. In short:
- Rates are correlations, not causes.
- 2025 cohorts are right-censored.
- Dwelling counts only cover larger schemes.
- Barking & Dagenham, Hackney, Harrow and Waltham Forest have no decision times for applications started after mid-2023, so their timing figures only describe 2022–23 applications.
