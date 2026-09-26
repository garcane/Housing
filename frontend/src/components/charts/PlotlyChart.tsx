"use client";

import { useEffect, useRef } from "react";
import type { Config, Data, Layout } from "plotly.js-dist-min";

const BASE_LAYOUT: Partial<Layout> = {
  font: { family: "Inter, system-ui, sans-serif", size: 12, color: "#41454d" },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  margin: { l: 56, r: 16, t: 16, b: 48 },
  hoverlabel: { bgcolor: "#ffffff", bordercolor: "#dddddd", font: { color: "#181d26", family: "Inter, system-ui, sans-serif" } },
  xaxis: { gridcolor: "#e4e3df", zeroline: false, linecolor: "#dddddd" },
  yaxis: { gridcolor: "#e4e3df", zeroline: false, linecolor: "#dddddd" },
  legend: { orientation: "h", y: -0.2 },
};

/** Thin wrapper around plotly.js (loaded lazily so it stays out of the main bundle). */
export default function PlotlyChart({ data, layout, height = 380 }: { data: Data[]; layout?: Partial<Layout>; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    import("plotly.js-dist-min").then((Plotly) => {
      if (cancelled || !el) return;
      const merged: Partial<Layout> = {
        ...BASE_LAYOUT, ...layout, height,
        xaxis: { ...BASE_LAYOUT.xaxis, ...layout?.xaxis },
        yaxis: { ...BASE_LAYOUT.yaxis, ...layout?.yaxis },
      };
      const config: Partial<Config> = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "toImage"] };
      Plotly.react(el, data, merged, config);
    });
    return () => {
      cancelled = true;
    };
  }, [data, layout, height]);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) import("plotly.js-dist-min").then((Plotly) => Plotly.purge(el));
    };
  }, []);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
