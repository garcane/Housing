"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Feature = { type: "Feature"; properties: { slug: string; name: string; code: string }; geometry: { type: string; coordinates: unknown } };
type FC = { type: "FeatureCollection"; features: Feature[] };

let boroughsCache: Promise<FC> | null = null;
const loadBoroughs = () => (boroughsCache ??= fetch("/api/geo/boroughs").then((r) => r.json()));

// Blank canvas + a light raster basemap. If the tiles can't load the map still works: the
// borough polygons and data layers don't depend on them.
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#f8fafc" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.6 } },
  ],
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
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const deck = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [features, setFeatures] = useState<FC | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const handlers = useRef({ onSelect, boroughTooltip, deckTooltip });
  handlers.current = { onSelect, boroughTooltip, deckTooltip };

  // --- init
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      bounds: LONDON_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true }, // lets the PNG export read the canvas
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.scrollZoom.disable(); // don't hijack page scroll; zoom with the buttons or ctrl + scroll
    m.getCanvas().addEventListener("wheel", (e) => { if (e.ctrlKey) m.scrollZoom.enable(); else m.scrollZoom.disable(); });

    const overlay = new MapboxOverlay({
      interleaved: true,
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
        paint: { "fill-color": ["coalesce", ["feature-state", "fill"], "#ffffff"], "fill-opacity": ["case", ["boolean", ["feature-state", "hasFill"], false], 0.88, 0.35] } });
      m.addLayer({ id: "b-line", type: "line", source: "boroughs", paint: { "line-color": "#ffffff", "line-width": 1.2 } });
      m.addLayer({ id: "b-hover", type: "line", source: "boroughs",
        paint: { "line-color": "#181d26", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.6, 0] } });
      m.addLayer({ id: "b-highlight", type: "line", source: "boroughs", filter: ["==", ["get", "slug"], ""],
        paint: { "line-color": "#181d26", "line-width": 2.4 } });

      let hovered: string | null = null;
      m.on("mousemove", "b-fill", (e) => {
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
      });
      m.on("mouseleave", "b-fill", () => {
        if (hovered) m.setFeatureState({ source: "boroughs", id: hovered }, { hover: false });
        hovered = null;
        m.getCanvas().style.cursor = "";
        setTip(null);
      });
      m.on("click", "b-fill", (e) => {
        const slug = e.features?.[0]?.properties.slug as string | undefined;
        if (slug) handlers.current.onSelect?.(slug);
      });
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
      m.setFeatureState({ source: "boroughs", id: f.properties.slug }, { fill: c ?? "#ffffff", hasFill: !!c });
    }
  }, [ready, features, fill]);

  // --- highlight + zoom
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !features) return;
    m.setFilter("b-highlight", ["==", ["get", "slug"], highlight ?? ""]);
    const f = highlight ? features.features.find((x) => x.properties.slug === highlight) : null;
    m.fitBounds(f ? bboxOf(f) : LONDON_BOUNDS, { padding: f ? 40 : 16, duration: 0 });
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
