"use client";

import { useMemo } from "react";
import PlotlyChart from "./PlotlyChart";
import Figure from "@/components/viz/Figure";
import { C } from "@/components/viz/colors";
import { useApi } from "@/lib/useApi";
import { pct } from "@/lib/format";

type Row = { key: string; n: number; approval_rate: number; median_days: number | null };

/** Wards within a borough: median decision time vs approval rate (Plotly, zoomable). */
export default function WardScatter({ slug, boroughApproval, boroughDays }: { slug: string; boroughApproval: number; boroughDays: number | null }) {
  const { data, error } = useApi<{ ward: Row[] }>(`/api/authorities/${slug}/breakdowns`);
  const wards = useMemo(() => (data?.ward ?? []).filter((w) => w.median_days != null), [data]);

  const traces = useMemo(() => [{
    type: "scatter" as const,
    mode: "markers" as const,
    x: wards.map((w) => w.median_days),
    y: wards.map((w) => w.approval_rate),
    text: wards.map((w) => w.key),
    customdata: wards.map((w) => w.n),
    marker: { size: wards.map((w) => Math.max(8, Math.sqrt(w.n) * 1.6)), color: C.approved, opacity: 0.8, line: { color: "#fff", width: 1.5 } },
    hovertemplate: "<b>%{text}</b><br>Approval %{y:.1%}<br>Median %{x} days<br>%{customdata:,} decided<extra></extra>",
    name: "Wards",
  }], [wards]);

  const layout = useMemo(() => ({
    showlegend: false,
    xaxis: { title: { text: "Median days to decision" } },
    yaxis: { title: { text: "Approval rate" }, tickformat: ".0%" },
    shapes: [
      { type: "line" as const, xref: "paper" as const, x0: 0, x1: 1, y0: boroughApproval, y1: boroughApproval, line: { color: C.london, width: 1 } },
      ...(boroughDays != null ? [{ type: "line" as const, yref: "paper" as const, y0: 0, y1: 1, x0: boroughDays, x1: boroughDays, line: { color: C.london, width: 1 } }] : []),
    ],
  }), [boroughApproval, boroughDays]);

  return (
    <Figure
      title="Wards: speed vs approval"
      subtitle={`Wards with at least 30 decisions; marker size = decisions. Grey lines = borough average (${pct(boroughApproval)}${boroughDays != null ? `, ${boroughDays} days` : ""}). Drag to zoom, double-click to reset.`}
    >
      {error ? <p className="muted">Couldn&apos;t load: {error}</p>
        : !data ? <div className="skeleton" style={{ height: 380 }} />
        : wards.length < 3 ? <p className="muted">Not enough ward-level data for this authority.</p>
        : <PlotlyChart data={traces} layout={layout} />}
    </Figure>
  );
}
