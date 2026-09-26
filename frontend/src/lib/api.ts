// Types mirror backend/data/*.json written by backend/pipeline/build.py.

export type Ranks = Partial<Record<
  "approval_rate" | "median_days" | "in_time" | "approved_dwellings" | "approved_per_1000_people" | "available_ha" | "density_per_km2",
  number | null
>>;

export type AuthoritySummary = {
  slug: string;
  name: string;
  kind: "borough" | "other";
  code: string | null;
  total_full: number;
  decided: number;
  approval_rate: number;
  ci_low: number;
  ci_high: number;
  reliable: boolean;
  median_days: number | null;
  in_time: number | null;
  withdrawal_rate: number;
  ranks: Ranks;
  approved_dwellings: number | null;
  approved_per_1000_people: number | null;
  population: number | null;
  density_per_km2: number | null;
  available_ha: number | null;
  green_belt_pct: number | null;
  brownfield_ha: number | null;
};

export type Dwellings = {
  schemes: number; proposed_dwellings: number; approved_schemes: number; approved_dwellings: number;
  median_scheme_size: number | null; largest_scheme: number | null; share_of_london_approved: number | null;
  approved_per_km2: number | null; approved_per_1000_people: number | null;
};

export type Land = {
  area_ha: number; population: number; pop_year: number; density_per_km2: number;
  brownfield_ha: number; industrial_ha: number; greenfield_ha: number; green_belt_ha: number; available_ha: number;
  brownfield_pct: number; industrial_pct: number; greenfield_pct: number; green_belt_pct: number; available_pct: number;
  brownfield_sites: number | null; brownfield_permissioned_share: number | null; brownfield_max_dwellings: number | null;
  register_updated: string | null;
};

export type Authority = {
  slug: string; name: string; area_name: string; kind: "borough" | "other"; code: string | null; geo_borough: string | null;
  total_full: number; approved: number; rejected: number; withdrawn: number; undecided: number; decided: number;
  approval_rate: number; rejection_rate: number; withdrawal_rate: number; ci_low: number; ci_high: number; reliable: boolean;
  median_days: number | null; q1: number | null; q3: number | null; p90: number | null; mean_days: number | null;
  in_time: number | null; median_approved: number | null; median_rejected: number | null;
  committee_share: number | null; median_days_committee: number | null; median_days_delegated: number | null;
  /** share of decided applications with a decision time; last start month that has one */
  days_coverage: number | null; days_last_start: string | null;
  by_size: { size: string; n: number; approval_rate: number }[];
  by_land_type: { land_type: string; n: number; approval_rate: number | null }[];
  ranks: Ranks;
  dwellings: Dwellings | null;
  land: Land | null;
};

type Named = { name: string; slug: string; value: number };
type RateRow = { n: number; approved: number; median_days: number | null; approval_rate: number; ci_low: number; ci_high: number };

export type London = {
  scope: string;
  period: { start_min: string; start_max: string; decided_max: string };
  /** date the application records were last fetched; absent in older data builds */
  data_updated?: string;
  built_at?: string;
  counts: { all_rows: number; full: number; decided: number; withdrawn: number; undecided: number };
  approval_rate: number; rejection_rate: number; approval_ci: [number, number]; withdrawal_rate: number;
  median_days: number; in_time: number; median_days_approved: number; median_days_rejected: number; rank_biserial: number;
  speed_vs_approval: { spearman_rho: number; p: number };
  approval_range: { min: number; max: number };
  highest: Named[]; lowest: Named[]; fastest: Named[]; slowest: Named[];
  by_size: (RateRow & { size: string })[];
  by_route: (RateRow & { route: string })[];
  by_land_type: (RateRow & { land_type: string })[];
  by_land_type_medium_large: (RateRow & { land_type: string })[];
  green_belt: (RateRow & { group: string })[];
  dwellings: { schemes: number; proposed: number; approved: number; top5_share: number };
  land: { area_ha: number; population: number; brownfield_ha: number; industrial_ha: number; greenfield_ha: number;
    green_belt_ha: number; available_ha: number; brownfield_sites: number; density_per_km2: number; pop_year: string };
  /** absent in data built before this field existed */
  timing_gaps?: { name: string; slug: string; coverage: number; last_start: string }[];
  means: { approved_per_1000_people: number; available_pct: number; committee_share: number };
};

export type TrendRow = { quarter: string; n: number; undecided: number; approval_rate: number | null; median_days: number | null; in_time: number | null };

export type Application = {
  uid: string; name: string; reference: string | null; authority: string; slug: string; ward_name: string | null;
  description: string | null; app_size: string | null; outcome: string; decision: string | null; route: string;
  start_date: string | null; decided_date: string | null; days: number | null; in_time: number | null;
  n_comments: number | null; n_documents: number | null; n_dwellings: number | null; land_type: string | null;
  in_green_belt: boolean | null; lat: number | null; lng: number | null; url: string | null;
};

export type SearchResponse = {
  total: number; page: number; page_size: number;
  facets: { outcome: { outcome: string; n: number }[] };
  results: Application[];
};

export type Scheme = {
  uid: string; n_dwellings: number; approved: boolean; applications: number; app_type: string; start_date: string;
  description: string | null; lat: number; lng: number; borough: string; url: string | null;
};

export type BrownfieldSite = {
  address: string | null; hectares: number; status: string; min_dwellings: number | null; max_dwellings: number | null;
  lat: number; lng: number; borough: string; url: string | null;
};

// Server components call FastAPI directly; the browser goes through the /api rewrite in next.config.ts.
const SERVER_BASE = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function api<T>(path: string): Promise<T> {
  const base = typeof window === "undefined" ? SERVER_BASE : "";
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new ApiError(res.status, `${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
