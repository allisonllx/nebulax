import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CalendarDays,
  CircleHelp,
  Clock3,
  CloudOff,
  Footprints,
  HeartHandshake,
  Hospital,
  Leaf,
  ArrowUpDown as Lift,
  BusFront,
  Route,
  Settings2,
  ShieldCheck,
  TrainFront,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  arrival,
  isDemo,
  loadSnapshot,
  planJourney,
  planJourneyWithOptions,
  planRequest,
  requestForAppointment,
  refreshJourney,
  saveSnapshot,
  time,
} from "./journey";
import type { Language, Scenario, Snapshot } from "./journey";
import { LiveMap } from "./LiveMap";
import { useSpeech } from "./useSpeech";
import { Onboarding, type SetupAnswers } from "./Onboarding";
import { TripPlanner } from "./TripPlanner";
import { AppointmentPanel } from "./AppointmentPanel";
import { FamilyPanel } from "./FamilyPanel";
import {
  appointmentLabel,
  appointmentInstant,
  defaultAppointment,
  defaultFamily,
  dialNumber,
} from "./profile";
import type { Appointment, Family } from "./profile";
import { defaultTravelProfile, travelProfileSchema } from "./travelProfile";
import { LocationGuidance } from "./LocationGuidance";
import "./App.css";
import "./Calm.css";
import { ElderHome, ElderGuidance, CaregiverDashboard } from "./CalmScreens";

type View =
  | "journey"
  | "details"
  | "change"
  | "help"
  | "profile"
  | "settings"
  | "appointment"
  | "family";
const stepIcons: Record<string, LucideIcon> = {
  walk: Footprints,
  train: TrainFront,
  bus: BusFront,
  lift: Lift,
};

