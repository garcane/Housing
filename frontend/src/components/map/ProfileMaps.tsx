"use client";

import { ScatterplotLayer } from "@deck.gl/layers";
import { useMemo, useState } from "react";
import LondonMap from "./LondonMap";
import Figure, { Key } from "@/components/viz/Figure";
import { BROWNFIELD_COLORS, C, LAND_COLORS, OUTCOME_COLORS, rgba } from "@/components/viz/colors";
import type { BrownfieldSite, Scheme } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { num } from "@/lib/format";

/** Housing schemes in one borough; dot area = dwellings. */
export function HomesMap({ slug }: { slug: string }) {
  const { data } = useApi<Scheme[]>(`/api/points/schemes?slug=${slug}`);
  const layers = useMemo(() => data ? [new ScatterplotLayer<Scheme>({
    id: "schemes",
    data,
    getPosition: (d) => [d.lng, d.lat],
    getRadius: (d) => Math.sqrt(d.n_dwellings) * 9,
    radiusUnits: "meters",
    radiusMinPixels: 4,
    getFillColor: (d) => (d.approved ? rgba(C.approved, 200) : rgba(C.neutral, 170)),
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 1.5,
    stroked: true,
    pickable: true,
  })] : [], [data]);

  return (
    <Figure
      title="Where the homes are"
      subtitle="De-duplicated Full and Outline schemes with a published dwelling count. Dot area = dwellings. Hover for the scheme."
      legend={<><Key color={C.approved} label="Approved" /><Key color={C.neutral} label="Not approved (refused, withdrawn or pending)" /></>}
      note={data && `${data.length} schemes · ${num(data.reduce((s, d) => s + d.n_dwellings, 0))} dwellings proposed`}
    >
      <LondonMap
        ariaLabel="Map of housing schemes"
        highlight={slug}
        layers={layers}
        className="map-sm"
        deckTooltip={({ object }) => {
          const d = object as Scheme | undefined;
          if (!d) return null;
          return (
            <>
              <b>{num(d.n_dwellings)} homes</b> · {d.approved ? "approved" : "not approved"}
              <div className="muted">{d.start_date?.slice(0, 10)} · {d.app_type} · {d.applications} linked application{d.applications > 1 ? "s" : ""}</div>
              <div style={{ marginTop: 4 }}>{d.description?.slice(0, 180)}{(d.description?.length ?? 0) > 180 ? "…" : ""}</div>
            </>
          );
        }}
      />
    </Figure>
  );
}

type PointsResp = { outcomes: string[]; sizes: string[]; points: [number, number, number, number][] };

/** Brownfield register sites + optional Green Belt, OSM land use and application points. */
export function LandMap({ slug }: { slug: string }) {
  const [show, setShow] = useState({ brownfield: true, greenBelt: true, landuse: false, apps: false });
  const { data: sites } = useApi<BrownfieldSite[]>(`/api/points/brownfield?slug=${slug}`);
  const { data: apps } = useApi<PointsResp>(show.apps ? `/api/points/applications?slug=${slug}` : null);

  const layers = useMemo(() => {
    const out = [];
    if (show.apps && apps) {
      out.push(new ScatterplotLayer<[number, number, number, number]>({
        id: "apps", data: apps.points, getPosition: (d) => [d[0], d[1]], getRadius: 2.5, radiusUnits: "pixels",
        getFillColor: (d) => rgba(OUTCOME_COLORS[apps.outcomes[d[2]]], d[2] === 1 ? 220 : 110), pickable: false,
      }));
    }
    if (show.brownfield && sites) {
      out.push(new ScatterplotLayer<BrownfieldSite>({
        id: "brownfield", data: sites, getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => Math.max(20, Math.sqrt((d.hectares * 1e4) / Math.PI)), radiusUnits: "meters", radiusMinPixels: 3,
        getFillColor: (d) => rgba(BROWNFIELD_COLORS[d.status] ?? C.neutral, 200), getLineColor: [255, 255, 255, 255],
        stroked: true, lineWidthMinPixels: 1, pickable: true,
      }));
    }
    return out;
  }, [show.apps, show.brownfield, apps, sites]);

  const toggle = (k: keyof typeof show, label: string) => (
    <label className="chip" style={{ cursor: "pointer" }}>
      <input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} /> {label}
    </label>
  );

  return (
    <Figure
      title="Land: brownfield, Green Belt and land use"
      subtitle="Brownfield register sites sized by hectares, coloured by permission status."
      legend={<>
        {show.brownfield && Object.entries(BROWNFIELD_COLORS).map(([k, c]) => <Key key={k} color={c} label={k} />)}
        {show.greenBelt && <Key color="#a5dfc9" label="Green Belt" />}
        {show.landuse && <><Key color={LAND_COLORS.Industrial} label="Industrial (OSM)" /><Key color={LAND_COLORS["Virgin / greenfield"]} label="Greenfield (OSM)" /></>}
        {show.apps && <><Key color={C.approved} label="Approved application" /><Key color={C.rejected} label="Refused application" /></>}
      </>}
    >
      <div className="row" style={{ marginBottom: 12 }} data-no-export>
        {toggle("brownfield", "Brownfield sites")}
        {toggle("greenBelt", "Green Belt")}
        {toggle("landuse", "Industrial & greenfield")}
        {toggle("apps", "Decided applications")}
      </div>
      <LondonMap
        ariaLabel="Map of land constraints and brownfield sites"
        highlight={slug}
        layers={layers}
        overlays={{ greenBelt: show.greenBelt, landuse: show.landuse }}
        className="map-sm"
        deckTooltip={({ object }) => {
          const d = object as BrownfieldSite | undefined;
          if (!d) return null;
          return (
            <>
              <b>{d.address ?? "Brownfield site"}</b>
              <div>{d.hectares.toFixed(2)} ha · {d.status}</div>
              {d.max_dwellings != null && <div className="muted">Up to {num(d.max_dwellings)} dwellings</div>}
            </>
          );
        }}
      />
    </Figure>
  );
}
