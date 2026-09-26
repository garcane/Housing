"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders an Observable Plot into a div and re-renders on width change.
 * `render` receives the container width and returns the Plot element.
 */
export function PlotBox({
  render,
  deps,
  minHeight = 120,
}: {
  render: (width: number) => (HTMLElement | SVGSVGElement) | null;
  deps: unknown[];
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const node = render(width);
    el.replaceChildren(...(node ? [node] : []));
    return () => node?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, ...deps]);

  return <div ref={ref} className="plot" style={{ minHeight }} />;
}

export const PLOT_STYLE = {
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  fontSize: "12px",
  color: "#41454d",
  background: "transparent",
  overflow: "visible",
};
