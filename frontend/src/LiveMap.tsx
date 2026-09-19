import { useEffect, useRef } from "react";
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
export function LiveMap({ journey, original, currentLegId, position, language }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
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
          paint: { "line-width": 5, "line-color": "#4a6b52", "line-dasharray": [0.4, 1.8] },
        });
        map.current = instance;
        focus(instance, journey, original, currentLegId);
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
    fit(instance, journey, original);
    mark(instance, journey, language);
    return () => {
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
    mark(instance, journey, language);
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
      <div className="live-map live-map-missing">
        {t("Map unavailable: missing map key.", "地图不可用：缺少地图密钥。")}
      </div>
    );
  }
  return <div ref={container} className="live-map" aria-label={t("Route map", "路线地图")} />;
}

const markers: maplibregl.Marker[] = [];
let positionMarker: maplibregl.Marker | null = null;

/** His live position: a pulsing blue dot, updated in place. */
function markPosition(
  instance: maplibregl.Map,
  position: { lat: number; lon: number } | null | undefined,
) {
  if (!position) {
    positionMarker?.remove();
    positionMarker = null;
    return;
  }
  if (!positionMarker) {
    const element = document.createElement("div");
    element.className = "map-me";
    positionMarker = new maplibregl.Marker({ element })
      .setLngLat([position.lon, position.lat])
      .addTo(instance);
  } else {
    positionMarker.setLngLat([position.lon, position.lat]);
    if (!positionMarker._map) positionMarker.addTo(instance);
  }
}

function mark(instance: maplibregl.Map, journey: Journey, language: Language) {
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
  if (start)
    markers.push(new maplibregl.Marker({ element: label(journey.origin?.name[language] ?? "", "start") })
      .setLngLat(start as [number, number]).addTo(instance));
  if (end)
    markers.push(new maplibregl.Marker({ element: label(journey.destination?.name[language] ?? "", "end") })
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
    ? ["case", ["==", ["get", "legId"], currentLegId], 1, 0.25]
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
