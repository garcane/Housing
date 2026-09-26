"use client";

import { toPng } from "html-to-image";
import { useRef, useState, type ReactNode } from "react";

/** Chart frame: title, subtitle, legend slot, and PNG / CSV export. */
export default function Figure({
  title,
  subtitle,
  legend,
  note,
  csvHref,
  pngName,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  note?: ReactNode;
  csvHref?: string;
  pngName?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function savePng() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pngName ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <figure className={`figure ${className}`} ref={ref} style={{ margin: 0 }}>
      <div className="figure-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="row" data-no-export style={{ gap: 6, flex: "none" }}>
          {csvHref && (
            <a className="btn btn-secondary btn-sm" href={csvHref} download>
              CSV
            </a>
          )}
          <button className="btn btn-secondary btn-sm" onClick={savePng} disabled={busy} aria-label={`Download ${title} as PNG`}>
            {busy ? "…" : "PNG"}
          </button>
        </div>
      </div>
      {legend && <div className="legend">{legend}</div>}
      {children}
      {note && <figcaption className="figure-note">{note}</figcaption>}
    </figure>
  );
}

export function Key({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <span>
      <i className="swatch" style={line ? { background: color, height: 2, width: 14, borderRadius: 1 } : { background: color }} />
      {label}
    </span>
  );
}
