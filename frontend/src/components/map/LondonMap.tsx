"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { Map as MapLibre, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { surfaceFor } from "@/components/viz/colors";
import { useTheme } from "@/lib/theme";

type Feature = { type: "Feature"; properties: { slug: string; name: string; code: string }; geometry: { type: string; coordinates: unknown } };
type FC = { type: "FeatureCollection"; features: Feature[] };

let boroughsCache: Promise<FC> | null = null;
const loadBoroughs = () => (boroughsCache ??= fetch("/api/geo/boroughs").then((r) => r.json()));

// Served from /public by scripts/copy-maplibre-worker.mjs (the bundler can't resolve MapLibre's own worker URL).
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// No tile basemap: the borough polygons are the base layer (as in the notebook's maps), so there's no
// API key or tile server to depend on.
const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#f8fafc" } }],
};

const LONDON_BOUNDS: LngLatBoundsLike = [[-0.52, 51.28], [0.34, 51.7]];

function bboxOf(f: Feature): LngLatBoundsLike {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(f.geometry.coordinates);
  return [[minX, minY], [maxX, maxY]];
}

export type OverlayToggles = { greenBelt?: boolean; landuse?: boolean };

export default function LondonMap({
  fill,
  highlight,
  onSelect,
  boroughTooltip,
  layers = [],
  deckTooltip,
  overlays = {},
  className = "",
  children,
  ariaLabel,
  threeD = false,
  extrude,
}: {
  /** slug -> fill colour; boroughs without a value render as a pale outline */
  fill?: Record<string, string>;
  /** slug to outline and zoom to */
  highlight?: string | null;
  onSelect?: (slug: string) => void;
  boroughTooltip?: (slug: string, name: string) => ReactNode;
  layers?: Layer[];
  deckTooltip?: (info: PickingInfo) => ReactNode | null;
  overlays?: OverlayToggles;
  className?: string;
  children?: ReactNode;
  ariaLabel: string;
  /** tilt the camera and allow rotating; deck.gl layers can then draw columns/hexagons in 3D */
  threeD?: boolean;
  /** slug -> extrusion height in metres; in 3D the boroughs are raised by these instead of drawn flat */
  extrude?: Record<string, number>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const deck = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const dark = useTheme() === "dark";
  const wasThreeD = useRef(false);
  const [features, setFeatures] = useState<FC | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const handlers = useRef({ onSelect, boroughTooltip, deckTooltip });
  useEffect(() => {
    handlers.current = { onSelect, boroughTooltip, deckTooltip };
  });

  // --- init
  useEffect(() => {
    if (!el.current) return;
    const m = new MapLibre({
      container: el.current,
      style: STYLE,
      bounds: LONDON_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true, customAttribution: "Boundaries © ONS" },
      canvasContextAttributes: { preserveDrawingBuffer: true }, // lets the PNG export read the canvas
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    m.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    m.scrollZoom.disable(); // don't hijack page scroll; zoom with the buttons or ctrl + scroll
    m.getCanvas().addEventListener("wheel", (e) => { if (e.ctrlKey) m.scrollZoom.enable(); else m.scrollZoom.disable(); });

    const overlay = new MapboxOverlay({
      interleaved: false, // interleaved rendering reads MapLibre internals that changed in v6
      layers: [],
      onHover: (info) => {
        const c = handlers.current.deckTooltip?.(info);
        if (info.object && c) setTip({ x: info.x, y: info.y, content: c });
      },
    });
    m.addControl(overlay);
    deck.current = overlay;
    map.current = m;

    m.on("load", async () => {
      const fc = await loadBoroughs();
      m.addSource("boroughs", { type: "geojson", data: fc, promoteId: "slug" });
      m.addLayer({ id: "b-fill", type: "fill", source: "boroughs",
        paint: { "fill-color": ["coalesce", ["feature-state", "fill"], "#ffffff"], "fill-opacity": ["case", ["boolean", ["feature-state", "hasFill"], false], 0.9, 1] } });
      m.addLayer({ id: "b-extrude", type: "fill-extrusion", source: "boroughs", layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": ["coalesce", ["feature-state", "fill"], "#ffffff"],
          "fill-extrusion-height": ["coalesce", ["feature-state", "height"], 0],
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        } });
      m.addLayer({ id: "b-line", type: "line", source: "boroughs", paint: { "line-color": ["case", ["boolean", ["feature-state", "hasFill"], false], "#ffffff", "#c9ccd1"], "line-width": 1.2 } });
      m.addLayer({ id: "b-hover", type: "line", source: "boroughs",
        paint: { "line-color": "#181d26", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.6, 0] } });
      m.addLayer({ id: "b-highlight", type: "line", source: "boroughs", filter: ["==", ["get", "slug"], ""],
        paint: { "line-color": "#181d26", "line-width": 2.4 } });

      let hovered: string | null = null;
      const onMove = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const slug = f.properties.slug as string;
        if (hovered && hovered !== slug) m.setFeatureState({ source: "boroughs", id: hovered }, { hover: false });
        hovered = slug;
        m.setFeatureState({ source: "boroughs", id: slug }, { hover: true });
        m.getCanvas().style.cursor = handlers.current.onSelect ? "pointer" : "";
        const c = handlers.current.boroughTooltip?.(slug, f.properties.name as string);
        const picked = deck.current?.pickObject({ x: e.point.x, y: e.point.y, radius: 4 });
        if (c && !picked) setTip({ x: e.point.x, y: e.point.y, content: c });
        else if (!picked) setTip(null);
      };
      const onLeave = () => {
        if (hovered) m.setFeatureState({ source: "boroughs", id: hovered }, { hover: false });
        hovered = null;
        m.getCanvas().style.cursor = "";
        setTip(null);
      };
      const onClick = (e: MapLayerMouseEvent) => {
        const slug = e.features?.[0]?.properties.slug as string | undefined;
        if (slug) handlers.current.onSelect?.(slug);
      };
      for (const id of ["b-fill", "b-extrude"]) {
        m.on("mousemove", id, onMove);
        m.on("mouseleave", id, onLeave);
        m.on("click", id, onClick);
      }
      setFeatures(fc);
      setReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
      deck.current = null;
    };
  }, []);

  // --- choropleth fill
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !features) return;
    for (const f of features.features) {
      const c = fill?.[f.properties.slug];
      m.setFeatureState({ source: "boroughs", id: f.properties.slug }, { fill: c ?? surfaceFor(dark).canvas, hasFill: !!c });
    }
  }, [ready, features, fill, dark]);

  // --- light / dark paint
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const s = surfaceFor(dark);
    m.setPaintProperty("bg", "background-color", s.soft);
    m.setPaintProperty("b-line", "line-color", ["case", ["boolean", ["feature-state", "hasFill"], false], s.canvas, s.line]);
    m.setPaintProperty("b-hover", "line-color", s.ink);
    m.setPaintProperty("b-highlight", "line-color", s.ink);
  }, [ready, dark]);

  // --- 2D / 3D: camera tilt, rotation, and extruded boroughs
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !features) return;
    const raised = threeD && !!extrude;
    for (const f of features.features) {
      m.setFeatureState({ source: "boroughs", id: f.properties.slug }, { height: extrude?.[f.properties.slug] ?? 0 });
    }
    m.setLayoutProperty("b-extrude", "visibility", raised ? "visible" : "none");
    m.setLayoutProperty("b-fill", "visibility", raised ? "none" : "visible");
    // outlines sit at ground level, so they'd cut through raised boroughs
    for (const id of ["b-line", "b-hover", "b-highlight"]) m.setLayoutProperty(id, "visibility", raised ? "none" : "visible");
    if (threeD) {
      m.dragRotate.enable();
      m.touchPitch.enable();
    } else {
      m.dragRotate.disable();
      m.touchPitch.disable();
    }
    // a tilted view pushes the far side into the distance, so zoom in a little when switching to 3D
    const dz = threeD === wasThreeD.current ? 0 : threeD ? 0.45 : -0.45;
    wasThreeD.current = threeD;
    m.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -18 : 0, zoom: m.getZoom() + dz, duration: 800 });
  }, [ready, features, threeD, extrude]);

  // --- highlight + zoom
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !features) return;
    m.setFilter("b-highlight", ["==", ["get", "slug"], highlight ?? ""]);
    const f = highlight ? features.features.find((x) => x.properties.slug === highlight) : null;
    m.fitBounds(f ? bboxOf(f) : LONDON_BOUNDS, { padding: f ? 40 : 16, duration: 0, pitch: m.getPitch(), bearing: m.getBearing() });
  }, [ready, features, highlight]);

  // --- optional context layers (lazy-loaded GeoJSON)
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const ensure = async (id: "green_belt" | "landuse", on: boolean | undefined) => {
      if (!on) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
        return;
      }
      if (!m.getSource(id)) {
        m.addSource(id, { type: "geojson", data: `/api/geo/${id}` });
        m.addLayer(id === "green_belt"
          ? { id, type: "fill", source: id, paint: { "fill-color": "#1baf7a", "fill-opacity": 0.22 } }
          : { id, type: "fill", source: id, paint: {
              "fill-color": ["match", ["get", "land_type"], "Industrial", "#eb6834", "#1baf7a"], "fill-opacity": 0.45 } },
          "b-line");
      }
      m.setLayoutProperty(id, "visibility", "visible");
    };
    ensure("green_belt", overlays.greenBelt);
    ensure("landuse", overlays.landuse);
  }, [ready, overlays.greenBelt, overlays.landuse]);

  // --- deck.gl layers
  useEffect(() => {
    deck.current?.setProps({ layers });
  }, [layers, ready]);

  return (
    <div className={`map ${className}`} role="region" aria-label={ariaLabel} onMouseLeave={() => setTip(null)}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {children}
      {threeD && (
        <div className="map-overlay" style={{ right: 12, bottom: 36, fontSize: 12, padding: "6px 10px" }} data-no-export>
          Right-drag (or Ctrl + drag) to tilt and rotate
        </div>
      )}
      {tip && (
        <div className="map-tooltip" style={{ left: Math.min(tip.x + 14, 9999), top: tip.y + 14 }}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

export function RampLegend({ stops, min, max, label }: { stops: string[]; min: string; max: string; label: string }) {
  return (
    <div className="map-overlay" style={{ left: 12, bottom: 12 }}>
      <div className="caption" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div className="ramp" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <div className="spread" style={{ fontSize: 12, marginTop: 4, alignItems: "center" }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
