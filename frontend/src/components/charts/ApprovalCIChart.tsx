"use client";

import * as Plot from "@observablehq/plot";
import { useRouter } from "next/navigation";
import { PlotBox, PLOT_STYLE } from "@/components/viz/usePlot";
import { C } from "@/components/viz/colors";
import { pct, shortName } from "@/lib/format";

type Row = { slug: string; name: string; approval_rate: number; ci_low: number; ci_high: number; decided: number };

/** Approval rate with 95% Wilson CI per borough, sorted; optional highlighted borough. */
export default function ApprovalCIChart({ rows, london, highlight }: { rows: Row[]; london: number; highlight?: string }) {
  const router = useRouter();
  const data = [...rows].sort((a, b) => b.approval_rate - a.approval_rate).map((r) => ({ ...r, label: shortName(r.name) }));
  const color = (d: Row) => (highlight ? (d.slug === highlight ? C.approved : "#c4c7cc") : C.approved);

  return (
    <PlotBox
      deps={[rows, london, highlight]}
      minHeight={data.length * 20 + 40}
      render={(width) => {
        const p = Plot.plot({
          width,
          height: data.length * 20 + 40,
          marginLeft: Math.min(170, width * 0.38),
          marginRight: 16,
          style: PLOT_STYLE,
          x: { domain: [0.5, 1], tickFormat: (d: number) => pct(d), grid: true, label: "Approval rate (decided full applications) →" },
          y: { domain: data.map((d) => d.label), label: null, tickSize: 0, tickFormat: (d: string) => (width < 480 && d.length > 15 ? `${d.slice(0, 14)}…` : d) },
          marks: [
            Plot.ruleX([london], { stroke: C.ink, strokeWidth: 1 }),
            Plot.text([london], { x: (d: number) => d, frameAnchor: "top", dy: -14, text: () => `London ${pct(london)}`, fill: C.ink, textAnchor: "start", dx: 4 }),
            Plot.ruleY(data, { y: "label", x1: "ci_low", x2: "ci_high", stroke: color, strokeWidth: 2, strokeLinecap: "round" }),
            Plot.dot(data, { y: "label", x: "approval_rate", r: 4.5, fill: color, stroke: "#fff", strokeWidth: 1.5 }),
            Plot.tip(data, Plot.pointerY({
              y: "label", x: "approval_rate",
              title: (d: Row) => `${d.name}\nApproval ${pct(d.approval_rate, 1)}\n95% CI ${pct(d.ci_low, 1)}–${pct(d.ci_high, 1)}\n${d.decided.toLocaleString("en-GB")} decided`,
            })),
          ],
        });
        p.addEventListener("click", () => {
          const v = (p as unknown as { value: Row | null }).value;
          if (v) router.push(`/borough/${v.slug}`);
        });
        p.style.cursor = "pointer";
        return p;
      }}
    />
  );
}
