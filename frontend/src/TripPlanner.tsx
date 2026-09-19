import { useRef, useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { arrival, planJourneyWithOptions, time } from "./journey";
import type { Journey, Language } from "./journey";

interface Pin {
  lat: number;
  lon: number;
  name: string;
}
interface GeocodeHit extends Pin {
  address: string;
}

interface Props {
  language: Language;
  onPlanned: (journey: Journey) => void;
}

/** Caregiver tool: plan a trip between any two places. Mr Tan's own view never shows inputs. */
export function TripPlanner({ language, onPlanned }: Props) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [origin, setOrigin] = useState<Pin | null>(null);
  const [destination, setDestination] = useState<Pin | null>(null);
  const [options, setOptions] = useState<Journey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [arriveLabel, setArriveLabel] = useState("");

  /** Target arrival: ~90 min from now in Singapore time, nudged into transit service hours. */
  function arriveBySingapore(): { iso: string; label: string } {
    const sgt = new Date(Date.now() + 8 * 3600_000 + 90 * 60_000); // SGT wall clock in UTC fields
    const hours = sgt.getUTCHours() + sgt.getUTCMinutes() / 60;
    if (hours < 7.5) sgt.setUTCHours(9, 0, 0, 0);
    else if (hours > 21.5) {
      sgt.setUTCDate(sgt.getUTCDate() + 1);
      sgt.setUTCHours(9, 0, 0, 0);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${sgt.getUTCFullYear()}-${pad(sgt.getUTCMonth() + 1)}-${pad(sgt.getUTCDate())}` +
      `T${pad(sgt.getUTCHours())}:${pad(sgt.getUTCMinutes())}:00+08:00`;
    return { iso, label: `${pad(sgt.getUTCHours())}:${pad(sgt.getUTCMinutes())}` };
  }

  async function plan() {
    if (!origin || !destination) return;
    setBusy(true);
    setError("");
    setOptions(null);
    try {
      const { iso: arriveBy, label } = arriveBySingapore();
      setArriveLabel(label);
      const { journey, alternatives } = await planJourneyWithOptions({
        origin,
        destination,
        arriveBy,
        stepFree: true,
        walkingSpeedFactor: 0.6,
      });
      setOptions([journey, ...alternatives]);
    } catch {
      setError(t("Could not plan this trip. Try different places.", "无法规划这段行程，请换个地点试试。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card trip-planner">
      <h2>{t("Plan a different trip", "规划新行程")}</h2>
      <p className="onboarding-note">
        {t(
          "Any start and end. Timed at his pace, stairs avoided, live conditions applied.",
          "任意起点和终点。按爸爸的步速计算、避开楼梯，并套用当前的实时路况。",
        )}
      </p>
      <PlaceField label={t("From", "起点")} language={language} value={origin} onPick={setOrigin} />
      <PlaceField label={t("To", "终点")} language={language} value={destination} onPick={setDestination} />
      <button className="primary" disabled={busy || !origin || !destination} onClick={plan}>
        {busy ? t("Planning…", "正在计算路线…") : t("Compute routes", "计算路线")}
        <ArrowRight />
      </button>
      {error && <p className="status-note">{error}</p>}
      {options && (
        <div className="planner-options">
          {arriveLabel && (
            <p className="onboarding-note">
              {t(`Planned to arrive by ${arriveLabel}.`, `按 ${arriveLabel} 前到达计算。`)}
            </p>
          )}
          {options.map((option, index) => {
            const modes = new Set(option.steps.map((s) => s.mode));
            const name = modes.has("train")
              ? modes.has("bus")
                ? t("MRT with bus", "地铁 + 巴士")
                : t("MRT", "地铁")
              : t("Bus only", "巴士")
            ;
            return (
              <button
                key={option.id}
                className="onboarding-choice"
                onClick={() => {
                  onPlanned(option);
                  setOptions(null);
                }}
              >
                <span>
                  {name}
                  {index === 0 ? t(" · recommended", " · 推荐") : ""}
                </span>
                <small>
                  {t(
                    `Leave ${time(option.departureTime)} · arrive ${arrival(option)}` +
                      (option.transfers === 0 ? " · no transfer" : ` · ${option.transfers} transfer`),
                    `${time(option.departureTime)} 出发 · 预计 ${arrival(option)} 到` +
                      (option.transfers === 0 ? " · 不用换车" : ` · 换乘 ${option.transfers} 次`),
                  )}
                </small>
              </button>
            );
          })}
          <p className="onboarding-note">
            {t("Choosing one replaces his current journey.", "选择后会替换爸爸当前的行程。")}
          </p>
        </div>
      )}
    </section>
  );
}

function PlaceField({ label, language, value, onPick }: {
  label: string;
  language: Language;
  value: Pin | null;
  onPick: (pin: Pin | null) => void;
}) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const timer = useRef<number>(undefined);

  function search(text: string) {
    setQuery(text);
    onPick(null);
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(text.trim())}`);
        const body = (await r.json()) as { results: GeocodeHit[] };
        setHits(body.results ?? []);
      } catch {
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
      {!value && hits.length > 0 && (
        <ul className="place-hits">
          {hits.slice(0, 5).map((hit) => (
            <li key={`${hit.lat}-${hit.lon}-${hit.name}`}>
              <button
                onClick={() => {
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
