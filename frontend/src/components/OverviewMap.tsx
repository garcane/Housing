"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import LondonMap, { RampLegend } from "@/components/map/LondonMap";
import ViewToggle, { extrusion } from "@/components/map/ViewToggle";
import Figure from "@/components/viz/Figure";
import { C, divergingFor, SEQ, SEQ_DARK, sequentialFor, surfaceFor } from "@/components/viz/colors";
import { useTheme } from "@/lib/theme";
import type { AuthoritySummary } from "@/lib/api";
import { num, ordinal, pct } from "@/lib/format";

type MetricKey = "approval_rate" | "median_days" | "in_time" | "approved_dwellings" | "approved_per_1000_people" | "density_per_km2" | "available_ha" | "green_belt_pct";

const METRICS: { key: MetricKey; label: string; fmt: (v: number) => string; rank?: keyof AuthoritySummary["ranks"] }[] = [
  { key: "approval_rate", label: "Approval rate", fmt: (v) => pct(v, 1), rank: "approval_rate" },
  { key: "median_days", label: "Median days to decision", fmt: (v) => `${num(v)} days`, rank: "median_days" },
  { key: "in_time", label: "Decided within statutory period", fmt: (v) => pct(v), rank: "in_time" },
  { key: "approved_dwellings", label: "Approved dwellings", fmt: num, rank: "approved_dwellings" },
  { key: "approved_per_1000_people", label: "Approved dwellings per 1,000 people", fmt: (v) => v.toFixed(1), rank: "approved_per_1000_people" },
  { key: "available_ha", label: "Available land (brownfield + industrial + greenfield)", fmt: (v) => `${num(v)} ha`, rank: "available_ha" },
  { key: "green_belt_pct", label: "Green Belt share of area", fmt: (v) => pct(v) },
  { key: "density_per_km2", label: "Population density (per km²)", fmt: num, rank: "density_per_km2" },
];

export default function OverviewMap({ authorities, londonApproval, nRanked }: { authorities: AuthoritySummary[]; londonApproval: number; nRanked: number }) {
  const router = useRouter();
  const [key, setKey] = useState<MetricKey>("approval_rate");
  const [threeD, setThreeD] = useState(false);
  const dark = useTheme() === "dark";
  const metric = METRICS.find((m) => m.key === key)!;
  const bySlug = useMemo(() => Object.fromEntries(authorities.map((a) => [a.slug, a])), [authorities]);

  const { fill, min, max, heights } = useMemo(() => {
    const vals = authorities.filter((a) => a.code && a[key] != null && a.kind === "borough").map((a) => a[key] as number);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const f: Record<string, string> = {};
    const h: Record<string, number> = {};
    for (const a of authorities) {
      const v = a[key] as number | null;
      if (!a.code || v == null) continue;
      f[a.slug] = key === "approval_rate" ? divergingFor(dark)(v, lo, londonApproval, hi) : sequentialFor(dark)((v - lo) / (hi - lo || 1));
      h[a.slug] = extrusion(Math.min(Math.max(v, lo), hi), lo, hi);
    }
    return { fill: f, min: lo, max: hi, heights: h };
  }, [authorities, key, londonApproval, dark]);

  return (
    <Figure
      title={metric.label}
      subtitle={threeD
        ? "Height and colour both show the measure. Click a borough to open its profile."
        : "Click a borough to open its profile. City of London is shown but not ranked."}
      pngName={`london-${key}`}
    >
      <div className="row" style={{ marginBottom: 16, alignItems: "flex-end" }} data-no-export>
        <label className="field" style={{ minWidth: 280 }}>
          <span>Colour boroughs by</span>
          <select className="select" value={key} onChange={(e) => setKey(e.target.value as MetricKey)}>
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <ViewToggle threeD={threeD} onChange={setThreeD} />
      </div>
      <LondonMap
        threeD={threeD}
        extrude={heights}
        ariaLabel={`Map of London boroughs coloured by ${metric.label}`}
        fill={fill}
        onSelect={(slug) => router.push(`/borough/${slug}`)}
        boroughTooltip={(slug) => {
          const a = bySlug[slug];
          if (!a) return null;
          const v = a[key] as number | null;
          const r = metric.rank ? a.ranks[metric.rank] : null;
          return (
            <>
              <b>{a.name}</b>
              <div>{metric.label}: {v == null ? "–" : metric.fmt(v)}</div>
              {r != null && <div className="muted">{ordinal(r)} of {key.startsWith("approval") || key === "median_days" || key === "in_time" ? nRanked : 32}</div>}
              {a.kind === "other" && <div className="muted">Not ranked (fewer than 100 decisions)</div>}
            </>
          );
        }}
      >
        {key === "approval_rate" ? (
          <RampLegend stops={[C.rejected, surfaceFor(dark).midpoint, C.approved]} min={pct(min)} max={pct(max)} label={`Approval rate · midpoint = London ${pct(londonApproval)}`} />
        ) : (
          <RampLegend stops={dark ? SEQ_DARK : SEQ} min={metric.fmt(min)} max={metric.fmt(max)} label={metric.label} />
        )}
      </LondonMap>
    </Figure>
  );
}