function App() {
  const [state, setState] = useState<Snapshot | null>(loadSnapshot);
  const [view, setView] = useState<View>("journey");
  // Mandarin-first and large text by default: Mr Tan is the primary user, not the fallback.
  const [language, setLanguage] = useState<Language>(
    () => loadSnapshot()?.language ?? "zh",
  );
  const [large, setLarge] = useState(() => loadSnapshot()?.large ?? true);
  const [repeatSeconds, setRepeatSeconds] = useState(() => {
    try {
      return Number(localStorage.getItem("nebulax:repeat") ?? "30") || 30;
    } catch {
      return 30;
    }
  });
  // Two audiences, one app: Mr Tan gets guidance only; family gets the fuller controls.
  const [personaMode, setPersonaMode] = useState<"elder" | "caregiver">(() => {
    try {
      return localStorage.getItem("nebulax:mode") === "caregiver"
        ? "caregiver"
        : "elder";
    } catch {
      return "elder";
    }
  });
  const [online, setOnline] = useState(navigator.onLine);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [notice, setNotice] = useState("");
  // Route options computed from the setup answers, awaiting Mei Ling's choice.
  const [routeChoices, setRouteChoices] = useState<{
    answers: SetupAnswers;
    options: import("./journey").Journey[];
  } | null>(null);
  const stateRef = useRef(state);
  // Latest GPS progress on the current leg: a ref for speech ticks, state for the map and UI.
  type LiveFix = {
    endMetres: number;
    routeMetres: number;
    off: boolean;
    lat: number;
    lon: number;
    accuracy: number;
    at: number;
  };
  const locationStatusRef = useRef<LiveFix | null>(null);
  const [liveFix, setLiveFix] = useState<LiveFix | null>(null);
  // Reverse-geocoded "he is near ..." label; refetched only after meaningful movement.
  const [nearLabel, setNearLabel] = useState<string | null>(null);
  const nearFetchRef = useRef<{ lat: number; lon: number } | null>(null);
  const lostWriteRef = useRef(0);
  const offSinceRef = useRef(0);
  const lastAutoReplanRef = useRef(0);
  const [replanBusy, setReplanBusy] = useState(false);
  // Shown once after an automatic off-route recovery, until he acknowledges or moves on.
  const [recovered, setRecovered] = useState(false);
  const [previousJourney, setPreviousJourney] = useState<import("./journey").Journey>();
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const offline = !online || simulateOffline;
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const journey = state?.journey;
  const step = state && state.journey.steps[state.stepIndex];
  const speech = useSpeech(
    language,
    offline,
    `${view}-${step?.id}-${state?.phase}`,
  );

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en-SG" : "zh-SG";
  }, [language]);
  useEffect(() => {
    try {
      localStorage.setItem("nebulax:mode", personaMode);
    } catch {
      /* storage may be unavailable; the mode simply resets next visit */
    }
  }, [personaMode]);
  // Speak each active step aloud and repeat it on an interval — the persona (memory loss) needs
  // the reminder to keep coming, not just play once. GPS-anchored phrasing is a separate feature.
  useEffect(() => {
    if (!state || state.phase !== "active" || personaMode !== "elder") return;
    if (!("speechSynthesis" in window)) return;
    const current = state.journey.steps[state.stepIndex];
    // The full step: headline plus the turn-by-turn directions.
    const fullText = [
      current.instruction[language],
      ...current.directions.map((direction) => direction[language]),
    ].join(" ");
    const say = (full: boolean) => {
      // Reminders are location-aware when GPS has a fresh fix on a walking leg;
      // otherwise they repeat the full instruction.
      const live = locationStatusRef.current;
      const fresh = live && Date.now() - live.at < 20000;
      if (!full && fresh && live.off) return; // the off-route warning owns the audio right now
      let spoken = fullText;
      if (!full && fresh && current.mode === "walk") {
        spoken =
          language === "en"
            ? `Keep going. About ${live.endMetres} metres left to ${current.place.en}.`
            : `继续前进，还剩大约 ${live.endMetres} 米到${current.place.zh}。`;
      }
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = language === "en" ? "en-SG" : "zh-CN";
      utterance.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    say(true);
    if (!repeatSeconds || Number.isNaN(repeatSeconds)) return;
    const timer = window.setInterval(() => say(false), repeatSeconds * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.stepIndex, personaMode, language, repeatSeconds]);
  useEffect(() => {
    try {
      localStorage.setItem("nebulax:repeat", String(repeatSeconds));
    } catch {
      /* reminders fall back to the default next launch */
    }
  }, [repeatSeconds]);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then(async () => {
        const [shell, map] = await Promise.all([
          caches.match("/index.html", { ignoreSearch: true }),
          caches.match("/data/neighbourhood.json", { ignoreSearch: true }),
        ]);
        if (!cancelled) setShellReady(Boolean(shell && map));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    // This effect reports whether the external storage write succeeded.
    // eslint-disable-next-line react/set-state-in-effect
    if (state) setSaved(saveSnapshot({ ...state, language, large }));
  }, [state, language, large]);
  async function finishSetup(answers: SetupAnswers) {
    setBusy(true);
    setError("");
    setRepeatSeconds(answers.repeatSeconds);
    try {
      // A walker means a bit more buffer on every walking leg, on top of his measured pace.
      const aidMargin = answers.mobilityAid === "walker" ? 0.9 : 1;
      const { journey: main, alternatives } = await planJourneyWithOptions({
        ...planRequest,
        origin: answers.home,
        destination: answers.destinations[0],
        walkingSpeedFactor: answers.paceFactor * aidMargin,
      });
      if (alternatives.length > 0) {
        // Show the computed options and let Mei Ling pick the familiar one.
        setRouteChoices({ answers, options: [main, ...alternatives] });
      } else {
        commitRoute(main, answers);
      }
    } catch {
      setError("load");
    } finally {
      setBusy(false);
    }
  }
  function commitRoute(
    chosen: import("./journey").Journey,
    answers: SetupAnswers,
  ) {
    setState({
      schemaVersion: 1,
      journey: chosen,
      profile: travelProfileSchema.parse(answers),
      stepIndex: 0,
      phase: "planned",
      language,
      large: true,
      blocked: false,
      proposal: null,
      appointment: defaultAppointment,
      family: {
        ...defaultFamily,
        phone: answers.familyPhone,
        linked: answers.shareWithFamily,
        scopes: {
          tripUpdates: answers.shareWithFamily,
          prepareAppointments: answers.shareWithFamily,
        },
        consentedAt: answers.shareWithFamily ? new Date().toISOString() : null,
      },
      progressUpdatedAt: null,
      lostAlert: null,
      lastDeviation: null,
    });
    setRouteChoices(null);
    setPersonaMode("elder");
  }

  const profile = state?.profile ?? {
    ...defaultTravelProfile,
    home: journey?.origin
      ? { ...journey.origin, name: journey.origin.name[language] }
      : defaultTravelProfile.home,
    destinations: journey?.destination
      ? [{ ...journey.destination, name: journey.destination.name[language] }]
      : defaultTravelProfile.destinations,
  };
  function handleLiveFix(
    status: {
      endMetres: number;
      routeMetres: number;
      off: boolean;
      lat: number;
      lon: number;
      accuracy: number;
    } | null,
  ) {
    const fix = status ? { ...status, at: Date.now() } : null;
    locationStatusRef.current = fix;
    setLiveFix(fix);
    if (!fix) return;
    // Name where he is, refreshed only after ~60 m of movement.
    const last = nearFetchRef.current;
    const moved =
      !last ||
      Math.hypot(
        (fix.lat - last.lat) * 111320,
        (fix.lon - last.lon) * 111320 * Math.cos((fix.lat * Math.PI) / 180),
      ) > 60;
    if (moved && !offline) {
      nearFetchRef.current = { lat: fix.lat, lon: fix.lon };
      fetch(`/api/revgeocode?lat=${fix.lat}&lon=${fix.lon}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { name?: string | null } | null) => {
          if (body && body.name !== undefined) setNearLabel(body.name);
        })
        .catch(() => {});
    }
    // Far off the planned route = possibly lost: raise (or refresh) the family alert.
    // It stays until the family dismisses it — wandering is itself the signal.
    const current = stateRef.current;
    if (!current) return;
    if (fix.off && fix.routeMetres >= 300 && Date.now() - lostWriteRef.current >= 30000) {
      lostWriteRef.current = Date.now();
      setState({
        ...current,
        lostAlert: {
          lat: fix.lat,
          lon: fix.lon,
          near: nearLabel,
          routeMetres: fix.routeMetres,
          at: new Date().toISOString(),
        },
      });
    }
    // He should never have to fix a wrong turn himself: after a sustained deviation,
    // replan the rest of the journey from where he actually is.
    if (fix.off) {
      if (!offSinceRef.current) offSinceRef.current = Date.now();
      const sustained = Date.now() - offSinceRef.current >= 15000;
      const cooledDown = Date.now() - lastAutoReplanRef.current >= 60000;
      if (sustained && cooledDown && !replanBusy && !offline) {
        lastAutoReplanRef.current = Date.now();
        void replanFromHere();
      }
    } else {
      offSinceRef.current = 0;
    }
  }
  /** Off-route recovery: replan the remaining journey from where he actually is. */
  async function replanFromHere() {
    const current = stateRef.current;
    const fix = locationStatusRef.current;
    if (!current || !fix || replanBusy) return;
    setPreviousJourney(current.journey);
    setReplanBusy(true);
    try {
      const destination = current.journey.destination
        ? {
            lat: current.journey.destination.lat,
            lon: current.journey.destination.lon,
            name: current.journey.destination.name.en,
          }
        : (current.profile ?? defaultTravelProfile).destinations[0];
      const sgt = new Date(Date.now() + 8 * 3600_000 + 60 * 60_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const arriveBy =
        `${sgt.getUTCFullYear()}-${pad(sgt.getUTCMonth() + 1)}-${pad(sgt.getUTCDate())}` +
        `T${pad(sgt.getUTCHours())}:${pad(sgt.getUTCMinutes())}:00+08:00`;
      const pace = (current.profile ?? defaultTravelProfile).paceFactor;
      const aidMargin =
        (current.profile ?? defaultTravelProfile).mobilityAid === "walker"
          ? 0.9
          : 1;
      const { journey: replanned } = await planJourneyWithOptions({
        origin: {
          lat: fix.lat,
          lon: fix.lon,
          name: nearLabel ?? t("Your location", "您的位置"),
        },
        destination,
        arriveBy,
        stepFree: true,
        walkingSpeedFactor: pace * aidMargin,
      });
      setState({
        ...current,
        journey: replanned,
        stepIndex: 0,
        phase: "active",
        blocked: false,
        proposal: null,
        lostAlert: current.lostAlert,
        lastDeviation: { at: new Date().toISOString(), near: nearLabel },
        progressUpdatedAt: new Date().toISOString(),
      });
      offSinceRef.current = 0;
      setRecovered(true);
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(
          t(
            "You went a little off the route. I have replanned it from where you are — listen for the new directions.",
            "您刚才走偏了一点。已从您现在的位置重新规划路线，请听新的指引。",
          ),
        );
        utterance.lang = language === "en" ? "en-SG" : "zh-CN";
        utterance.rate = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      setError("load");
    } finally {
      setReplanBusy(false);
    }
  }
  function saveProfile(answers: SetupAnswers) {
    if (!state) return;
    setRepeatSeconds(answers.repeatSeconds);
    const next = {
      ...state,
      profile: travelProfileSchema.parse(answers),
      family: {
        ...state.family,
        phone: answers.familyPhone || state.family.phone,
        linked: answers.shareWithFamily,
        scopes: answers.shareWithFamily
          ? state.family.linked
            ? state.family.scopes
            : { tripUpdates: true, prepareAppointments: true }
          : { tripUpdates: false, prepareAppointments: false },
        consentedAt: answers.shareWithFamily
          ? (state.family.consentedAt ?? new Date().toISOString())
          : null,
        proposal: answers.shareWithFamily ? state.family.proposal : null,
      },
    };
    if (!saveSnapshot(next)) {
      setError("save");
      return;
    }
    setState(next);
    go("settings");
    setNotice(
      t(
        "Profile saved. Future plans will use these details.",
        "资料已保存，将用于以后的行程规划。",
      ),
    );
  }

  function go(nextView: View) {
    setView(nextView);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLHeadingElement>("#main h1");
      heading?.focus();
    });
  }
  async function prepare() {
    if (offline) return;
    setBusy(true);
    setError("");
    try {
      const result = await planJourney(
        requestForAppointment(
          state?.appointment ?? defaultAppointment,
          state?.profile,
        ),
      );
      setState({
        schemaVersion: 1,
        journey: result,
        profile: state?.profile,
        stepIndex: 0,
        phase: "planned",
        language,
        large,
        blocked: false,
        proposal: null,
        appointment: state?.appointment ?? defaultAppointment,
        family: state?.family ?? defaultFamily,
        progressUpdatedAt: null,
        lostAlert: state?.lostAlert ?? null,
        lastDeviation: state?.lastDeviation ?? null,
      });
    } catch {
      setError("load");
    } finally {
      setBusy(false);
    }
  }
  function updateFamily(family: Family): boolean {
    const current = stateRef.current;
    if (!current) return false;
    const next = { ...current, family, language, large };
    if (!saveSnapshot(next)) {
      setError("save");
      return false;
    }
    setState(next);
    return true;
  }
  async function updateAppointment(
    candidate: Appointment,
    fromCaregiver = false,
  ) {
    const current = stateRef.current;
    if (!current || current.phase === "active" || offline || busy) return;
    if (
      fromCaregiver &&
      (!current.family.linked ||
        !current.family.scopes.prepareAppointments ||
        !current.family.proposal ||
        current.family.proposal.baseRevision !== current.appointment.revision)
    ) {
      setNotice(
        t(
          "This suggestion is no longer available. Please ask for a new one.",
          "此建议已失效。请重新提出建议。",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const planned = await planJourney(
        requestForAppointment(candidate, current.profile),
      );
      if (stateRef.current !== current) {
        setNotice(
          t(
            "Your journey changed while planning. Please review and try again.",
            "规划期间行程已更改。请检查后重试。",
          ),
        );
        return;
      }
      const next: Snapshot = {
        ...current,
        journey: planned,
        appointment: {
          ...candidate,
          revision: current.appointment.revision + 1,
        },
        phase: "planned",
        stepIndex: 0,
        blocked: false,
        proposal: null,
        progressUpdatedAt: null,
        language,
        large,
        family: {
          ...current.family,
          proposal: null,
          review: fromCaregiver ? "accepted" : null,
        },
      };
      if (!saveSnapshot(next)) {
        setError("save");
        return;
      }
      setState(next);
      go("journey");
    } catch {
      setError("load");
    } finally {
      setBusy(false);
    }
  }
  async function refresh(scenario: Scenario = "normal") {
    if (!state || offline) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await refreshJourney(
        state.journey,
        state.journey.steps[state.stepIndex].id,
        scenario,
      );
      if (result.status === "replacement_available")
        setState(
          (previous) =>
            previous && {
              ...previous,
              proposal: result.journey,
              blocked: false,
            },
        );
      if (result.status === "no_accessible_route")
        setState(
          (previous) =>
            previous && { ...previous, blocked: true, proposal: null },
        );
      if (result.status === "unchanged") {
        setState(
          (previous) =>
            previous && {
              ...previous,
              blocked: false,
              proposal: null,
              journey: { ...previous.journey, updatedAt: result.checkedAt },
            },
        );
        setNotice(
          t("No further changes in this scenario.", "此情景暂无其他变化。"),
        );
      }
    } catch {
      setError("refresh");
    } finally {
      setBusy(false);
    }
  }
  function acceptPlan() {
    if (!state?.proposal) return;
    const currentId = state.journey.steps[state.stepIndex].id;
    const replacementIndex = state.proposal.steps.findIndex(
      (item) => item.id === currentId,
    );
    const next: Snapshot = {
      ...state,
      language,
      large,
      journey: state.proposal,
      stepIndex: Math.max(0, replacementIndex),
      proposal: null,
      blocked: false,
    };
    if (!saveSnapshot(next)) {
      setError("save");
      return;
    }
    setState(next);
    go("journey");
  }
  function advance() {
    if (!state || state.blocked || state.proposal || busy) return;
    setRecovered(false);
    if (state.phase === "planned")
      setState({
        ...state,
        phase: "active",
        progressUpdatedAt: new Date().toISOString(),
      });
    else if (state.stepIndex < state.journey.steps.length - 1)
      setState({
        ...state,
        stepIndex: state.stepIndex + 1,
        progressUpdatedAt: new Date().toISOString(),
      });
    else
      setState({
        ...state,
        phase: "arrived",
        progressUpdatedAt: new Date().toISOString(),
      });
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLHeadingElement>("#main h1");
      heading?.focus();
    });
  }
  const listen = (text: string) => (
    <button className="listen-button" onClick={() => speech.speak(text)}>
      {speech.speaking ? <VolumeX size={22} /> : <Volume2 size={22} />}
      {speech.speaking
        ? t("Stop reading", "停止朗读")
        : t("Say it again", "再说一次")}
    </button>
  );
  const back = view !== "journey" && (
    <button className="back-button" onClick={() => go("journey")}>
      <ArrowLeft size={20} />
      {t("Back to journey", "返回行程")}
    </button>
  );
  const timeRange = journey ? arrival(journey) : "";
  const stepNumber = state ? state.stepIndex + 1 : 1;

  return (
    <div className={`app calm-app ${personaMode} ${state?.phase ?? "setup"} ${large ? "large-text" : ""}`}>
      <a href="#main" className="skip-link">
        {t("Skip to journey", "跳至行程")}
      </a>
      <header className="site-header">
        <button
          className="brand"
          onClick={() => go("journey")}
          aria-label={t("NebulaX — your journey", "伴行 — 您的行程")}
        >
          <span className="brand-mark">
            <Route size={27} strokeWidth={2.2} />
          </span>
          <span>
            Nebula<span className="brand-x">X</span>
            <small>
              {t("A little help along the way", "安心出发，一路相伴")}
            </small>
          </span>
        </button>
        <div className="header-actions">
          <button
            className="language-button"
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            lang={language === "en" ? "zh" : "en"}
          >
            {language === "en" ? "中文" : "English"}
          </button>
          <button
            className="settings-button"
            aria-label={t("Display settings", "显示设置")}
            onClick={() => go("settings")}
          >
            <Settings2 size={24} />
          </button>
        </div>
      </header>
      <div className="demo-ribbon">
        <span className="demo-dot" />
        {isDemo
          ? t(
              "Local demo · Sample journeys and family support",
              "本地演示 · 示例行程与家属支持",
            )
          : t(
              "Connected to journey API · route verification required",
              "已连接行程服务 · 路线仍需核实",
            )}
      </div>
      {state && personaMode === "caregiver" && (
        <nav
          className="primary-nav"
          aria-label={t("Main navigation", "主要导航")}
        >
          <button
            aria-current={view === "journey" ? "page" : undefined}
            onClick={() => go("journey")}
          >
            <Route size={20} />
            {t("Where is Dad", "爸爸在哪里")}
          </button>
          <button
            aria-current={view === "appointment" ? "page" : undefined}
            onClick={() => go("appointment")}
          >
            <CalendarDays size={20} />
            {t("Appointment", "预约")}
          </button>
          <button
            aria-current={view === "family" ? "page" : undefined}
            onClick={() => go("family")}
          >
            <HeartHandshake size={20} />
            {t("Family", "家属")}
            {state.family.proposal && (
              <span
                className="notification-dot"
                aria-label={t("Suggestion waiting", "有待确认建议")}
              />
            )}
          </button>
        </nav>
      )}
      <main id="main" className="main-shell">
        {back}
        {offline && (
          <div className="connection-banner" role="status">
            <CloudOff size={24} />
            <div>
              <strong>{t("Connection unavailable", "暂时无法连接网络")}</strong>
              <p>
                {state
                  ? t(
                      "Your saved instructions are still here. Live updates are paused.",
                      "已保存的指引仍可查看。实时更新已暂停。",
                    )
                  : t(
                      "No journey is saved on this phone yet.",
                      "此手机尚未保存行程。",
                    )}
              </p>
            </div>
          </div>
        )}
        {error && (
          <div className="warning-banner" role="alert">
            <TriangleAlert size={24} />
            <div>
              <strong>
                {error === "save"
                  ? t("Could not save your changes", "无法保存更改")
                  : t("Unable to check the journey", "暂时无法检查行程")}
              </strong>
              <p>
                {error === "save"
                  ? t(
                      "Storage may be full or unavailable. Your previously saved journey has been kept.",
                      "存储空间可能已满或不可用。原先保存的行程会保留。",
                    )
                  : t(
                      "Please try again when connected. Any saved instructions remain available.",
                      "连接网络后请重试。已保存的指引仍可查看。",
                    )}
              </p>
            </div>
          </div>
        )}
        {speech.message && (
          <p className="warning-banner" role="status">
            {speech.message}
          </p>
        )}
        {notice && (
          <p className="status-note" role="status">
            {notice}
          </p>
        )}
        {!state && routeChoices && (
          <div className="onboarding">
            <section className="onboarding-card">
              <span className="eyebrow">
                {t(
                  "LAST STEP · ROUTES COMPUTED FOR HIM",
                  "最后一步 · 已按爸爸的情况算出方案",
                )}
              </span>
              <h1>
                {t("Which way does he usually go?", "平时是怎么去医院的？")}
              </h1>
              <p className="onboarding-note">
                {t(
                  "Timed at his walking pace, stairs avoided. The chosen route becomes the one we protect and re-plan around.",
                  "所有时间都按他的步速计算，并已避开楼梯。选中的路线会成为基准——遇到突发情况时，优先围绕它重新规划。",
                )}
              </p>
              {routeChoices.options.map((option, index) => {
                const modes = new Set(option.steps.map((item) => item.mode));
                const name = modes.has("train")
                  ? t("MRT with bus feeder", "地铁为主（巴士接驳）")
                  : t("Direct bus, no transfer", "巴士直达，不用换车");
                return (
                  <button
                    key={option.id}
                    className="onboarding-choice"
                    onClick={() => commitRoute(option, routeChoices.answers)}
                  >
                    <span>{name}</span>
                    <small>
                      {t(
                        `Leave ${time(option.departureTime)} · arrive ${arrival(option)}` +
                          (option.transfers === 0
                            ? " · no transfer"
                            : ` · ${option.transfers} transfer`) +
                          (index === 0 ? " · fastest" : ""),
                        `最晚 ${time(option.departureTime)} 出门 · 预计 ${arrival(option)} 到` +
                          (option.transfers === 0
                            ? " · 不用换车"
                            : ` · 换乘 ${option.transfers} 次`) +
                          (index === 0 ? " · 最快" : ""),
                      )}
                    </small>
                  </button>
                );
              })}
            </section>
          </div>
        )}
        {!state && !routeChoices && (
          <Onboarding
            language={language}
            busy={busy}
            offline={offline}
            onLanguage={setLanguage}
            onComplete={finishSetup}
          />
        )}
        {state && journey && step && (
          <>
            {state.family.linked &&
              state.family.proposal &&
              state.family.scopes.prepareAppointments &&
              view === "journey" && (
                <section className="family-suggestion-banner">
                  <HeartHandshake size={26} />
                  <div>
                    <h2>
                      {t(
                        `${state.family.proposal.author} prepared an appointment suggestion`,
                        `${state.family.proposal.author}准备了一项预约建议`,
                      )}
                    </h2>
                    <p>
                      {t(
                        "Your saved journey has not changed.",
                        "您已保存的行程尚未更改。",
                      )}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => go("appointment")}
                    >
                      {t("Review suggestion", "查看建议")}
                      <ArrowRight size={21} />
                    </button>
                  </div>
                </section>
              )}
            {personaMode === "caregiver" && view === "journey" ? (
              <CaregiverDashboard snapshot={state} language={language} position={liveFix}
                onDismiss={() => setState({ ...state, lostAlert: null })}
                onDetails={() => go("details")} onFamily={() => go("profile")} />
            ) : view === "family" ? (
              <FamilyPanel
                snapshot={state}
                language={language}
                onUpdate={updateFamily}
                onReview={() => go("appointment")}
                onRead={speech.speak}
                speaking={speech.speaking}
              />
            ) : view === "appointment" ? (
              <>
              <AppointmentPanel
                snapshot={state}
                language={language}
                busy={busy}
                offline={offline}
                onSave={updateAppointment}
                onAccept={(candidate) => updateAppointment(candidate, true)}
                onDecline={() =>
                  updateFamily({
                    ...state.family,
                    proposal: null,
                    review: "declined",
                  })
                }
              />
              {!isDemo && state.phase !== "active" && <TripPlanner language={language} profile={profile}
                onPlanned={(chosen) => setState({ ...state, journey: chosen, stepIndex: 0, phase: "planned", blocked: false, proposal: null, progressUpdatedAt: null })} />}
              </>
            ) : view === "profile" ? (
              <Onboarding
                editing
                initial={{
                  ...profile,
                  shareWithFamily: state.family.linked,
                  familyPhone: state.family.phone,
                }}
                language={language}
                busy={busy}
                offline={offline}
                onLanguage={setLanguage}
                onComplete={saveProfile}
                onCancel={() => go("settings")}
              />
            ) : view === "settings" ? (
              <section className="standalone-card">
                <span className="eyebrow">
                  {t("MAKE IT COMFORTABLE", "适合您的设置")}
                </span>
                <h1 ref={headingRef} tabIndex={-1}>
                  {t("Your display, your way", "让界面更适合您")}
                </h1>
                <button className="secondary" onClick={() => go("profile")}>
                  {t("Edit Dad’s profile", "编辑爸爸的资料")}
                  <ArrowRight />
                </button>
                <p className="field-hint">
                  {t(
                    "Home, regular destinations, walking pace, mobility, voice and sharing.",
                    "家庭地址、常去地点、步速、行动辅助、语音和分享设置。",
                  )}
                </p>
                <fieldset>
                  <legend>{t("Language", "语言")}</legend>
                  <div className="option-row">
                    <button
                      aria-pressed={language === "en"}
                      onClick={() => setLanguage("en")}
                    >
                      English
                    </button>
                    <button
                      lang="zh"
                      aria-pressed={language === "zh"}
                      onClick={() => setLanguage("zh")}
                    >
                      中文
                    </button>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t("Text size", "文字大小")}</legend>
                  <div className="option-row">
                    <button
                      aria-pressed={!large}
                      onClick={() => setLarge(false)}
                    >
                      {t("Large", "大")}
                    </button>
                    <button aria-pressed={large} onClick={() => setLarge(true)}>
                      {t("Extra large", "特大")}
                    </button>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t("Voice reminder", "语音提醒频率")}</legend>
                  <div className="option-row option-row-wrap">
                    {[
                      { s: 30, en: "Every 30s", zh: "每 30 秒" },
                      { s: 60, en: "Every 1 min", zh: "每 1 分钟" },
                      { s: 120, en: "Every 2 min", zh: "每 2 分钟" },
                      { s: 0, en: "On change", zh: "换步骤时" },
                    ].map((option) => (
                      <button
                        key={option.s}
                        aria-pressed={repeatSeconds === option.s}
                        onClick={() => setRepeatSeconds(option.s)}
                      >
                        {t(option.en, option.zh)}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="text-preview">
                  <Check size={24} />
                  <p>
                    {t(
                      "Take your time. We’ll guide you one step at a time.",
                      "慢慢来。我们会一步一步为您指路。",
                    )}
                  </p>
                </div>
                <p className="muted">
                  {t(
                    "Your choices are saved on this phone. Change spoken guidance in Dad’s profile.",
                    "您的选择会保存在此手机上。可在爸爸的资料中修改语音指引设置。",
                  )}
                </p>
                <button className="primary" onClick={() => go("journey")}>
                  {t("Back to journey", "返回行程")}
                  <ArrowRight />
                </button>
              </section>
            ) : view === "help" ? (
              <section className="standalone-card">
                <span className="large-symbol">
                  <HeartHandshake size={32} />
                </span>
                <h1 ref={headingRef} tabIndex={-1}>
                  {t("Let’s find your next step", "一起确认下一步")}
                </h1>
                <p>
                  {t(
                    "Take a moment. Your journey is still saved here.",
                    "先休息一下。您的行程仍保存在这里。",
                  )}
                </p>
                <div className="help-step">
                  <span className="eyebrow">
                    {t(
                      `LAST CONFIRMED PROGRESS · STEP ${stepNumber}`,
                      `当前进度 · 第${stepNumber}步`,
                    )}
                  </span>
                  <h2>{step.instruction[language]}</h2>
                  {listen(
                    step.instruction[language] + ". " + step.detail[language],
                  )}
                </div>
                <div className="staff-card">
                  <ShieldCheck size={26} />
                  <div>
                    <h2>{t("Ask station staff", "向车站工作人员求助")}</h2>
                    <p>
                      {t(
                        "Show them this screen. You need a step-free route to Tan Tock Seng Hospital and cannot use stairs.",
                        "请向工作人员出示此页面。您需要前往陈笃生医院的无障碍路线，无法使用楼梯。",
                      )}
                    </p>
                  </div>
                </div>
                {state.family.linked && state.family.phone ? (
                  <div className="contact-actions">
                    <h2>
                      {t(
                        `Contact ${state.family.name}`,
                        `联系${state.family.name}`,
                      )}
                    </h2>
                    <a
                      className="secondary"
                      href={`tel:${dialNumber(state.family.phone)}`}
                    >
                      {t(
                        `Call ${state.family.name}`,
                        `致电${state.family.name}`,
                      )}
                      <ArrowRight size={22} />
                    </a>
                    <a
                      className="secondary"
                      href={`sms:${dialNumber(state.family.phone)}`}
                    >
                      {t("Open a text message", "打开短信")}
                      <ArrowRight size={22} />
                    </a>
                    <p className="field-hint">
                      {t(
                        "Your phone app opens. You choose whether to call or send; cellular service is needed.",
                        "将打开手机应用。由您选择是否拨打或发送；需要移动网络信号。",
                      )}
                    </p>
                  </div>
                ) : (
                  <button className="secondary" onClick={() => go("family")}>
                    {t("Set up a family contact", "设置家属联系方式")}
                    <ArrowRight size={22} />
                  </button>
                )}
                <p className="muted">
                  {t(
                    "No help request has been sent. Ask station staff if you cannot reach someone.",
                    "未发送求助信息。如果无法联系家人，请向车站工作人员求助。",
                  )}
                </p>
                <button className="primary" onClick={() => go("journey")}>
                  {t("Return to my instructions", "返回我的指引")}
                  <ArrowRight />
                </button>
              </section>
            ) : view === "change" && state.proposal ? (
              <>
                <div className="page-heading">
                  <span className="eyebrow">
                    {t("REVIEW BEFORE YOU CHANGE", "更改前请先查看")}
                  </span>
                  <h1 ref={headingRef} tabIndex={-1}>
                    {t(
                      "A new way to the same place",
                      "换一条路线，前往同一目的地",
                    )}
                  </h1>
                  <p>
                    {t(
                      "Your current route stays saved until you accept this one.",
                      "接受新路线前，我们会保留当前路线。",
                    )}
                  </p>
                </div>
                <div className="journey-grid">
                  <section className="card comparison-card">
                    <div className="icon-heading">
                      <TriangleAlert />
                      <h2>{t("Walking approach changed", "步行路线有变化")}</h2>
                    </div>
                    <p>{state.proposal.alerts[0]?.message[language]}</p>
                    <div className="comparison-times">
                      <div>
                        <span>{t("Original arrival", "原预计到达")}</span>
                        <strong>{timeRange}</strong>
                      </div>
                      <ArrowRight />
                      <div>
                        <span>{t("Updated arrival", "新预计到达")}</span>
                        <strong>{arrival(state.proposal)}</strong>
                      </div>
                    </div>
                    <div className="reassurance">
                      <Clock3 size={22} />
                      <p>
                        {t(
                          `8 more minutes in this demo. Appointment: ${time(appointmentInstant(state.appointment))}.`,
                          `此演示增加8分钟。预约时间：${time(appointmentInstant(state.appointment))}。`,
                        )}
                      </p>
                    </div>
                    <p className="muted">
                      {t(
                        "Illustrative alternative. Accessibility has not been verified for real travel.",
                        "替代路线仅供演示。实际无障碍条件尚未核实。",
                      )}
                    </p>
                    <button className="primary" onClick={acceptPlan}>
                      {t("Use updated route", "使用更新后的路线")}
                      <Check />
                    </button>
                    <button className="secondary" onClick={() => go("journey")}>
                      {t("Back to journey", "返回行程")}
                    </button>
                  </section>
                  <LiveMap
                    journey={state.proposal}
                    original={journey}
                    language={language}
                  />
                </div>
              </>
            ) : view === "details" ? (
              <>
                <div className="page-heading">
                  <span className="eyebrow">
                    {t("THE WHOLE JOURNEY", "完整行程")}
                  </span>
                  <h1 ref={headingRef} tabIndex={-1}>
                    {t("From your door to the hospital", "从家门口到医院")}
                  </h1>
                  <p>
                    {t(
                      "One train. A gentler walking pace. Time to take it slowly.",
                      "一趟地铁。按您的步速，慢慢前行。",
                    )}
                  </p>
                </div>
                <div className="journey-grid">
                  <section className="card">
                    <p className="calm-trip-timing">{t("Leave", "出发")} {time(journey.departureTime)} · {t("Estimated arrival", "预计到达")} <strong>{timeRange}</strong></p>
                    <div className="section-heading">
                      <h2>{t("Your steps", "行程步骤")}</h2>
                      <span className="pill">
                        {t("No train changes", "无需换乘地铁")}
                      </span>
                    </div>
                    <ol className="full-steps">
                      {journey.steps.map((item, index) => {
                        const Icon = stepIcons[item.mode];
                        return (
                          <li key={item.id}>
                            <span className="step-icon">
                              <Icon size={23} />
                            </span>
                            <div>
                              <span className="eyebrow">
                                {t(
                                  `STEP ${index + 1} · ${item.durationMinutes} MIN`,
                                  `第${index + 1}步 · ${item.durationMinutes}分钟`,
                                )}
                              </span>
                              <h3>{item.instruction[language]}</h3>
                              <p>{item.detail[language]}</p>
                              {item.directions.map((direction, i) => <p key={i}>{direction[language]}</p>)}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="reassurance">
                      <Clock3 />
                      <p>
                        {t(
                          "Timing includes a slower walking pace and a buffer. These are sample estimates.",
                          "时间包含较慢步速及缓冲时间。均为示例估计。",
                        )}
                      </p>
                    </div>
                  </section>
                  <LiveMap journey={journey} language={language} />
                </div>
                <details className="calm-disclosure"><summary>{t("Travel conditions", "路线状况")}</summary>
                  {journey.alerts.map(alert => <p key={alert.id}>{alert.message[language]}</p>)}
                  <p>{t("Last checked", "最后检查")} {time(journey.updatedAt)}</p>
                  <button className="secondary" disabled={offline || busy} onClick={() => refresh()}>{t("Check for updates", "检查更新")}</button>
                </details>
              </>
            ) : state.phase === "arrived" ? (
              <section className="standalone-card arrival-card">
                <span className="arrival-check">
                  <CheckCheck size={44} />
                </span>
                <span className="eyebrow">
                  {t("JOURNEY COMPLETE", "行程已完成")}
                </span>
                <h1 ref={headingRef} tabIndex={-1}>
                  {t("You’ve arrived, Mr Tan", "陈先生，您已到达")}
                </h1>
                <p>
                  {t(
                    "Take a moment to rest before your appointment.",
                    "预约前，先休息一下吧。",
                  )}
                </p>
                <div className="destination-compact">
                  <Hospital />
                  <div>
                    <h2>
                      {journey.destination
                        ? journey.destination.name[language]
                        : t("Tan Tock Seng Hospital", "陈笃生医院")}
                    </h2>
                    <p>{appointmentLabel(state.appointment, language)}</p>
                  </div>
                </div>
                <p className="muted">
                  {t(
                    "Arrival saved on this phone. No caregiver has been notified.",
                    "到达记录已保存在此手机上。未通知家属。",
                  )}
                </p>
                <button className="secondary" onClick={() => go("details")}>
                  {t("View completed journey", "查看已完成行程")}
                  <Route />
                </button>
              </section>
            ) : (
              <>
                {state.blocked && (
                  <section className="alert-card" role="alert">
                    <TriangleAlert size={28} />
                    <div>
                      <h2>
                        {t(
                          "We cannot confirm a step-free route",
                          "暂时无法确认无障碍路线",
                        )}
                      </h2>
                      <p>
                        {t(
                          "Please ask station staff for help before continuing. Your saved route is available for reference.",
                          "继续前请向车站工作人员求助。已保存的路线可供参考。",
                        )}
                      </p>
                      <button className="secondary" onClick={() => go("help")}>
                        {t("Get help", "获取帮助")}
                        <ArrowRight />
                      </button>
                    </div>
                  </section>
                )}
                {state.proposal && (
                  <section className="alert-card" role="status">
                    <TriangleAlert size={28} />
                    <div>
                      <h2>{t("A change to your journey", "您的行程有变化")}</h2>
                      <p>{state.proposal.alerts[0]?.message[language]}</p>
                      <button
                        className="secondary"
                        onClick={() => go("change")}
                      >
                        {t("Review updated route", "查看更新后的路线")}
                        <ArrowRight />
                      </button>
                    </div>
                  </section>
                )}
                {state.phase === "planned" ? (
                  <ElderHome journey={journey} language={language} linked={state.family.linked}
                    phone={state.family.phone} disabled={busy || state.blocked || Boolean(state.proposal)}
                    onStart={advance} onDetails={() => go("details")} onHelp={() => go("help")} />
                ) : (
                  <ElderGuidance journey={journey} language={language} index={state.stepIndex}
                    position={liveFix && Date.now()-liveFix.at < 20000 ? liveFix : null}
                    remaining={liveFix && Date.now()-liveFix.at < 20000 && !liveFix.off ? liveFix.endMetres : undefined}
                    off={Boolean(liveFix?.off)} recovering={replanBusy} recovered={recovered} previous={previousJourney}
                    onContinue={() => { setRecovered(false); setPreviousJourney(undefined); }}
                    onRepeat={() => speech.speak(liveFix?.off ? t("Stop somewhere safe. Contact your family if you need help.", "请在安全的地方停下，需要帮助时请联系女儿。") : [step.instruction[language], ...step.directions.map(d => d[language])].join(" "))}
                    onHelp={() => go("help")} phone={state.family.phone} onDetails={() => go("details")}
                    controls={<LocationGuidance key={`${journey.id}-${journey.version}-${step.id}`}
                      journey={journey} stepIndex={state.stepIndex} enabled={locationEnabled}
                      onEnable={setLocationEnabled} language={language}
                      disabled={busy || state.blocked || Boolean(state.proposal) || replanBusy || recovered}
                      onAdvance={advance} onHelp={() => go("help")} voice={true}
                      nearLabel={nearLabel} replanBusy={replanBusy} onStatus={handleLiveFix} compact />}
                  />
                )}
                <p className="calm-save-note">{saved && shellReady ? t("Saved for offline use", "已保存，可离线查看") : saved ? t("Instructions saved on this phone", "指引已保存在此手机上") : t("Journey could not be saved", "无法保存行程")}</p>
              </>
            )}
          </>
        )}
        {isDemo && state && (
          <details className="demo-controls">
            <summary>{t("Demo scenarios", "演示情景")}</summary>
            <p>
              {t(
                "For reviewing the prototype. These controls simulate conditions; no live travel advice is provided.",
                "用于体验原型。以下选项模拟不同情况，不提供实时出行建议。",
              )}
            </p>
            <div className="scenario-buttons">
              <button
                disabled={offline || busy}
                onClick={() => {
                  go("journey");
                  refresh("normal");
                }}
              >
                {t("Normal journey", "正常行程")}
              </button>
              <button
                disabled={offline || busy || state.phase === "arrived"}
                onClick={() => {
                  go("journey");
                  refresh("change");
                }}
              >
                {t("Route change", "路线变化")}
              </button>
              <button
                disabled={offline || busy || state.phase === "arrived"}
                onClick={() => {
                  go("journey");
                  refresh("blocked");
                }}
              >
                {t("No accessible route", "无无障碍路线")}
              </button>
              <button
                aria-pressed={simulateOffline}
                onClick={() => setSimulateOffline(!simulateOffline)}
              >
                {simulateOffline
                  ? t("Restore connection", "恢复连接")
                  : t("Simulate offline", "模拟离线")}
              </button>
              <button
                disabled={offline || busy}
                onClick={() => {
                  go("journey");
                  prepare();
                }}
              >
                {t("Restart demo", "重新开始演示")}
              </button>
            </div>
          </details>
        )}
      </main>
      {state && (
        <details className="calm-demo-switch">
          <summary>{t("Demo views", "演示视角")}</summary>
          <p>{t("Same-browser preview only. No remote sharing.", "仅预览此浏览器中的两个视角，未连接其他手机。")}</p>
          <button className="secondary" onClick={() => {setPersonaMode("elder"); go("journey");}}>{t("Mr Tan's view", "长辈模式")}</button>
          <button className="secondary" onClick={() => {setPersonaMode("caregiver"); go("journey");}}>{t("Family view", "家人模式")}</button>
        </details>
      )}
      <footer className="site-footer">
        <span>
          <Leaf size={17} />
          {personaMode === "caregiver"
            ? t(
                "A safe journey is the best news.",
                "一路平安，就是最好的消息。",
              )
            : t(
                "With family beside you, no road is far.",
                "有家人在，路就不远。",
              )}
        </span>
        <button onClick={() => go("help")}>
          <CircleHelp size={18} />
          {t("Help", "帮助")}
        </button>
      </footer>
    </div>
  );
}
export default App;
