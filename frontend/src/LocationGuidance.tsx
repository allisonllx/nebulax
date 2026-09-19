import { useEffect, useRef, useState } from "react";
import { ArrowRight, MapPin, Volume2 } from "lucide-react";
import type { Journey, Language } from "./journey";

type Fix = { lat: number; lon: number; accuracy: number; timestamp: number };
type Point = [number, number];
// Local metre projection is sufficient for short Singapore walking legs.
function distanceToRoute(fix: Fix, coordinates: Point[]) {
  const scaleX = 111320 * Math.cos((fix.lat * Math.PI) / 180);
  const project = ([lon, lat]: Point) => [
    (lon - fix.lon) * scaleX,
    (lat - fix.lat) * 111320,
  ];
  let nearest = Infinity;
  for (let i = 1; i < coordinates.length; i++) {
    const [ax, ay] = project(coordinates[i - 1]),
      [bx, by] = project(coordinates[i]);
    const dx = bx - ax,
      dy = by - ay;
    const fraction = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    nearest = Math.min(
      nearest,
      Math.hypot(ax + fraction * dx, ay + fraction * dy),
    );
  }
  const end = coordinates.at(-1);
  return { route: nearest, end: end ? Math.hypot(...project(end)) : Infinity };
}
export function LocationGuidance({
  journey,
  stepIndex,
  language,
  disabled,
  onAdvance,
  onHelp,
  voice,
  enabled,
  onEnable,
  onStatus,
}: {
  journey: Journey;
  stepIndex: number;
  language: Language;
  disabled: boolean;
  onAdvance: () => void;
  onHelp: () => void;
  voice: boolean;
  enabled: boolean;
  onEnable: (enabled: boolean) => void;
  /** Reports live progress on the current leg (or null when unreliable) for spoken reminders. */
  onStatus?: (status: { endMetres: number; off: boolean } | null) => void;
}) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const step = journey.steps[stepIndex];
  // Never guess which geometry belongs to a step. Lift/platform checks stay manual.
  const leg =
    step.legId && step.mode !== "lift"
      ? journey.routeGeometry.features.find(
          (f) =>
            f.properties.legId === step.legId &&
            f.properties.mode === step.mode,
        )
      : undefined;
  const coordinates = leg?.geometry.coordinates;
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<
    | "waiting"
    | "tracking"
    | "denied"
    | "timeout"
    | "unsupported"
    | "unavailable"
  >("waiting");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [away, setAway] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const offRoute = useRef({ count: 0, since: 0, last: 0 });
  const lastSpoken = useRef(0);
  const announcedNear = useRef(false);
  const message = t(
    "You may have left the walking route. Stop somewhere safe. Check the walking directions, or ask for help before continuing.",
    "您可能已偏离步行路线。请在安全的地方停下，查看步行指引，或先求助再继续。",
  );
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    if (!navigator.geolocation) {
      queueMicrotask(() => setStatus("unsupported"));
      return () => window.clearInterval(timer);
    }
    let live = true;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!live) return;
        const next = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        const time = Date.now();
        setNow(time);
        setFix(next);
        setStatus("tracking");
        const reliable =
          time - next.timestamp <= 15000 &&
          next.accuracy <= 40 &&
          next.accuracy >= 0 &&
          document.visibilityState === "visible";
        if (!coordinates || step.mode !== "walk" || !reliable) {
          offRoute.current = { count: 0, since: 0, last: 0 };
          setAway(false);
          return;
        }
        const distances = distanceToRoute(next, coordinates);
        if (distances.route > Math.max(50, next.accuracy * 2)) {
          const previous = offRoute.current;
          if (next.timestamp <= previous.last) return;
          const continuous = next.timestamp - previous.last <= 15000;
          const count = continuous ? previous.count + 1 : 1;
          const since =
            continuous && previous.since ? previous.since : next.timestamp;
          offRoute.current = { count, since, last: next.timestamp };
          setAway(count >= 3 && next.timestamp - since >= 10000);
        } else {
          offRoute.current = { count: 0, since: 0, last: 0 };
          setAway(false);
        }
      },
      (error) => {
        if (live) {
          setStatus(
            error.code === 1
              ? "denied"
              : error.code === 3
                ? "timeout"
                : "unavailable",
          );
          setFix(null);
          setAway(false);
          offRoute.current = { count: 0, since: 0, last: 0 };
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => {
      live = false;
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
    };
  }, [enabled, coordinates, step.mode, retry]);
  const reliable =
    enabled &&
    status === "tracking" &&
    fix &&
    now - fix.timestamp <= 15000 &&
    fix.accuracy <= 40 &&
    fix.accuracy >= 0 &&
    document.visibilityState === "visible";
  const distances =
    reliable && coordinates ? distanceToRoute(fix, coordinates) : null;
  const near = distances && distances.end <= 35;
  const far = distances && fix && distances.end - fix.accuracy > 80;
  const off = Boolean(away && distances);
  // Coarse-grained so the parent effect is not re-triggered by GPS jitter.
  const endMetres = distances ? Math.max(10, Math.round(distances.end / 10) * 10) : null;
  useEffect(() => {
    onStatus?.(endMetres === null ? null : { endMetres, off });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMetres, off]);
  useEffect(() => {
    return () => onStatus?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function speak() {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language === "en" ? "en-SG" : "zh-CN";
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    if (
      !off ||
      !voice ||
      !("speechSynthesis" in window) ||
      Date.now() - lastSpoken.current < 60000
    )
      return;
    lastSpoken.current = Date.now();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language === "en" ? "en-SG" : "zh-CN";
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [off, voice, message, language]);
  useEffect(() => {
    if (
      !near ||
      !voice ||
      announcedNear.current ||
      !("speechSynthesis" in window)
    )
      return;
    announcedNear.current = true;
    const utterance = new SpeechSynthesisUtterance(
      language === "en"
        ? "You’re near the stop. Check its name before tapping to continue."
        : "您已接近目的地，请先核对名称，再点击继续。",
    );
    utterance.lang = language === "en" ? "en-SG" : "zh-CN";
    utterance.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [near, voice, language]);
  function resetLocation() {
    setStatus("waiting");
    setFix(null);
    setAway(false);
    offRoute.current = { count: 0, since: 0, last: 0 };
    setRetry((value) => value + 1);
    onEnable(true);
  }
  const locationCopy = (() => {
    if (status === "waiting")
      return {
        title: t("Finding your location…", "正在获取您的位置…"),
        detail: t(
          "If your browser asks, allow location access. Keep this screen open while we wait.",
          "如果浏览器询问，请允许访问位置。请保持此页面打开，稍候片刻。",
        ),
      };
    if (status === "denied")
      return {
        title: t("Location permission is off", "尚未允许定位"),
        detail: t(
          "Allow location for this site in your browser settings, and check your device’s location settings. Then try again. You can still follow the instructions manually.",
          "请在浏览器设置中允许此网站访问位置，并检查设备的定位设置，然后重试。您仍可手动跟随指引。",
        ),
      };
    if (status === "unsupported")
      return {
        title: t(
          "Location is unavailable in this browser",
          "此浏览器无法使用定位",
        ),
        detail: t(
          "Open the app in a location-enabled browser using a secure connection. You can still follow the instructions manually.",
          "请使用支持定位的浏览器，通过安全连接打开应用。您仍可手动跟随指引。",
        ),
      };
    if (status === "timeout")
      return {
        title: t(
          "Getting your location is taking longer",
          "获取位置所需时间较长",
        ),
        detail: t(
          "We haven’t received a location yet. Try again from a safe, open area, or follow the landmarks manually.",
          "我们尚未获取到位置。可在安全、开阔的地方重试，或根据地标手动确认。",
        ),
      };
    if (status === "unavailable")
      return {
        title: t(
          "Your device couldn’t find its location",
          "设备暂时无法获取位置",
        ),
        detail: t(
          "Check that device location is enabled. Try again, or use the landmarks to continue manually.",
          "请检查设备是否已开启定位。您可以重试，或根据地标手动继续。",
        ),
      };
    if (!fix || now - fix.timestamp > 15000)
      return {
        title: t("Waiting for a fresh location…", "正在等待新的位置信息…"),
        detail: t(
          "The last reading is out of date. We’ll pause location checks until a new one arrives. Check the landmark before continuing.",
          "上次位置已过时。获取新位置前，将暂停定位检查。继续前请核对地标。",
        ),
      };
    if (fix.accuracy > 40 || fix.accuracy < 0 || !Number.isFinite(fix.accuracy))
      return {
        title: t("Your location is approximate", "目前只能获取大致位置"),
        detail: t(
          `Your device reports accuracy of about ${Math.round(fix.accuracy)} metres. That isn’t precise enough to check this stop. Check the landmark before continuing.`,
          `设备报告的定位精度约为 ${Math.round(fix.accuracy)} 米，尚不足以判断是否到站。继续前请核对地标。`,
        ),
      };
    return {
      title: !coordinates
        ? t(
            "Confirm this step by its signs or landmark",
            "请根据标志或地标确认这一步",
          )
        : near
          ? t(
              "You’re near the stop. Check its name.",
              "您已接近目的地，请核对名称。",
            )
          : off
            ? t("Let’s check your walking route", "请检查步行路线")
            : t("Location guidance is on", "定位指引已开启"),
      detail: !coordinates
        ? t(
            "Location alone cannot confirm this step. Follow the signs and instructions.",
            "仅凭定位无法确认此步骤，请跟随标志与指引。",
          )
        : t(
            "Keep this app open. Confirm each stop by its name before continuing.",
            "请保持应用打开，继续前请核对每一站的名称。",
          ),
    };
  })();
  return (
    <div className="location-guidance">
      {!enabled ? (
        <div className="location-consent">
          <p>
            {t(
              "Use your location to check walking progress while this app is open. Your position is not shared with family or saved.",
              "打开应用时，可使用定位检查步行进度。位置不会分享给家人，也不会被保存。",
            )}
          </p>
          <button className="secondary" onClick={resetLocation}>
            <MapPin size={20} />
            {t("Enable location guidance", "开启定位指引")}
          </button>
        </div>
      ) : (
        <div className="location-status">
          <div
            className="location-status-copy"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <strong>{locationCopy.title}</strong>
            <p>{locationCopy.detail}</p>
          </div>
          <div className="location-status-actions">
            {!reliable && status !== "waiting" && status !== "unsupported" && (
              <button className="secondary" onClick={resetLocation}>
                {t("Try location again", "重新定位")}
              </button>
            )}
            <button
              className="text-button"
              onClick={() => {
                onEnable(false);
                setFix(null);
                setAway(false);
              }}
            >
              {t("Turn off location", "关闭定位")}
            </button>
          </div>
        </div>
      )}
      {off && (
        <div className="location-warning" role="alert">
          <p>{message}</p>
          <button className="secondary" onClick={speak}>
            <Volume2 size={20} />
            {t("Read guidance aloud", "朗读指引")}
          </button>
          {step.directions.length > 0 && (
            <ol>
              {step.directions.map((d, i) => (
                <li key={i}>{d[language]}</li>
              ))}
            </ol>
          )}
          <p>
            {t(
              "Follow marked walkways. Do not take a shortcut across roads to reach the route.",
              "请沿标示的人行道行走，不要为返回路线而横穿道路。",
            )}
          </p>
          <button className="secondary" onClick={onHelp}>
            {t("Help me find my way", "帮我找到路")}
          </button>
        </div>
      )}
      <p className="arrival-hint">
        {t(
          "Only tap after reaching this step’s landmark:",
          "到达此步骤的地标后再点击：",
        )}{" "}
        <strong>{step.confirmation[language]}</strong>
      </p>
      <button
        className={`primary${near ? " arrival-ready" : ""}`}
        disabled={disabled}
        onClick={() => {
          if (far) setConfirm(true);
          else onAdvance();
        }}
      >
        {stepIndex === journey.steps.length - 1
          ? t("I’m here — finish journey", "我已到达，结束行程")
          : t("I’m here — show next step", "我已到达，查看下一步")}
        <ArrowRight size={25} />
      </button>
      {confirm && (
        <div className="location-warning" role="alert">
          <strong>
            {t("You still seem far from this stop.", "您似乎还未到达此站。")}
          </strong>
          <p>
            {t(
              "Location can be wrong. Check the stop name or landmark before continuing.",
              "定位可能有误。请先核对站名或地标，再继续。",
            )}
          </p>
          <button className="secondary" onClick={() => setConfirm(false)}>
            {t("Keep guiding me", "继续为我指路")}
          </button>
          <button
            className="text-button"
            disabled={disabled}
            onClick={onAdvance}
          >
            {t("I checked the landmark — continue", "我已核对地标，继续")}
          </button>
        </div>
      )}
    </div>
  );
}
