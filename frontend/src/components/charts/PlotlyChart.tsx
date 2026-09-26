"use client";

import { useEffect, useRef } from "react";
import type { Config, Data, Layout } from "plotly.js-dist-min";
import { surfaceFor } from "@/components/viz/colors";
import { useTheme } from "@/lib/theme";

function baseLayout(dark: boolean): Partial<Layout> {
  const s = surfaceFor(dark);
  return {
    font: { family: "Inter, system-ui, sans-serif", size: 12, color: s.text },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 16, t: 16, b: 48 },
    hoverlabel: { bgcolor: s.canvas, bordercolor: s.line, font: { color: s.ink, family: "Inter, system-ui, sans-serif" } },
    xaxis: { gridcolor: s.grid, zeroline: false, linecolor: s.line },
    yaxis: { gridcolor: s.grid, zeroline: false, linecolor: s.line },
    legend: { orientation: "h", y: -0.2 },
  };
}

/** Thin wrapper around plotly.js (loaded lazily so it stays out of the main bundle). */
export default function PlotlyChart({ data, layout, height = 380 }: { data: Data[]; layout?: Partial<Layout>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = useTheme() === "dark";

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    import("plotly.js-dist-min").then((Plotly) => {
      if (cancelled || !el) return;
      const base = baseLayout(dark);
      const merged: Partial<Layout> = {
        ...base, ...layout, height,
        xaxis: { ...base.xaxis, ...layout?.xaxis },
        yaxis: { ...base.yaxis, ...layout?.yaxis },
      };
      const config: Partial<Config> = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "toImage"] };
      Plotly.react(el, data, merged, config);
    });
    return () => {
      cancelled = true;
    };
  }, [data, layout, height, dark]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) import("plotly.js-dist-min").then((Plotly) => Plotly.purge(el));
    };
  }, []);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
