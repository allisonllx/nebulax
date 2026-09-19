import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  CloudOff,
  Download,
  Footprints,
  HeartHandshake,
  Hospital,
  Leaf,
  ArrowUpDown as Lift,
  BusFront,
  MapPin,
  RefreshCw,
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
import "./App.css";

type View =
  | "journey"
  | "details"
  | "change"
  | "help"
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
      return Number(localStorage.getItem("nebulax:repeat") ?? "60") || 60;
    } catch {
      return 60;
    }
  });
  // Two audiences, one app: Mr Tan gets guidance only; family gets the fuller controls.
  const [personaMode, setPersonaMode] = useState<"elder" | "caregiver">(() => {
    try {
      return localStorage.getItem("nebulax:mode") === "caregiver" ? "caregiver" : "elder";
    } catch {
      return "elder";
    }
  });
  const [online, setOnline] = useState(navigator.onLine);
  const [simulateOffline, setSimulateOffline] = useState(false);
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
    // Read the whole step, not just the headline: the turn-by-turn directions are the guidance.
    const spoken = [
      current.instruction[language],
      ...current.directions.map((direction) => direction[language]),
    ].join(" ");
    const say = () => {
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = language === "en" ? "en-SG" : "zh-CN";
      utterance.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    say();
    if (!repeatSeconds || Number.isNaN(repeatSeconds)) return;
    const timer = window.setInterval(say, repeatSeconds * 1000);
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
  function commitRoute(chosen: import("./journey").Journey, answers: SetupAnswers) {
    setState({
      schemaVersion: 1,
      journey: chosen,
      stepIndex: 0,
      phase: "planned",
      language,
      large: true,
      blocked: false,
      proposal: null,
      appointment: defaultAppointment,
      family: {
        ...defaultFamily,
        linked: answers.shareWithFamily,
        scopes: {
          tripUpdates: answers.shareWithFamily,
          prepareAppointments: answers.shareWithFamily,
        },
        consentedAt: answers.shareWithFamily ? new Date().toISOString() : null,
      },
      progressUpdatedAt: null,
    });
    setRouteChoices(null);
    setPersonaMode("elder");
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
        requestForAppointment(state?.appointment ?? defaultAppointment),
      );
      setState({
        schemaVersion: 1,
        journey: result,
        stepIndex: 0,
        phase: "planned",
        language,
        large,
        blocked: false,
        proposal: null,
        appointment: state?.appointment ?? defaultAppointment,
        family: state?.family ?? defaultFamily,
        progressUpdatedAt: null,
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
      const planned = await planJourney(requestForAppointment(candidate));
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
        : t("Read aloud", "朗读指引")}
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
    <div className={`app ${large ? "large-text" : ""}`}>
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
        {state?.phase === "active" && view === "journey" && (
          <nav
            className="journey-tools"
            aria-label={t("Journey help", "行程帮助")}
          >
            <span>
              {t(
                `Step ${stepNumber} of ${state.journey.steps.length}`,
                `第${stepNumber}步，共${state.journey.steps.length}步`,
              )}
            </span>
            <button onClick={() => go("help")}>
              <CircleHelp size={21} />
              {t("Get help", "获取帮助")}
            </button>
          </nav>
        )}
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
                {t("LAST STEP · ROUTES COMPUTED FOR HIM", "最后一步 · 已按爸爸的情况算出方案")}
              </span>
              <h1>
                {t(
                  "Which way does he usually go?",
                  "平时是怎么去医院的？",
                )}
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
                          (option.transfers === 0 ? " · no transfer" : ` · ${option.transfers} transfer`) +
                          (index === 0 ? " · fastest" : ""),
                        `最晚 ${time(option.departureTime)} 出门 · 预计 ${arrival(option)} 到` +
                          (option.transfers === 0 ? " · 不用换车" : ` · 换乘 ${option.transfers} 次`) +
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
              <section className="caregiver-home">
                <span className="eyebrow">
                  {t("FAMILY VIEW", "家人视角")}
                </span>
                <h1 ref={headingRef} tabIndex={-1}>
                  {state.phase === "active"
                    ? t("Dad is on his way.", "爸爸正在路上。")
                    : state.phase === "arrived"
                      ? t(
                          `Dad has arrived safely at ${journey.destination?.name.en ?? "the hospital"}.`,
                          `爸爸已安全到达${journey.destination?.name.zh ?? "医院"}。`,
                        )
                      : t("Dad has not left yet.", "爸爸还没出发。")}
                </h1>
                {state.family.linked && state.family.scopes.tripUpdates ? (
                  <>
                    <div className="caregiver-status card">
                      {state.phase === "active" && step ? (
                        <>
                          <div className="caregiver-progress">
                            <strong>
                              {t(
                                `Step ${stepNumber} of ${state.journey.steps.length}`,
                                `第 ${stepNumber} 步，共 ${state.journey.steps.length} 步`,
                              )}
                            </strong>
                            <div
                              className="progress-track"
                              role="progressbar"
                              aria-valuemin={1}
                              aria-valuemax={state.journey.steps.length}
                              aria-valuenow={stepNumber}
                            >
                              <span
                                style={{
                                  width: `${Math.round((stepNumber / state.journey.steps.length) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p className="caregiver-step">
                            {language === "en"
                              ? step.instruction.en
                              : step.instruction.zh}
                          </p>
                        </>
                      ) : state.phase === "planned" ? (
                        <p className="caregiver-step">
                          {t(
                            `Route is ready. He should leave by ${time(journey.departureTime)} and arrive ${timeRange}.`,
                            `路线已备好。最晚 ${time(journey.departureTime)} 出门，预计 ${timeRange} 到达。`,
                          )}
                        </p>
                      ) : (
                        <p className="caregiver-step">
                          {t(
                            `The journey to ${journey.destination?.name.en ?? "the hospital"} is complete.`,
                            `前往${journey.destination?.name.zh ?? "医院"}的行程已完成。`,
                          )}
                        </p>
                      )}
                      <small className="caregiver-updated">
                        {state.progressUpdatedAt
                          ? t(
                              `He confirmed this himself · last update ${time(state.progressUpdatedAt)}`,
                              `由爸爸亲自确认 · 最后更新 ${time(state.progressUpdatedAt)}`,
                            )
                          : t(
                              "Updates appear here once he starts.",
                              "爸爸开始行程后，这里会显示进展。",
                            )}
                      </small>
                    </div>
                    <LiveMap journey={journey} language={language} />
                  </>
                ) : (
                  <div className="caregiver-status card">
                    <p className="caregiver-step">
                      {t(
                        "Mr Tan has not shared trip progress. He can turn it on under Family settings.",
                        "陈伯暂未共享行程进展。他可以在“家属”页里随时开启。",
                      )}
                    </p>
                  </div>
                )}
                <div className="caregiver-actions">
                  <button className="secondary" onClick={() => go("appointment")}>
                    <CalendarDays size={20} />
                    {t("Manage appointment", "管理预约")}
                  </button>
                  <button className="secondary" onClick={() => go("family")}>
                    <HeartHandshake size={20} />
                    {t("Family settings", "家属设置")}
                  </button>
                </div>
                {!isDemo && (
                  <TripPlanner
                    language={language}
                    onPlanned={(chosen) => {
                      setState({
                        ...state,
                        journey: chosen,
                        stepIndex: 0,
                        phase: "planned",
                        blocked: false,
                        proposal: null,
                        progressUpdatedAt: null,
                      });
                      setNotice(
                        t("New journey saved for Mr Tan.", "新行程已保存，爸爸那边已更新。"),
                      );
                    }}
                  />
                )}
              </section>
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
            ) : view === "settings" ? (
              <section className="standalone-card">
                <span className="eyebrow">
                  {t("MAKE IT COMFORTABLE", "适合您的设置")}
                </span>
                <h1 ref={headingRef} tabIndex={-1}>
                  {t("Your display, your way", "让界面更适合您")}
                </h1>
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
                    "Your choices are saved on this phone. Read-aloud starts only when you choose it.",
                    "您的选择会保存在此手机上。只有在您点击后才会开始朗读。",
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
                <div
                  className={`page-heading greeting ${state.phase === "active" ? "active-heading" : ""}`}
                >
                  <div>
                    <span className="eyebrow">
                      {state.phase === "active"
                        ? t("ONE STEP AT A TIME", "一步一步，安心前行")
                        : t("YOUR NEXT JOURNEY", "您的下一段行程")}
                    </span>
                    <h1 ref={headingRef} tabIndex={-1}>
                      {state.phase === "active" ? (
                        t("On your way, Mr Tan.", "陈先生，安心前行。")
                      ) : (
                        <>
                          {t("Good morning,", "早上好，")}
                          <br />
                          {t("Mr Tan.", "陈先生。")}
                        </>
                      )}
                    </h1>
                    <p>
                      {state.phase === "active"
                        ? t(
                            "There’s no rush. Follow the instruction below.",
                            "不用着急。请按照下方指引前行。",
                          )
                        : t(
                            "A familiar journey. A little more peace of mind.",
                            "熟悉的旅程，多一份安心。",
                          )}
                    </p>
                  </div>
                  <span className="greeting-art" aria-hidden="true">
                    <Leaf size={52} strokeWidth={1.3} />
                    <span className="art-line" />
                  </span>
                </div>
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
                <div className="journey-grid">
                  <div className="journey-column">
                    {state.phase === "planned" ? (
                      <section className="card trip-card">
                        <div className="destination">
                          <span className="destination-icon">
                            <Hospital size={29} />
                          </span>
                          <div>
                            <span className="eyebrow">
                              {!journey.destination ||
                              journey.destination.name.en.toLowerCase().includes("hospital")
                                ? t("HOSPITAL APPOINTMENT", "医院预约")
                                : t("YOUR TRIP", "您的行程")}
                            </span>
                            <h2>
                              {journey.destination
                                ? journey.destination.name[language]
                                : t("Tan Tock Seng Hospital", "陈笃生医院")}
                            </h2>
                            <p>
                              {t(
                                appointmentLabel(state.appointment, "en"),
                                appointmentLabel(state.appointment, "zh"),
                              )}
                            </p>
                          </div>
                        </div>
                        {state.appointment.note && (
                          <p className="appointment-note">
                            <CalendarDays size={18} />
                            {state.appointment.note}
                          </p>
                        )}
                        <div className="departure-panel">
                          <div>
                            <span>{t("Leave home at", "出发时间")}</span>
                            <strong>{time(journey.departureTime)}</strong>
                          </div>
                          <span className="departure-arrow">
                            <ArrowRight size={26} />
                          </span>
                          <div>
                            <span>{t("Estimated arrival", "预计到达")}</span>
                            <strong className="arrival-time">
                              {timeRange}
                            </strong>
                            <small>
                              {t(
                                `Appointment at ${time(appointmentInstant(state.appointment))}`,
                                `预约时间：${time(appointmentInstant(state.appointment))}`,
                              )}
                            </small>
                          </div>
                        </div>
                        <div className="preference-row">
                          <span>
                            <Footprints size={20} />
                            {journey.walkDistanceMetres != null
                              ? t(
                                  `${journey.walkDistanceMetres} m walking, at your pace`,
                                  `步行共 ${journey.walkDistanceMetres} 米，按您的步速`,
                                )
                              : t("Timed at your pace", "按您的步速")}
                          </span>
                          <span>
                            <Route size={20} />
                            {journey.transfers === 0
                              ? t("No transfer", "不用换车")
                              : t(
                                  `${journey.transfers ?? "?"} transfer`,
                                  `换乘 ${journey.transfers ?? "?"} 次`,
                                )}
                          </span>
                          <span>
                            <Lift size={20} />
                            {t("No stairs", "无需爬楼梯")}
                          </span>
                        </div>
                        <button
                          className="primary"
                          disabled={
                            busy || state.blocked || Boolean(state.proposal)
                          }
                          onClick={advance}
                        >
                          {t("Start journey", "开始行程")}
                          <ArrowRight size={25} />
                        </button>
                        <div className="route-summary">
                          <span className="route-dot" />
                          <div>
                            <strong>
                              {journey.origin
                                ? journey.origin.name[language]
                                : t("Home, Ang Mo Kio", "家，宏茂桥")}
                            </strong>
                            <span>{journey.steps[0].instruction[language]}</span>
                          </div>
                          {journey.steps
                            .filter(
                              (item, index, all) =>
                                item.mode !== "walk" &&
                                all.findIndex(
                                  (other) =>
                                    other.mode === item.mode &&
                                    (other.mode === "bus"
                                      ? true
                                      : other.id === item.id),
                                ) === index,
                            )
                            .slice(0, 1)
                            .map((item) => (
                              <span key={item.id} className="rail-badge">
                                {item.mode === "bus" ? t("BUS", "巴士") : "NS"}
                              </span>
                            ))}
                          <div>
                            <strong>
                              {journey.destination
                                ? journey.destination.name[language]
                                : t("Novena → Hospital", "诺维娜 → 医院")}
                            </strong>
                            <span>
                              {journey.transfers === 0
                                ? t("No transfer", "不用换车")
                                : t(
                                    `${journey.transfers} transfer`,
                                    `换乘 ${journey.transfers} 次`,
                                  )}
                            </span>
                          </div>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => go("details")}
                        >
                          {t("See the full route", "查看完整路线")}
                          <ChevronRight size={20} />
                        </button>
                        {state.family.linked && (
                          <div className="family-strip is-static">
                            <HeartHandshake size={26} />
                            <span>
                              <strong>
                                {t(
                                  "Mei Ling set this journey up with you",
                                  "这段行程是美玲和您一起安排的",
                                )}
                              </strong>
                              <small>
                                {t(
                                  "She can see how your trip is going",
                                  "她可以看到您的行程进展，请安心出发",
                                )}
                              </small>
                            </span>
                          </div>
                        )}
                      </section>
                    ) : (
                      <section className="card guidance-card">
                        {step && step.mode === "train" && (
                          <div className="tunnel-banner">
                            <Download size={22} />
                            <span>
                              {t(
                                "No signal underground ahead — your instructions are already saved on this phone.",
                                "前方地下路段没有信号——指引已提前保存在这部手机上，请放心。",
                              )}
                            </span>
                          </div>
                        )}
                        <div className="section-heading">
                          <span className="eyebrow">
                            {t(
                              `STEP ${stepNumber} OF ${journey.steps.length}`,
                              `第${stepNumber}步，共${journey.steps.length}步`,
                            )}
                          </span>
                          <span className="pill">
                            <Clock3 size={16} />
                            {timeRange}
                          </span>
                        </div>
                        <div
                          className="progress-track"
                          aria-label={t(
                            `Step ${stepNumber} of ${journey.steps.length}`,
                            `第${stepNumber}步，共${journey.steps.length}步`,
                          )}
                        >
                          {journey.steps.map((item, i) => (
                            <span
                              key={item.id}
                              className={i <= state.stepIndex ? "done" : ""}
                            />
                          ))}
                        </div>
                        <span className="instruction-icon">
                          {(() => {
                            const Icon = stepIcons[step.mode];
                            return <Icon size={36} />;
                          })()}
                        </span>
                        <h2 className="instruction-title">
                          {step.instruction[language]}
                        </h2>
                        {!step.instruction[language].includes(
                          step.place[language],
                        ) && (
                          <p className="step-place">
                            <MapPin size={18} />
                            {step.place[language]}
                          </p>
                        )}
                        {step.directions.length > 0 && (
                          <ol className="direction-list">
                            {step.directions.map((direction, index) => (
                              <li key={index}>{direction[language]}</li>
                            ))}
                          </ol>
                        )}
                        {step.mode === "walk" && step.distanceMetres != null ? (
                          <p className="instruction-detail">
                            {t(
                              `About ${step.distanceMetres} m in total.`,
                              `全程大约 ${step.distanceMetres} 米。`,
                            )}
                          </p>
                        ) : (
                          <p className="instruction-detail">
                            {step.detail[language]}
                          </p>
                        )}
                        {state.stepIndex < journey.steps.length - 1 ? (
                          <p className="next-preview">
                            {t("After this: ", "接下来：")}
                            {journey.steps[state.stepIndex + 1].instruction[language]}
                          </p>
                        ) : (
                          <p className="next-preview">
                            {t("This is the last step.", "这是最后一步。")}
                          </p>
                        )}
                        {listen(
                          [step.instruction[language],
                           ...step.directions.map((direction) => direction[language])].join(" "),
                        )}
                        <button
                          className="primary"
                          disabled={
                            busy || state.blocked || Boolean(state.proposal)
                          }
                          onClick={advance}
                        >
                          {step.confirmation[language]}
                          <Check size={25} />
                        </button>
                        {state.stepIndex > 0 && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setState({
                                ...state,
                                stepIndex: state.stepIndex - 1,
                              })
                            }
                          >
                            <ArrowLeft size={20} />
                            {t("Previous instruction", "上一条指引")}
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => go("details")}
                        >
                          {t("See the full route", "查看完整路线")}
                          <ChevronRight size={20} />
                        </button>
                      </section>
                    )}
                    <div className="saved-card">
                      <span className="saved-icon">
                        {saved ? (
                          <Download size={23} />
                        ) : (
                          <TriangleAlert size={23} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {saved && shellReady
                            ? t("Saved for offline use", "已保存，可离线查看")
                            : saved
                              ? t(
                                  "Instructions saved on this phone",
                                  "指引已保存在此手机上",
                                )
                              : t("Journey could not be saved", "无法保存行程")}
                        </strong>
                        <p>
                          {saved && shellReady
                            ? t(
                                "Your route and instructions stay with you, even without a connection.",
                                "即使没有网络，也能查看路线和指引。",
                              )
                            : saved
                              ? t(
                                  "Full offline reopening is available after the app finishes downloading.",
                                  "应用下载完成后，即可离线重新打开。",
                                )
                              : t(
                                  "Keep this screen open. Storage may be unavailable.",
                                  "请保持此页面打开。手机存储可能不可用。",
                                )}
                        </p>
                      </div>
                      {saved && <Check size={22} />}
                    </div>
                  </div>
                  <aside className="journey-aside">
                    <LiveMap
                      journey={journey}
                      language={language}
                      currentLegId={
                        state.phase === "active" ? step?.legId : undefined
                      }
                    />
                    <div className="conditions-card">
                      <div>
                        <span className="status-dot" />
                        <strong>
                          {isDemo
                            ? t("Sample travel conditions", "示例路况")
                            : t("Live travel conditions", "实时路况")}
                        </strong>
                      </div>
                      {journey.alerts.length === 0 ? (
                        <p>
                          {t(
                            "Checked: no train disruption on this route, no lift maintenance reported at his stations, no rain expected on the walks.",
                            "已核查：本路线无列车故障通告，上下车车站无电梯维修记录，步行沿途暂无降雨。",
                          )}
                        </p>
                      ) : (
                        <ul className="conditions-alerts">
                          {journey.alerts.map((alert) => (
                            <li key={alert.id}>{alert.message[language]}</li>
                          ))}
                        </ul>
                      )}
                      <div className="conditions-bottom">
                        <span>
                          {t("Last update", "最后更新")}{" "}
                          {time(journey.updatedAt)}
                        </span>
                        <button
                          aria-label={t("Check for updates", "检查更新")}
                          disabled={offline || busy}
                          onClick={() => refresh()}
                        >
                          <RefreshCw size={17} />
                          {busy
                            ? t("Checking…", "检查中…")
                            : t("Check", "检查")}
                        </button>
                      </div>
                    </div>
                  </aside>
                </div>
                <div className="help-strip">
                  <div>
                    <HeartHandshake size={28} />
                    <span>
                      {t(
                        "A little help is always okay.",
                        "需要帮忙，随时开口。",
                      )}
                    </span>
                  </div>
                  <button onClick={() => go("help")}>
                    {t("Get help", "获取帮助")}
                    <ArrowRight size={21} />
                  </button>
                </div>
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
        <div className="mode-bar" role="group" aria-label={t("Who is using the app", "使用者模式")}>
          <button
            aria-pressed={personaMode === "elder"}
            onClick={() => {
              setPersonaMode("elder");
              go("journey");
            }}
          >
            <Route size={22} />
            {t("Mr Tan's view", "长辈模式")}
          </button>
          <button
            aria-pressed={personaMode === "caregiver"}
            onClick={() => {
              setPersonaMode("caregiver");
              go("journey");
            }}
          >
            <HeartHandshake size={22} />
            {t("Family view", "家人模式")}
          </button>
        </div>
      )}
      <footer className="site-footer">
        <span>
          <Leaf size={17} />
          {t("A little confidence. Every journey.", "每一段旅程，多一份安心。")}
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
