"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OUTCOME_COLORS } from "@/components/viz/colors";
import type { SearchResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { num } from "@/lib/format";

const FILTER_KEYS = ["slug", "q", "outcome", "size", "year", "land_type", "route", "green_belt"] as const;
const SORTS = { newest: "Newest first", oldest: "Oldest first", slowest: "Slowest decision", fastest: "Fastest decision", most_comments: "Most comments", most_dwellings: "Most dwellings" };

export default function SearchView({ authorities, filters }: {
  authorities: { slug: string; name: string }[];
  filters: { outcome: string[]; size: string[]; year: number[]; land_type: string[]; route: string[] };
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  // debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set({ q: q || null }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filterQs = new URLSearchParams();
  FILTER_KEYS.forEach((k) => { const v = sp.get(k); if (v) filterQs.set(k, v); });
  const page = Number(sp.get("page") ?? 1);
  const sort = sp.get("sort") ?? "newest";
  const listQs = new URLSearchParams(filterQs);
  listQs.set("page", String(page));
  listQs.set("sort", sort);
  const { data, error, loading } = useApi<SearchResponse>(`/api/applications?${listQs.toString()}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const sel = (key: string, label: string, options: (string | number)[], names?: Record<string, string>) => (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={sp.get(key) ?? ""} onChange={(e) => set({ [key]: e.target.value || null })}>
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{names?.[o] ?? o}</option>)}
      </select>
    </label>
  );

  return (
    <div className="stack-lg">
      <div className="card-soft stack">
        <label className="field">
          <span>Search</span>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. basement, loft conversion, 23/01234/FUL, Highgate" style={{ width: "100%" }} />
        </label>
        <div className="grid-4" style={{ gap: 16 }}>
          {sel("slug", "Authority", authorities.map((a) => a.slug), Object.fromEntries(authorities.map((a) => [a.slug, a.name])))}
          {sel("outcome", "Outcome", filters.outcome, { Rejected: "Refused" })}
          {sel("size", "Size", filters.size)}
          {sel("year", "Start year", filters.year)}
          {sel("land_type", "Land type", filters.land_type)}
          {sel("route", "Decision route", filters.route)}
          {sel("green_belt", "Green Belt", ["true", "false"], { true: "In Green Belt", false: "Outside Green Belt" })}
          <label className="field">
            <span>Sort</span>
            <select className="select" value={sort} onChange={(e) => set({ sort: e.target.value })}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="spread" style={{ alignItems: "center" }}>
        <div className="row" aria-live="polite">
          <span className="label-md">{data ? `${num(data.total)} applications` : loading ? "Searching…" : ""}</span>
          {data?.facets.outcome.map((f) => (
            <span key={f.outcome} className="chip"><i className="swatch" style={{ background: OUTCOME_COLORS[f.outcome] }} />{f.outcome === "Rejected" ? "Refused" : f.outcome} {num(f.n)}</span>
          ))}
        </div>
        <div className="row">
          {[...filterQs.keys()].length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => { setQ(""); router.replace(path); }}>Clear filters</button>}
          <a className="btn btn-secondary btn-sm" href={`/api/applications/export.csv?${filterQs.toString()}`} download>Export CSV{data && data.total > 50000 ? " (first 50,000)" : ""}</a>
        </div>
      </div>

      {error && <p className="notice">Couldn&apos;t load results: {error}</p>}

      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
        <table className="data">
          <thead>
            <tr><th>Application</th><th>Description</th><th>Outcome</th><th className="num">Days</th><th>Size</th><th>Land</th><th /></tr>
          </thead>
          <tbody>
            {data?.results.map((r) => (
              <tr key={r.uid + r.authority}>
                <td style={{ minWidth: 170 }}>
                  <div style={{ color: "var(--ink)", fontWeight: 500 }}>{r.uid}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    <Link href={`/borough/${r.slug}`} style={{ fontWeight: 400, color: "var(--muted)" }}>{r.authority}</Link>
                    {r.ward_name ? ` · ${r.ward_name}` : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{r.start_date?.slice(0, 10)}</div>
                </td>
                <td style={{ maxWidth: 480 }}>{r.description}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className="row" style={{ gap: 6 }}><i className="swatch" style={{ background: OUTCOME_COLORS[r.outcome] }} />{r.outcome === "Rejected" ? "Refused" : r.outcome}</span>
                  {r.route !== "Unknown" && <div className="muted" style={{ fontSize: 13 }}>{r.route}</div>}
                </td>
                <td className="num">{r.days == null ? "–" : num(r.days)}</td>
                <td>{r.app_size ?? "–"}{r.n_dwellings ? <div className="muted" style={{ fontSize: 13 }}>{num(r.n_dwellings)} homes</div> : null}</td>
                <td style={{ whiteSpace: "nowrap" }}>{r.land_type ?? "–"}{r.in_green_belt ? <div className="muted" style={{ fontSize: 13 }}>Green Belt</div> : null}</td>
                <td>{r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ whiteSpace: "nowrap" }}>Council record ↗</a>}</td>
              </tr>
            ))}
            {data && data.results.length === 0 && <tr><td colSpan={7} className="muted">No applications match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {data && pages > 1 && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>← Previous</button>
          <span className="muted">Page {page} of {num(pages)}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next →</button>
        </div>
      )}
    </div>
  );
}
