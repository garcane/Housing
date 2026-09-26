"use client";

import * as Plot from "@observablehq/plot";
import { PlotBox, PLOT_STYLE } from "@/components/viz/usePlot";
import Figure, { Key } from "@/components/viz/Figure";
import { C } from "@/components/viz/colors";
import type { TrendRow } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { pct, shortName } from "@/lib/format";

type Bin = { from: number; to: number | null; authority: number; london: number; n: number };

/** Distribution of days to decision (shares), borough bars vs London line; 56-day target marked. */
export function DecisionHistogram({ slug, name }: { slug: string; name: string }) {
  const { data, error } = useApi<{ bin_days: number; cap: number; bins: Bin[] }>(`/api/authorities/${slug}/decision-times`);
  return (
    <Figure
      title="How long decisions take"
      subtitle={`Share of decided applications by days to decision (2-week bins; the last bin is 365+ days).`}
      legend={<><Key color={C.approved} label={shortName(name)} /><Key color={C.ink} label="London" line /></>}
    >
      {error ? <p className="muted">Couldn&apos;t load: {error}</p> : !data ? <div className="skeleton" style={{ height: 260 }} /> : (
        <PlotBox
          deps={[data]}
          minHeight={260}
          render={(width) => {
            const bins = data.bins.map((b) => ({ ...b, mid: b.from + data.bin_days / 2, to: b.to ?? b.from + data.bin_days }));
            return Plot.plot({
              width, height: 260, marginTop: 24, style: PLOT_STYLE,
              x: { label: "Days to decision →", domain: [0, data.cap + data.bin_days] },
              y: { label: "↑ Share", tickFormat: (d: number) => pct(d), grid: true },
              marks: [
                Plot.rectY(bins, { x1: "from", x2: "to", y: "authority", fill: C.approved, inset: 1, rx: 2 }),
                Plot.line(bins, { x: "mid", y: "london", stroke: C.ink, strokeWidth: 2, curve: "step" }),
                Plot.ruleX([56], { stroke: C.ink2, strokeWidth: 1 }),
                Plot.text(["8-week target"], { x: 56, frameAnchor: "top", dy: -14, dx: 4, textAnchor: "start", fill: C.ink2 }),
                Plot.tip(bins, Plot.pointerX({ x: "mid", y: "authority", title: (d: Bin) =>
                  `${d.from}${d.to && d.from < data.cap ? `–${d.to - 1}` : "+"} days\n${shortName(name)}: ${pct(d.authority, 1)} (${d.n})\nLondon: ${pct(d.london, 1)}` })),
              ],
            });
          }}
        />
      )}
    </Figure>
  );
}

const TREND_PANELS = [
  { key: "approval_rate", title: "Approval rate", fmt: (d: number) => pct(d) },
  { key: "median_days", title: "Median days to decision", fmt: (d: number) => `${d}` },
  { key: "undecided", title: "Share still undecided", fmt: (d: number) => pct(d) },
] as const;

/** Quarterly cohorts (small multiples, one axis each). Shaded quarters are right-censored. */
export function TrendPanels({ slug, name }: { slug: string; name: string }) {
  const { data, error } = useApi<{ london: TrendRow[]; authority: TrendRow[] }>(`/api/trends?slug=${slug}`);
  return (
    <Figure
      title="Trends by quarter the application started"
      subtitle="Shaded quarters still have more than 10% of applications undecided, so they will shift as slower cases are decided."
      legend={<><Key color={C.approved} label={shortName(name)} line /><Key color={C.london} label="London" line /></>}
    >
      {error ? <p className="muted">Couldn&apos;t load: {error}</p> : !data ? <div className="skeleton" style={{ height: 220 }} /> : (
        <div className="grid-3">
          {TREND_PANELS.map((p) => (
            <div key={p.key}>
              <div className="caption" style={{ marginBottom: 4 }}>{p.title}</div>
              <PlotBox
                deps={[data]}
                minHeight={200}
                render={(width) => {
                  const rows = [
                    ...data.london.map((r) => ({ ...r, who: "London" })),
                    ...data.authority.map((r) => ({ ...r, who: shortName(name) })),
                  ].filter((r) => r[p.key] != null);
                  const censored = data.authority.filter((r) => r.undecided > 0.1).map((r) => r.quarter);
                  const quarters = data.london.map((r) => r.quarter);
                  return Plot.plot({
                    width, height: 200, marginLeft: 44, marginBottom: 36, style: PLOT_STYLE,
                    x: { type: "point", domain: quarters, label: null, tickFormat: (q: string) => (q.endsWith("Q1") ? q.slice(0, 4) : ""), tickSize: 0 },
                    y: { tickFormat: p.fmt, grid: true, label: null, zero: p.key === "undecided" },
                    color: { domain: ["London", shortName(name)], range: [C.london, C.approved] },
                    marks: [
                      // full-height band per censored quarter, without touching the y scale
                      Plot.ruleX(censored, { x: (d: string) => d, stroke: C.censored, strokeWidth: Math.max(4, ((width - 60) / quarters.length) * 0.95) }),
                      Plot.line(rows, { x: "quarter", y: p.key, stroke: "who", strokeWidth: 2 }),
                      Plot.dot(rows.filter((r) => r.who !== "London"), { x: "quarter", y: p.key, r: 3, fill: C.approved, stroke: "#fff" }),
                      Plot.tip(rows, Plot.pointerX({ x: "quarter", y: p.key, stroke: "who", title: (d: TrendRow & { who: string }) =>
                        `${d.who} · ${d.quarter}\n${p.title}: ${p.fmt(d[p.key] as number)}\n${d.n.toLocaleString("en-GB")} applications` })),
                    ],
                  });
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Figure>
  );
}
