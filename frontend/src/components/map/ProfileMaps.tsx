"use client";

import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useMemo, useState } from "react";
import LondonMap, { RampLegend } from "./LondonMap";
import ViewToggle from "./ViewToggle";
import Figure, { Key } from "@/components/viz/Figure";
import { BROWNFIELD_COLORS, C, divergingFor, LAND_COLORS, OUTCOME_COLORS, rgba, surfaceFor } from "@/components/viz/colors";
import { useTheme } from "@/lib/theme";
import type { BrownfieldSite, Scheme } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { num, pct } from "@/lib/format";

// Tallest column in a view, in metres. London-wide views need taller columns to read at that zoom.
const TALLEST = { london: 6000, borough: 2500 };

/** Housing schemes; dot area (2D) or tower height (3D) = dwellings. Without `slug`, all of London. */
export function HomesMap({ slug }: { slug?: string }) {
  const [threeD, setThreeD] = useState(false);
  const ringHex = surfaceFor(useTheme() === "dark").canvas;
  const { data } = useApi<Scheme[]>(slug ? `/api/points/schemes?slug=${slug}` : "/api/points/schemes");

  const layers = useMemo(() => {
    if (!data) return [];
    const max = Math.max(1, ...data.map((d) => d.n_dwellings));
    const color = (d: Scheme) => (d.approved ? rgba(C.approved, threeD ? 230 : 200) : rgba(C.neutral, threeD ? 210 : 170));
    if (threeD) {
      return [new ColumnLayer<Scheme>({
        id: "scheme-towers",
        data,
        getPosition: (d) => [d.lng, d.lat],
        diskResolution: 12,
        radius: slug ? 70 : 170,
        extruded: true,
        getElevation: (d) => d.n_dwellings,
        elevationScale: (slug ? TALLEST.borough : TALLEST.london) / max,
        getFillColor: color,
        pickable: true,
      })];
    }
    return [new ScatterplotLayer<Scheme>({
      id: "schemes",
      data,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => Math.sqrt(d.n_dwellings) * 9,
      radiusUnits: "meters",
      radiusMinPixels: slug ? 4 : 2,
      getFillColor: color,
      getLineColor: rgba(ringHex),
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      updateTriggers: { getLineColor: ringHex },
    })];
  }, [data, threeD, slug, ringHex]);

  return (
    <Figure
      title={slug ? "Where the homes are" : "Housing schemes across London"}
      subtitle={`De-duplicated Full and Outline schemes with a published dwelling count. ${threeD ? "Tower height" : "Dot area"} = dwellings. Hover for the scheme.`}
      legend={<><Key color={C.approved} label="Approved" /><Key color={C.neutral} label="Not approved (refused, withdrawn or pending)" /></>}
      note={data && `${num(data.length)} schemes · ${num(data.reduce((s, d) => s + d.n_dwellings, 0))} dwellings proposed`}
    >
      <div className="row" style={{ marginBottom: 12 }}><ViewToggle threeD={threeD} onChange={setThreeD} /></div>
      <LondonMap
        ariaLabel="Map of housing schemes"
        highlight={slug}
        layers={layers}
        threeD={threeD}
        className={slug ? "map-sm" : ""}
        deckTooltip={({ object }) => {
          const d = object as Scheme | undefined;
          if (!d) return null;
          return (
            <>
              <b>{num(d.n_dwellings)} homes</b> · {d.approved ? "approved" : "not approved"}
              <div className="muted">{d.borough} · {d.start_date?.slice(0, 10)} · {d.app_type} · {d.applications} linked application{d.applications > 1 ? "s" : ""}</div>
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
  const [threeD, setThreeD] = useState(false);
  const ringHex = surfaceFor(useTheme() === "dark").canvas;
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
      const color = (d: BrownfieldSite) => rgba(BROWNFIELD_COLORS[d.status] ?? C.neutral, threeD ? 230 : 200);
      if (threeD) {
        // Height = the register's maximum net dwellings; sites without a figure get a short stub.
        const max = Math.max(1, ...sites.map((d) => d.max_dwellings ?? 0));
        out.push(new ColumnLayer<BrownfieldSite>({
          id: "brownfield-columns", data: sites, getPosition: (d) => [d.lng, d.lat],
          diskResolution: 12, radius: 60, extruded: true,
          getElevation: (d) => d.max_dwellings ?? 0,
          elevationScale: TALLEST.borough / max,
          getFillColor: color, pickable: true,
          updateTriggers: { getElevation: max },
        }));
        out.push(new ColumnLayer<BrownfieldSite>({
          id: "brownfield-stubs", data: sites.filter((d) => !d.max_dwellings), getPosition: (d) => [d.lng, d.lat],
          diskResolution: 12, radius: 60, extruded: true, getElevation: 30, getFillColor: color, pickable: true,
        }));
      } else {
        out.push(new ScatterplotLayer<BrownfieldSite>({
          id: "brownfield", data: sites, getPosition: (d) => [d.lng, d.lat],
          getRadius: (d) => Math.max(20, Math.sqrt((d.hectares * 1e4) / Math.PI)), radiusUnits: "meters", radiusMinPixels: 3,
          getFillColor: color, getLineColor: rgba(ringHex),
          stroked: true, lineWidthMinPixels: 1, pickable: true,
          updateTriggers: { getLineColor: ringHex },
        }));
      }
    }
    return out;
  }, [show.apps, show.brownfield, apps, sites, threeD, ringHex]);

  const toggle = (k: keyof typeof show, label: string) => (
    <label className="chip" style={{ cursor: "pointer" }}>
      <input type="checkbox" checked={show[k]} onChange={() => setShow((s) => ({ ...s, [k]: !s[k] }))} /> {label}
    </label>
  );

  return (
    <Figure
      title="Land: brownfield, Green Belt and land use"
      subtitle={threeD
        ? "Brownfield register sites as columns: height = maximum dwellings the site could take (short stubs have no figure); colour = permission status."
        : "Brownfield register sites sized by hectares, coloured by permission status."}
      legend={<>
        {show.brownfield && Object.entries(BROWNFIELD_COLORS).map(([k, c]) => <Key key={k} color={c} label={k} />)}
        {show.greenBelt && <Key color="#a5dfc9" label="Green Belt" />}
        {show.landuse && <><Key color={LAND_COLORS.Industrial} label="Industrial (OSM)" /><Key color={LAND_COLORS["Virgin / greenfield"]} label="Greenfield (OSM)" /></>}
        {show.apps && <><Key color={C.approved} label="Approved application" /><Key color={C.rejected} label="Refused application" /></>}
      </>}
    >
      <div className="row" style={{ marginBottom: 12 }} data-no-export>
        <ViewToggle threeD={threeD} onChange={setThreeD} />
        {toggle("brownfield", "Brownfield sites")}
        {toggle("greenBelt", "Green Belt")}
        {toggle("landuse", "Industrial & greenfield")}
        {toggle("apps", "Decided applications")}
      </div>
      <LondonMap
        ariaLabel="Map of land constraints and brownfield sites"
        highlight={slug}
        layers={layers}
        threeD={threeD}
        overlays={{ greenBelt: show.greenBelt, landuse: show.landuse }}
        className="map-sm"
        deckTooltip={({ object }) => {
          const d = object as BrownfieldSite | undefined;
          if (!d || !("hectares" in d)) return null;
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

type Pt = [number, number, number, number];
type HexCell = { count: number; colorValue: number; position: [number, number] };

/**
 * Decided applications binned into hexagons: colour = approval rate in the cell, height (3D) = number of
 * applications. Without `slug`, all of London's boroughs.
 */
export function HexMap({ slug, londonApproval }: { slug?: string; londonApproval: number }) {
  const [threeD, setThreeD] = useState(false);
  const dark = useTheme() === "dark";
  const { data } = useApi<PointsResp>(slug ? `/api/points/applications?slug=${slug}` : "/api/points/applications");
  const radius = slug ? 250 : 600;
  const lo = 0.5, hi = 1;
  // Diverging ramp centred on the London rate, stepped into bands for the hexagon colour scale.
  const colorRange = useMemo(() => Array.from({ length: 9 }, (_, i) => rgba(divergingFor(dark)(lo + ((hi - lo) * (i + 0.5)) / 9, lo, londonApproval, hi), 235).slice(0, 3) as [number, number, number]), [londonApproval, dark]);

  const layers = useMemo(() => data ? [new HexagonLayer<Pt>({
    id: "app-hexes",
    data: data.points,
    getPosition: (d) => [d[0], d[1]],
    radius,
    coverage: 0.88,
    extruded: threeD,
    gpuAggregation: false, // CPU so each cell's colour can be its approval rate
    getColorValue: (points: Pt[]) => points.filter((p) => p[2] === 0).length / points.length,
    colorDomain: [lo, hi],
    colorScaleType: "quantize",
    colorRange,
    elevationAggregation: "COUNT",
    elevationRange: [0, slug ? 2000 : 5000],
    material: { ambient: 0.55, diffuse: 0.6, shininess: 20 },
    pickable: true,
    updateTriggers: { getColorValue: 1 },
  })] : [], [data, threeD, radius, colorRange, slug]);

  return (
    <Figure
      title={slug ? "Where applications are approved" : "Where applications cluster, and how they fare"}
      subtitle={`Decided full applications in ${radius} m hexagons. Colour = approval rate in the hexagon${threeD ? "; height = number of applications" : ""}. Hover for figures.`}
      note="Hexagons with only a handful of applications can swing to either extreme; check the count in the tooltip."
    >
      <div className="row" style={{ marginBottom: 12 }}><ViewToggle threeD={threeD} onChange={setThreeD} /></div>
      <LondonMap
        ariaLabel="Hexagon map of decided applications"
        highlight={slug}
        layers={layers}
        threeD={threeD}
        className={slug ? "map-sm" : ""}
        deckTooltip={({ object }) => {
          const c = object as HexCell | undefined;
          if (!c || c.count == null) return null;
          return (
            <>
              <b>{pct(c.colorValue)} approved</b>
              <div className="muted">{num(c.count)} decided application{c.count === 1 ? "" : "s"} in this hexagon</div>
            </>
          );
        }}
      >
        <RampLegend stops={[C.rejected, surfaceFor(dark).midpoint, C.approved]} min={pct(lo)} max={pct(hi)} label={`Approval rate · midpoint = London ${pct(londonApproval)}`} />
      </LondonMap>
    </Figure>
  );
}
