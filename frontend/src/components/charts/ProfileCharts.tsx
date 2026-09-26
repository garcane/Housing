"use client";

import * as Plot from "@observablehq/plot";
import { PlotBox, PLOT_STYLE } from "@/components/viz/usePlot";
import { C, LAND_COLORS, OUTCOME_COLORS } from "@/components/viz/colors";
import { pct, shortName } from "@/lib/format";

const OUTCOMES = ["Approved", "Rejected", "Withdrawn", "Undecided"] as const;

/** Share of all full applications by outcome: borough vs London, 100% stacked. */
export function OutcomeShareBar({ name, borough, london }: {
  name: string;
  borough: Record<(typeof OUTCOMES)[number], number>;
  london: Record<(typeof OUTCOMES)[number], number>;
}) {
  const rows = [
    ...toShares(shortName(name), borough),
    ...toShares("London", london),
  ];
  return (
    <PlotBox
      deps={[name, borough, london]}
      minHeight={130}
      render={(width) => Plot.plot({
        width, height: 130, marginLeft: Math.min(150, width * 0.3), marginRight: 8, style: PLOT_STYLE,
        x: { tickFormat: (d: number) => pct(d), label: null, domain: [0, 1] },
        y: { label: null, tickSize: 0, domain: [shortName(name), "London"] },
        color: { domain: [...OUTCOMES], range: OUTCOMES.map((o) => OUTCOME_COLORS[o]) },
        marks: [
          Plot.barX(rows, Plot.stackX({ x: "share", y: "who", fill: "outcome", order: [...OUTCOMES], inset: 1, rx: 3,
            title: (d: Share) => `${d.who}\n${d.outcome}: ${pct(d.share, 1)} (${d.n.toLocaleString("en-GB")})` })),
          Plot.text(rows.filter((d) => d.share > 0.09), Plot.stackX({ x: "share", y: "who", z: "outcome", order: [...OUTCOMES], text: (d: Share) => pct(d.share), fill: "#fff", fontWeight: 500 })),
          Plot.tip(rows, Plot.pointer(Plot.stackX({ x: "share", y: "who", z: "outcome", order: [...OUTCOMES],
            title: (d: Share) => `${d.who}\n${d.outcome}: ${pct(d.share, 1)} (${d.n.toLocaleString("en-GB")})` }))),
        ],
      })}
    />
  );
}

type Share = { who: string; outcome: string; share: number; n: number };
function toShares(who: string, counts: Record<string, number>): Share[] {
  const total = OUTCOMES.reduce((s, o) => s + (counts[o] ?? 0), 0) || 1;
  return OUTCOMES.map((o) => ({ who, outcome: o, share: (counts[o] ?? 0) / total, n: counts[o] ?? 0 }));
}

/** Approval rate by application size: borough (blue dot) vs London (grey tick). */
export function SizeCompare({ borough, london }: {
  borough: { size: string; n: number; approval_rate: number }[];
  london: { size: string; n: number; approval_rate: number }[];
}) {
  const sizes = ["Small", "Medium", "Large"];
  const b = borough.filter((d) => d.n >= 10);
  return (
    <PlotBox
      deps={[borough, london]}
      minHeight={170}
      render={(width) => Plot.plot({
        width, height: 170, marginLeft: 70, marginRight: 80, style: PLOT_STYLE,
        x: { domain: [0.4, 1], tickFormat: (d: number) => pct(d), grid: true, label: "Approval rate →" },
        y: { domain: sizes, label: null, tickSize: 0 },
        marks: [
          Plot.link(sizes.map((s) => ({ s, a: b.find((d) => d.size === s)?.approval_rate, l: london.find((d) => d.size === s)?.approval_rate }))
            .filter((d) => d.a != null && d.l != null), { y1: "s", y2: "s", x1: "l", x2: "a", stroke: C.grid, strokeWidth: 3 }),
          Plot.tickX(london, { y: "size", x: "approval_rate", stroke: C.london, strokeWidth: 2.5 }),
          Plot.dot(b, { y: "size", x: "approval_rate", r: 6, fill: C.approved, stroke: "#fff", strokeWidth: 1.5 }),
          // decision counts in a column right of the plot, clear of the marks
          Plot.text(b, { y: "size", x: 1, text: (d: { n: number }) => `n = ${d.n.toLocaleString("en-GB")}`, dx: 10, textAnchor: "start", fill: C.ink2 }),
          Plot.tip(b, Plot.pointerY({ y: "size", x: "approval_rate", title: (d: { size: string; n: number; approval_rate: number }) =>
            `${d.size}: ${pct(d.approval_rate, 1)} (${d.n.toLocaleString("en-GB")} decided)\nLondon: ${pct(london.find((l) => l.size === d.size)?.approval_rate, 1)}` })),
        ],
      })}
    />
  );
}

/** Available land as a share of borough area, by type, vs the London borough average. */
export function LandShareBar({ name, borough, london }: {
  name: string;
  borough: { brownfield_pct: number; industrial_pct: number; greenfield_pct: number };
  london: { brownfield_pct: number; industrial_pct: number; greenfield_pct: number };
}) {
  const types = [["Brownfield", "brownfield_pct"], ["Industrial", "industrial_pct"], ["Virgin / greenfield", "greenfield_pct"]] as const;
  const rows = [
    ...types.map(([t, k]) => ({ who: shortName(name), type: t, share: borough[k] })),
    ...types.map(([t, k]) => ({ who: "London", type: t, share: london[k] })),
  ];
  const total = (d: typeof borough) => types.reduce((s, [, k]) => s + d[k], 0);
  const max = Math.max(0.05, total(borough), total(london));
  return (
    <PlotBox
      deps={[name, borough, london]}
      minHeight={120}
      render={(width) => Plot.plot({
        width, height: 120, marginLeft: Math.min(150, width * 0.3), marginRight: 16, style: PLOT_STYLE,
        x: { domain: [0, max * 1.05], tickFormat: (d: number) => pct(d), label: "Share of borough area →", grid: true },
        y: { label: null, tickSize: 0, domain: [shortName(name), "London"] },
        color: { domain: types.map(([t]) => t), range: types.map(([t]) => LAND_COLORS[t]) },
        marks: [
          Plot.barX(rows, Plot.stackX({ x: "share", y: "who", fill: "type", inset: 1, rx: 3 })),
          Plot.tip(rows, Plot.pointer(Plot.stackX({ x: "share", y: "who", z: "type", title: (d: { who: string; type: string; share: number }) => `${d.who}\n${d.type}: ${pct(d.share, 1)} of area` }))),
        ],
      })}
    />
  );
}
