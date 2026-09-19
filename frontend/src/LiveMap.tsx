import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Journey, Language } from "./journey";

const KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
// Raster tiles: same MapTiler + OpenStreetMap cartography, but renders reliably on
// low-end and software-GL devices — exactly the phones this app is for.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${KEY}`],
      tileSize: 512,
      attribution:
        '© <a href="https://www.maptiler.com/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

interface Props {
  journey: Journey;
  /** When comparing, the route being replaced — drawn grey underneath. */
  original?: Journey;
  /** Highlight and zoom to this leg — the "which way do I walk" view. */
  currentLegId?: string;
  /** His live GPS position, drawn as a blue dot. */
  position?: { lat: number; lon: number } | null;
  language: Language;
  density?: "elder" | "caregiver";
}

function collectFeatures(journey: Journey, original?: Journey) {
  const features = [
    ...(original?.routeGeometry.features ?? []).map((feature) => ({
      ...feature,
      properties: { ...feature.properties, role: "previous" },
    })),
    ...journey.routeGeometry.features.map((feature) => ({
      ...feature,
      properties: { role: "recommended", ...feature.properties },
    })),
  ];
  return { type: "FeatureCollection", features } as FeatureCollection;
}

function boundsOf(collection: FeatureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of collection.features) {
    if (feature.geometry.type !== "LineString") continue;
    for (const position of feature.geometry.coordinates)
      bounds.extend(position as [number, number]);
  }
  return bounds;
}

/** A real OpenStreetMap basemap (MapTiler tiles) with the journey drawn on top. */
export function LiveMap({ journey, original, currentLegId, position, language, density }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const t = (en: string, zh: string) => (language === "en" ? en : zh);

  useEffect(() => {
    if (!container.current || !KEY) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [103.8198, 1.3521], // Singapore fallback until the route bounds apply
      zoom: 10.5,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    instance.on("error", () => setTileError(true));
    instance.dragRotate.disable();
    instance.touchZoomRotate.disableRotation();
    const ensureLayers = () => {
      if (map.current === instance || instance.getSource("route")) return;
      try {
        instance.addSource("route", { type: "geojson", data: collectFeatures(journey, original) });
        instance.addLayer({
          id: "route-casing", type: "line", source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 9 },
        });
        instance.addLayer({
          id: "route-previous", type: "line", source: "route",
          filter: ["==", ["get", "role"], "previous"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": 5,
            "line-color": ["case", ["==", ["get", "status"], "affected"], "#b3423a", "#9aa79b"],
            "line-dasharray": [1.2, 1.6],
          },
        });
        // line-dasharray cannot vary per feature, so walking legs get their own dashed layer.
        instance.addLayer({
          id: "route-current-ride", type: "line", source: "route",
          filter: ["all", ["!=", ["get", "role"], "previous"], ["!=", ["get", "mode"], "walk"]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": 6,
            "line-color": ["match", ["get", "mode"], "bus", "#1d6f74", "#245640"],
          },
        });
        instance.addLayer({
          id: "route-current-walk", type: "line", source: "route",
          filter: ["all", ["!=", ["get", "role"], "previous"], ["==", ["get", "mode"], "walk"]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 6, "line-color": "#205d46" },
        });
        map.current = instance;
        focus(instance, journey, original, currentLegId);
        markPosition(instance, position);
      } catch {
        /* style not ready yet — a later event will retry */
      }
    };
    // Inline styles can finish loading before listeners attach, so try now and on every
    // relevant event until the layers exist.
    ensureLayers();
    instance.on("style.load", ensureLayers);
    instance.on("load", ensureLayers);
    instance.once("idle", ensureLayers);
    focus(instance, journey, original, currentLegId);
    mark(instance, journey, language, currentLegId);
    return () => {
      const own = mapMarkers.get(instance);
      own?.markers.forEach(marker => marker.remove());
      own?.position?.remove();
      mapMarkers.delete(instance);
      map.current = null;
      instance.remove();
    };
    // The map instance is created once; data updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const source = instance.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(collectFeatures(journey, original));
    focus(instance, journey, original, currentLegId, position);
    mark(instance, journey, language, currentLegId);
    markPosition(instance, position);
  }, [journey, original, currentLegId, position, language]);
  useEffect(() => {
    const instance = map.current;
    if (instance?.getSource("route"))
      focus(instance, journey, original, currentLegId, position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLegId]);

  if (!KEY) {
    return (
      <RouteSketch journey={journey} position={position} language={language} />
    );
  }
  return <div className="calm-map-shell"><div ref={container} className={`live-map ${density === "elder" ? "elder-map" : ""}`} aria-label={t("Route map", "路线地图")} />{tileError && <p className="calm-map-error" role="status">{t("Street map unavailable · route only", "街道底图暂不可用 · 仅显示路线")}</p>}</div>;
}

