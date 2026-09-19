import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import type { Language, PlacePin as Pin } from "./journey";
interface GeocodeHit extends Pin {
  address: string;
}
export function PlaceField({
  label,
  language,
  value,
  onPick,
}: {
  label: string;
  language: Language;
  value: Pin | null;
  onPick: (pin: Pin | null) => void;
}) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const timer = useRef<number>(undefined);
  const version = useRef(0);
  const [status, setStatus] = useState("");
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      version.current++;
    },
    [],
  );

  function search(text: string) {
    const requestVersion = ++version.current;
    setQuery(text);
    setHits([]);
    setStatus("");
    onPick(null);
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setHits([]);
      return;
    }
    setStatus(t("Searching…", "正在搜索…"));
    timer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/geocode?q=${encodeURIComponent(text.trim())}`,
        );
        if (!r.ok) throw new Error("Search failed");
        const body = (await r.json()) as { results: GeocodeHit[] };
        if (version.current !== requestVersion) return;
        const results = (body.results ?? []).filter(
          (hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lon),
        );
        setHits(results);
        setStatus(
          results.length
            ? ""
            : t(
                "No places found. Try a postal code or address.",
                "未找到地点，请尝试邮编或地址。",
              ),
        );
      } catch {
        if (version.current !== requestVersion) return;
        setStatus(
          t("Search unavailable. Please try again.", "暂时无法搜索，请重试。"),
        );
        setHits([]);
      }
    }, 350);
  }

  return (
    <div className="place-field">
      <label>
        <span>{label}</span>
        <div className="place-input">
          <Search size={20} />
          <input
            type="text"
            value={value ? value.name : query}
            placeholder={t("Search a place or address", "搜索地点或地址")}
            onChange={(event) => search(event.target.value)}
          />
        </div>
      </label>
      {status && (
        <p role="status" className="field-hint">
          {status}
        </p>
      )}
      {!value && hits.length > 0 && (
        <ul className="place-hits">
          {hits.slice(0, 5).map((hit) => (
            <li key={`${hit.lat}-${hit.lon}-${hit.name}`}>
              <button
                onClick={() => {
                  version.current++;
                  setStatus("");
                  onPick({ lat: hit.lat, lon: hit.lon, name: hit.name });
                  setHits([]);
                }}
              >
                <MapPin size={17} />
                <span>
                  <strong>{hit.name}</strong>
                  {hit.address && <small>{hit.address}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
