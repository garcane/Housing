"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PlotlyChart from "@/components/charts/PlotlyChart";
import Figure, { Key } from "@/components/viz/Figure";
import { PlotBox, PLOT_STYLE } from "@/components/viz/usePlot";
import { C, SERIES } from "@/components/viz/colors";
import { api, type Authority, type AuthoritySummary, type London, type TrendRow } from "@/lib/api";
import { days, ha, num, pct, shortName } from "@/lib/format";

type Metric = { label: string; get: (a: Authority) => number | null | undefined; london?: (l: London) => number | null; fmt: (v: number) => string; bar?: boolean };

const METRICS: { group: string; rows: Metric[] }[] = [
  { group: "Approvals", rows: [
    { label: "Full applications", get: (a) => a.total_full, fmt: num },
    { label: "Decided", get: (a) => a.decided, london: (l) => l.counts.decided, fmt: num },
    { label: "Approval rate", get: (a) => a.approval_rate, london: (l) => l.approval_rate, fmt: (v) => pct(v, 1), bar: true },
    { label: "Withdrawal rate", get: (a) => a.withdrawal_rate, london: (l) => l.withdrawal_rate, fmt: (v) => pct(v, 1) },
  ] },
  { group: "Decision times", rows: [
    { label: "Median days", get: (a) => a.median_days, london: (l) => l.median_days, fmt: (v) => days(v), bar: true },
    { label: "90th percentile days", get: (a) => a.p90, fmt: (v) => days(v) },
    { label: "Within statutory period", get: (a) => a.in_time, london: (l) => l.in_time, fmt: (v) => pct(v), bar: true },
    { label: "Decided at committee", get: (a) => a.committee_share, london: (l) => l.means.committee_share, fmt: (v) => pct(v, 1) },
  ] },
  { group: "Homes", rows: [
    { label: "Dwellings approved", get: (a) => a.dwellings?.approved_dwellings, london: (l) => l.dwellings.approved, fmt: num },
    { label: "Approved per 1,000 people", get: (a) => a.dwellings?.approved_per_1000_people, london: (l) => l.means.approved_per_1000_people, fmt: (v) => v.toFixed(1), bar: true },
    { label: "Median scheme size", get: (a) => a.dwellings?.median_scheme_size, fmt: num },
  ] },
  { group: "Land & population", rows: [
    { label: "Population", get: (a) => a.land?.population, london: (l) => l.land.population, fmt: num },
    { label: "People per km²", get: (a) => a.land?.density_per_km2, london: (l) => l.land.density_per_km2, fmt: num },
    { label: "Brownfield register", get: (a) => a.land?.brownfield_ha, london: (l) => l.land.brownfield_ha, fmt: ha },
    { label: "Available land share", get: (a) => a.land?.available_pct, london: (l) => l.means.available_pct, fmt: (v) => pct(v, 1), bar: true },
    { label: "Green Belt share", get: (a) => a.land?.green_belt_pct, london: (l) => l.land.green_belt_ha / l.land.area_ha, fmt: (v) => pct(v) },
  ] },
];