const mapMarkers = new WeakMap<maplibregl.Map, {markers: maplibregl.Marker[]; position: maplibregl.Marker | null}>();
function ownMarkers(instance: maplibregl.Map) {
  let own = mapMarkers.get(instance);
  if (!own) { own = {markers: [], position: null}; mapMarkers.set(instance, own); }
  return own;
}
function RouteSketch({ journey, position, language }: Props) {
  const lines = journey.routeGeometry.features.map(f => f.geometry.coordinates);
  const points = lines.flat();
  if (position) points.push([position.lon, position.lat]);
  if (!points.length) return <div className="live-map-missing">{language === 'zh' ? '暂无路线' : 'No route available'}</div>;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX-minX, maxY-minY, .001);
  const point = (p: number[]) => [180+(p[0]-(minX+maxX)/2)/span*170, 100-(p[1]-(minY+maxY)/2)/span*170];
  return <div className="calm-route-fallback" role="img" aria-label={language === 'zh' ? '路线示意图' : 'Route diagram'}>
    <svg viewBox="0 0 360 200">{lines.map((line,i) => <polyline key={i} points={line.map(p=>point(p).join(',')).join(' ')} fill="none" stroke="#205d46" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>)}
      {position && <g transform={`translate(${point([position.lon,position.lat]).join(',')})`}><circle r="12" fill="#287dea" stroke="white" strokeWidth="4"/><text y="32" textAnchor="middle" fill="#175db5" fontSize="14">{language==='zh'?'您在这里':'You are here'}</text></g>}
    </svg><p>{language==='zh'?'街道底图暂不可用 · 仅显示规划路线':'Street map unavailable · planned route only'}</p>
  </div>;
}

/** His live position: a pulsing blue dot, updated in place. */
function markPosition(
  instance: maplibregl.Map,
  position: { lat: number; lon: number } | null | undefined,
) {
  const own = ownMarkers(instance);
  let positionMarker = own.position;
  if (!position) {
    positionMarker?.remove();
    positionMarker = null;
    own.position = null;
    return;
  }
  if (!positionMarker) {
    const element = document.createElement("div");
    element.className = "map-me";
    const label = document.createElement("span");
    label.className = "map-me-label";
    label.textContent = document.documentElement.lang.startsWith("zh") ? "您在这里" : "You are here";
    element.append(label);
    positionMarker = new maplibregl.Marker({ element })
      .setLngLat([position.lon, position.lat])
      .addTo(instance);
    own.position = positionMarker;
  } else {
    positionMarker.setLngLat([position.lon, position.lat]);
    if (!positionMarker._map) positionMarker.addTo(instance);
  }
}

function mark(instance: maplibregl.Map, journey: Journey, language: Language, currentLegId?: string) {
  const markers = ownMarkers(instance).markers;
  while (markers.length) markers.pop()?.remove();
  const line = journey.routeGeometry.features[0]?.geometry;
  const lastLine = journey.routeGeometry.features.at(-1)?.geometry;
  const start = journey.origin
    ? [journey.origin.lon, journey.origin.lat]
    : line?.type === "LineString" ? line.coordinates[0] : null;
  const end = journey.destination
    ? [journey.destination.lon, journey.destination.lat]
    : lastLine?.type === "LineString" ? lastLine.coordinates.at(-1) : null;
  const label = (text: string, kind: string) => {
    const element = document.createElement("div");
    element.className = `map-pin map-pin-${kind}`;
    element.textContent = text;
    return element;
  };
  const activeLeg = currentLegId ? journey.routeGeometry.features.find(f => f.properties.legId === currentLegId) : undefined;
  const nextStop = activeLeg?.geometry.coordinates.at(-1);
  const activeStep = journey.steps.find(s => s.legId === currentLegId);
  if (nextStop && activeStep) {
    markers.push(new maplibregl.Marker({ element: label(activeStep.place[language], "next") }).setLngLat(nextStop).addTo(instance));
    return;
  }
  if (start)
    markers.push(new maplibregl.Marker({ element: label(journey.origin?.name[language] ?? (language === "zh" ? "起点" : "Start"), "start") })
      .setLngLat(start as [number, number]).addTo(instance));
  if (end)
    markers.push(new maplibregl.Marker({ element: label(journey.destination?.name[language] ?? (language === "zh" ? "目的地" : "Destination"), "end") })
      .setLngLat(end as [number, number]).addTo(instance));
}

function fit(instance: maplibregl.Map, journey: Journey, original?: Journey) {
  const bounds = boundsOf(collectFeatures(journey, original));
  if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 44, animate: false, maxZoom: 15.5 });
}

/** Zoom to the active leg and fade the rest; with no active leg, show the whole journey.
    A live position is always kept inside the view. */
function focus(instance: maplibregl.Map, journey: Journey, original: Journey | undefined,
               currentLegId: string | undefined,
               position?: { lat: number; lon: number } | null) {
  const dim: maplibregl.ExpressionSpecification | number = currentLegId
    ? ["case", ["==", ["get", "legId"], currentLegId], 1, 0.12]
    : 1;
  for (const layer of ["route-current-ride", "route-current-walk"]) {
    if (instance.getLayer(layer)) instance.setPaintProperty(layer, "line-opacity", dim);
  }
  if (!currentLegId) {
    fit(instance, journey, original);
    return;
  }
  const leg = journey.routeGeometry.features.find(
    (feature) => (feature.properties as { legId?: string }).legId === currentLegId,
  );
  if (leg && leg.geometry.type === "LineString") {
    const bounds = new maplibregl.LngLatBounds();
    for (const point of leg.geometry.coordinates) bounds.extend(point as [number, number]);
    if (position) bounds.extend([position.lon, position.lat]);
    instance.fitBounds(bounds, { padding: 60, animate: false, maxZoom: 16.5 });
  } else {
    fit(instance, journey, original);
  }
}
