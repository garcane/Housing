"use client";

import * as Plot from "@observablehq/plot";
import { useRouter } from "next/navigation";
import { PlotBox, PLOT_STYLE } from "@/components/viz/usePlot";
import { C } from "@/components/viz/colors";
import { pct, shortName } from "@/lib/format";

type Row = { slug: string; name: string; approval_rate: number; median_days: number | null; decided: number };

/** Borough median decision time vs approval rate (section 7c). Labels only the extremes. */
export default function SpeedScatter({ rows, london, highlight }: { rows: Row[]; london: { approval: number; days: number }; highlight?: string }) {
  const router = useRouter();
  const data = rows.filter((r) => r.median_days != null);
  const byA = [...data].sort((a, b) => a.approval_rate - b.approval_rate);
  const byD = [...data].sort((a, b) => a.median_days! - b.median_days!);
  const labelled = new Set([byA[0], byA[1], byA.at(-1), byD[0], byD.at(-1), byD.at(-2), data.find((d) => d.slug === highlight)]
    .filter(Boolean).map((d) => d!.slug));

  return (
    <PlotBox
      deps={[rows, highlight]}
      minHeight={380}
      render={(width) => {
        const p = Plot.plot({
          width, height: 380, marginRight: 24, marginTop: 24, style: PLOT_STYLE,
          x: { label: "Median days to decision →", grid: true },
          y: { label: "↑ Approval rate", tickFormat: (d: number) => pct(d), grid: true },
          marks: [
            Plot.ruleX([london.days], { stroke: C.grid, strokeWidth: 1.5 }),
            Plot.ruleY([london.approval], { stroke: C.grid, strokeWidth: 1.5 }),
            Plot.text([`London median ${london.days} days`], { x: london.days, frameAnchor: "top", dy: -12, fill: C.ink2, textAnchor: "start", dx: 4 }),
            Plot.dot(data, {
              x: "median_days", y: "approval_rate", r: (d: Row) => Math.sqrt(d.decided) / 7,
              fill: (d: Row) => (highlight && d.slug !== highlight ? "#c4c7cc" : C.approved), fillOpacity: 0.85, stroke: "#fff", strokeWidth: 1.5,
            }),
            Plot.text(data.filter((d) => labelled.has(d.slug)), {
              x: "median_days", y: "approval_rate", text: (d: Row) => shortName(d.name), dy: -12, fill: C.ink, fontWeight: 500,
            }),
            Plot.tip(data, Plot.pointer({
              x: "median_days", y: "approval_rate",
              title: (d: Row) => `${d.name}\nApproval ${pct(d.approval_rate, 1)}\nMedian ${d.median_days} days\n${d.decided.toLocaleString("en-GB")} decided`,
            })),
          ],
        });
        p.addEventListener("click", () => {
          const v = (p as unknown as { value: Row | null }).value;
          if (v) router.push(`/borough/${v.slug}`);
        });
        return p;
      }}
    />
  );
}