export default function CompareView({ authorities, slots, details, london }: {
  authorities: AuthoritySummary[]; slots: string[]; details: (Authority | null)[]; london: London;
}) {
  const router = useRouter();
  const path = usePathname();
  const chosen = slots.map((s, i) => ({ slot: i, slug: s, a: details[i] })).filter((x): x is { slot: number; slug: string; a: Authority } => !!x.a);
  const setSlots = (next: string[]) => router.replace(`${path}?b=${next.join(",").replace(/,+$/, "")}`, { scroll: false });
  const free = slots.findIndex((s) => !s);

  // Trends for each selected authority
  const [trends, setTrends] = useState<Record<string, TrendRow[]>>({});
  const key = chosen.map((c) => c.slug).join(",");
  useEffect(() => {
    let live = true;
    Promise.all(chosen.map((c) => api<{ authority: TrendRow[] }>(`/api/trends?slug=${c.slug}`).then((r) => [c.slug, r.authority] as const)))
      .then((pairs) => live && setTrends(Object.fromEntries(pairs)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const trendTraces = (field: "approval_rate" | "median_days") => chosen.map((c) => {
    const rows = trends[c.slug] ?? [];
    return {
      type: "scatter" as const, mode: "lines+markers" as const, name: shortName(c.a.name),
      x: rows.map((r) => r.quarter), y: rows.map((r) => r[field]),
      line: { color: SERIES[c.slot], width: 2 }, marker: { size: 6, color: SERIES[c.slot], line: { color: "#fff", width: 1 } },
      hovertemplate: `<b>${c.a.name}</b><br>%{x}: %{y${field === "approval_rate" ? ":.1%" : ""}}<extra></extra>`,
    };
  });
  const approvalTraces = useMemo(() => trendTraces("approval_rate"), [trends, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayTraces = useMemo(() => trendTraces("median_days"), [trends, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const censoredLayout = (fmt?: string) => ({
    yaxis: { tickformat: fmt },
    xaxis: { type: "category" as const },
    shapes: [{ type: "rect" as const, xref: "x" as const, yref: "paper" as const, x0: "2025Q1", x1: "2025Q4", y0: 0, y1: 1, fillcolor: C.censored, line: { width: 0 }, layer: "below" as const }],
    legend: { orientation: "h" as const, y: -0.25 },
  });
  const approvalLayout = useMemo(() => censoredLayout(".0%"), []);
  const daysLayout = useMemo(() => censoredLayout(), []);

  const legend = chosen.map((c) => <Key key={c.slug} color={SERIES[c.slot]} label={shortName(c.a.name)} />);

  return (
    <div className="stack-lg">
      {/* Picker */}
      <div className="card-soft row" style={{ gap: 12 }}>
        {chosen.map((c) => (
          <span key={c.slug} className="chip" style={{ padding: "6px 8px 6px 12px" }}>
            <i className="swatch" style={{ background: SERIES[c.slot] }} />
            <Link href={`/borough/${c.slug}`} style={{ color: "inherit" }}>{c.a.name}</Link>
            <button aria-label={`Remove ${c.a.name}`} onClick={() => setSlots(slots.map((s, i) => (i === c.slot ? "" : s)))}
              style={{ border: 0, background: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--muted)" }}>×</button>
          </span>
        ))}
        {free >= 0 && (
          <select className="select" value="" aria-label="Add an authority"
            onChange={(e) => e.target.value && setSlots(slots.map((s, i) => (i === free ? e.target.value : s)))}>
            <option value="">+ Add borough…</option>
            {authorities.filter((a) => !slots.includes(a.slug)).map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        )}
        <span style={{ flex: 1 }} />
        {chosen.length > 0 && <a className="btn btn-secondary btn-sm" href={`/api/compare/export.csv?slugs=${key}`} download>Download CSV</a>}
      </div>

      {chosen.length === 0 ? <p className="muted">Add a borough to start.</p> : (
        <>
          {/* Key-metric bars */}
          <div className="grid-2">
            {METRICS.flatMap((g) => g.rows).filter((m) => m.bar).map((m) => (
              <Figure key={m.label} title={m.label} subtitle="Grey line = London" pngName={`compare-${m.label}`}>
                <MetricBars metric={m} chosen={chosen} london={m.london?.(london) ?? null} />
              </Figure>
            ))}
          </div>

          {/* Trends */}
          <div className="grid-2">
            <Figure title="Approval rate by start quarter" subtitle="Shaded: 2025 cohorts still being decided" legend={legend}>
              <PlotlyChart data={approvalTraces} layout={approvalLayout} height={340} />
            </Figure>
            <Figure title="Median days to decision by start quarter" subtitle="Shaded: 2025 cohorts still being decided" legend={legend}>
              <PlotlyChart data={dayTraces} layout={daysLayout} height={340} />
            </Figure>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Measure</th>
                  {chosen.map((c) => (
                    <th key={c.slug} className="num">
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}><i className="swatch" style={{ background: SERIES[c.slot] }} />{shortName(c.a.name)}</span>
                    </th>
                  ))}
                  <th className="num">London</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((g) => (
                  <GroupRows key={g.group} group={g} chosen={chosen} london={london} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GroupRows({ group, chosen, london }: { group: (typeof METRICS)[number]; chosen: { slug: string; a: Authority }[]; london: London }) {
  return (
    <>
      <tr><td colSpan={chosen.length + 2} className="eyebrow" style={{ background: "var(--surface-soft)" }}>{group.group}</td></tr>
      {group.rows.map((m) => {
        const lv = m.london?.(london);
        return (
          <tr key={m.label}>
            <td>{m.label}</td>
            {chosen.map((c) => { const v = m.get(c.a); return <td key={c.slug} className="num">{v == null ? "–" : m.fmt(v)}</td>; })}
            <td className="num muted">{lv == null ? "–" : m.fmt(lv)}</td>
          </tr>
        );
      })}
    </>
  );
}

function MetricBars({ metric, chosen, london }: { metric: Metric; chosen: { slot: number; slug: string; a: Authority }[]; london: number | null }) {
  const rows = chosen.map((c) => ({ name: shortName(c.a.name), v: metric.get(c.a), color: SERIES[c.slot] })).filter((r) => r.v != null) as { name: string; v: number; color: string }[];
  return (
    <PlotBox
      deps={[rows.map((r) => r.name + r.v).join(), london]}
      minHeight={rows.length * 36 + 30}
      render={(width) => Plot.plot({
        width, height: rows.length * 36 + 30, marginLeft: Math.min(160, width * 0.35), marginRight: 70, style: PLOT_STYLE,
        x: { grid: true, label: null, tickFormat: metric.fmt, ticks: 4 },
        y: { domain: rows.map((r) => r.name), label: null, tickSize: 0 },
        marks: [
          Plot.barX(rows, { y: "name", x: "v", fill: (d: { color: string }) => d.color, rx: 4, insetTop: 6, insetBottom: 6 }),
          Plot.text(rows, { y: "name", x: "v", text: (d: { v: number }) => metric.fmt(d.v), dx: 6, textAnchor: "start", fill: C.ink }),
          ...(london != null ? [Plot.ruleX([london], { stroke: C.ink2, strokeWidth: 1.5 })] : []),
          Plot.ruleX([0], { stroke: C.grid }),
        ],
      })}
    />
  );
}
