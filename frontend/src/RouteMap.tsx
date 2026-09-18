import { useEffect, useState } from "react";
import { MapPin, Route } from "lucide-react";
import { isDemo } from "./journey";
import type { Journey, Language } from "./journey";

interface MapData {
  features: {
    properties: { kind: string };
    geometry: { coordinates: number[][] };
  }[];
}
const xy = ([lon, lat]: number[]) => [
  ((lon - 103.828) / 0.032) * 440,
  ((1.374 - lat) / 0.062) * 480,
];
const path = (coordinates: number[][]) =>
  coordinates
    .map((coord, i) => `${i ? "L" : "M"}${xy(coord).join(",")}`)
    .join(" ");
const stations = [
  { point: [103.8496, 1.37], en: "Ang Mo Kio", zh: "宏茂桥", code: "NS16" },
  { point: [103.8492, 1.351], en: "Bishan", zh: "碧山", code: "NS17" },
  { point: [103.8467, 1.3405], en: "Braddell", zh: "布莱德", code: "NS18" },
  { point: [103.8474, 1.3326], en: "Toa Payoh", zh: "大巴窑", code: "NS19" },
  { point: [103.8438, 1.3205], en: "Novena", zh: "诺维娜", code: "NS20" },
];

export function RouteMap({
  journey,
  original,
  language,
}: {
  journey: Journey;
  original?: Journey;
  language: Language;
}) {
  const [data, setData] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/neighbourhood.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Map unavailable");
        return response.json() as Promise<MapData>;
      })
      .then(setData)
      .catch((error) => {
        if (error.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, []);
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  return (
    <div className="map-card">
      <div className="map-top">
        <span>
          <Route size={18} />
          {t("Your route at a glance", "行程一览")}
        </span>
        <span className="north">N ↑</span>
      </div>
      <svg
        className="route-map"
        viewBox="0 0 440 480"
        role="img"
        aria-label={t(
          "Illustrative route from Ang Mo Kio through Bishan to Novena and Tan Tock Seng Hospital",
          "示例路线：宏茂桥经碧山至诺维娜及陈笃生医院",
        )}
      >
        <rect width="440" height="480" fill="#edf1e8" />
        {data?.features.map((feature, i) => (
          <path
            key={i}
            d={path(feature.geometry.coordinates)}
            fill={feature.properties.kind === "park" ? "#dce7d4" : "none"}
            stroke={feature.properties.kind === "park" ? "#cdddc5" : "#fffefa"}
            strokeWidth={feature.properties.kind === "residential" ? 2 : 4}
          />
        ))}
        {original?.routeGeometry.features.map((feature, i) => (
          <path
            key={`old-${i}`}
            d={path(feature.geometry.coordinates)}
            fill="none"
            stroke="#a65d29"
            strokeWidth="6"
            strokeDasharray="5 7"
            opacity=".75"
          />
        ))}
        {journey.routeGeometry.features.map((feature, i) => (
          <g key={i}>
            <path
              d={path(feature.geometry.coordinates)}
              fill="none"
              stroke="#fff"
              strokeWidth="11"
              strokeLinejoin="round"
            />
            <path
              d={path(feature.geometry.coordinates)}
              fill="none"
              stroke="#286149"
              strokeWidth="6"
              strokeLinejoin="round"
              strokeDasharray={
                feature.properties.mode === "walk" ? "3 8" : undefined
              }
              strokeLinecap="round"
            />
          </g>
        ))}
        <text x="20" y="70" className="area-label">
          ANG MO KIO
        </text>
        <text x="30" y="240" className="area-label">
          BISHAN
        </text>
        <text x="16" y="420" className="area-label">
          NOVENA
        </text>
        {stations.map((station) => {
          const [x, y] = xy(station.point);
          return (
            <g key={station.code}>
              <circle
                cx={x}
                cy={y}
                r="6"
                fill="#fff"
                stroke="#286149"
                strokeWidth="3"
              />
              <text
                x={x - 15}
                y={y + 5}
                textAnchor="end"
                className="station-label"
              >
                {station[language]}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${xy([103.8464, 1.3215]).join(",")})`}>
          <circle r="11" fill="#286149" stroke="#fff" strokeWidth="3" />
          <path d="M-4 0h8M0-4v8" stroke="#fff" strokeWidth="2" />
          <text x="17" y="5" className="hospital-label">
            {t("TTSH", "陈笃生医院")}
          </text>
        </g>
      </svg>
      <div className="map-legend">
        <span>
          <i className="line" />
          {t("Train", "地铁")}
        </span>
        <span>
          <i className="line dotted" />
          {t("Walk", "步行")}
        </span>
        {original && (
          <span>
            <i className="line old" />
            {t("Original", "原路线")}
          </span>
        )}
      </div>
      <div className="map-caption">
        <MapPin size={16} />
        <span>
          {isDemo
            ? t(
                "Sample route · not for navigation",
                "示例路线 · 不可用于实际导航",
              )
            : t(
                "Route overview · not for navigation",
                "路线示意 · 不可用于实际导航",
              )}
        </span>
      </div>
      {(failed || !data) && (
        <p className="map-notice">
          {t(
            "Street map unavailable. Route outline shown.",
            "街道地图暂不可用。仅显示路线示意。",
          )}
        </p>
      )}
      <a
        className="attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors · ODbL
      </a>
    </div>
  );
}
