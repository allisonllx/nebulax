import { useState } from "react";
import { ArrowLeft, ArrowRight, HeartHandshake } from "lucide-react";
import type { Language } from "./journey";

export interface SetupAnswers {
  mobilityAid: "none" | "cane" | "walker";
  /** Derived walking-speed factor from "how long is your walk to the station". */
  paceFactor: number;
  voice: "text" | "voice" | "both";
  shareWithFamily: boolean;
}

interface Props {
  language: Language;
  busy: boolean;
  offline: boolean;
  onLanguage: (language: Language) => void;
  onComplete: (answers: SetupAnswers) => void;
}

const WALK_PRESETS = [5, 10, 15, 20] as const;

// Continuous pace factor from the home-to-station walk time. Fits the old presets
// (5→~0.95, 10→~0.78, 15→~0.62, 20→~0.46) and extends smoothly to any entered value.
function paceFromMinutes(minutes: number): number {
  return Math.min(1.0, Math.max(0.3, 1.1 - 0.032 * minutes));
}

export function Onboarding({ language, busy, offline, onLanguage, onComplete }: Props) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [stage, setStage] = useState(0);
  const [mobilityAid, setMobilityAid] = useState<SetupAnswers["mobilityAid"]>("cane");
  const [walkMinutes, setWalkMinutes] = useState(15);
  const [voice, setVoice] = useState<SetupAnswers["voice"]>("both");
  const [share, setShare] = useState(true);

  const choice = (active: boolean, onClick: () => void, label: string, hint?: string) => (
    <button className={`onboarding-choice${active ? " is-active" : ""}`} aria-pressed={active} onClick={onClick}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );

  const stages = [
    // 0 — welcome, addressed to the daughter
    <section key="w" className="onboarding-card">
      <HeartHandshake size={44} className="onboarding-icon" />
      <span className="eyebrow">{t("SET UP TOGETHER", "一起完成设置")}</span>
      <h1>{t("Mei Ling, set this up with your dad", "美玲，请和爸爸一起回答几个问题")}</h1>
      <p>
        {t(
          "Four quick questions. The answers shape every route we plan for him.",
          "只有四个问题。每一条为爸爸规划的路线，都会按这些答案来定。",
        )}
      </p>
      <div className="option-row">
        <button aria-pressed={language === "zh"} onClick={() => onLanguage("zh")}>中文</button>
        <button aria-pressed={language === "en"} onClick={() => onLanguage("en")}>English</button>
      </div>
      <button className="primary" onClick={() => setStage(1)}>
        {t("Start", "开始设置")}
        <ArrowRight />
      </button>
    </section>,
    // 1 — mobility aid
    <section key="q1" className="onboarding-card">
      <span className="eyebrow">{t("QUESTION 1 OF 4", "第 1 题，共 4 题")}</span>
      <h1>{t("What does he use when going out?", "爸爸出门时用什么辅助？")}</h1>
      {choice(mobilityAid === "none", () => setMobilityAid("none"), t("Nothing", "不用辅助"))}
      {choice(mobilityAid === "cane", () => setMobilityAid("cane"), t("Walking stick", "拐杖"))}
      {choice(mobilityAid === "walker", () => setMobilityAid("walker"), t("Walker", "助行器"))}
      <p className="onboarding-note">
        {t("Routes always avoid stairs, whatever the answer.", "无论选哪项，路线都会避开楼梯。")}
      </p>
    </section>,
    // 2 — pace, asked as a fact he knows
    <section key="q2" className="onboarding-card">
      <span className="eyebrow">{t("QUESTION 2 OF 4", "第 2 题，共 4 题")}</span>
      <h1>
        {t(
          "How long is his walk from home to Ang Mo Kio station?",
          "从家走到宏茂桥地铁站，爸爸平时要走多久？",
        )}
      </h1>
      {WALK_PRESETS.map((m) =>
        choice(walkMinutes === m, () => setWalkMinutes(m),
          t(`About ${m} minutes`, `大约 ${m} 分钟`)),
      )}
      <label className="onboarding-field">
        <span>{t("Or enter the exact minutes", "或直接填写具体分钟数")}</span>
        <div className="onboarding-number">
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={(WALK_PRESETS as readonly number[]).includes(walkMinutes) ? "" : walkMinutes || ""}
            placeholder={t("e.g. 22", "例如 22")}
            onChange={(event) => {
              const value = parseInt(event.target.value, 10);
              if (!Number.isNaN(value)) setWalkMinutes(Math.min(60, Math.max(1, value)));
            }}
          />
          <span>{t("min", "分钟")}</span>
        </div>
      </label>
      <p className="onboarding-note">
        {t("This sets his real walking pace — every timing uses it.", "这决定了爸爸的真实步速，所有时间都按它计算。")}
      </p>
    </section>,
    // 3 — how instructions are given
    <section key="q3" className="onboarding-card">
      <span className="eyebrow">{t("QUESTION 3 OF 4", "第 3 题，共 4 题")}</span>
      <h1>{t("How should instructions reach him?", "路上的指引怎么给爸爸？")}</h1>
      {choice(voice === "text", () => setVoice("text"), t("Large text", "看大字"))}
      {choice(voice === "voice", () => setVoice("voice"), t("Read aloud", "听语音"))}
      {choice(voice === "both", () => setVoice("both"), t("Both", "大字加语音"))}
    </section>,
    // 4 — consent, phrased as his choice
    <section key="q4" className="onboarding-card">
      <span className="eyebrow">{t("QUESTION 4 OF 4", "第 4 题，共 4 题")}</span>
      <h1>{t("Mr Tan — may Mei Ling see how your trip is going?", "陈伯——让美玲看到您走到哪一步了，好吗？")}</h1>
      {choice(share, () => setShare(true), t("Yes, she may", "可以"),
        t("She sees which step you are on — never your exact location.", "她只看到您走到第几步，不是精确位置。"))}
      {choice(!share, () => setShare(false), t("Not for now", "暂时不要"),
        t("The app works fully either way. You can change this later.", "不影响使用，以后随时可以改。"))}
      <button
        className="primary"
        disabled={busy || offline}
        onClick={() =>
          onComplete({ mobilityAid, paceFactor: paceFromMinutes(walkMinutes), voice, shareWithFamily: share })
        }
      >
        {busy ? t("Planning his route…", "正在为爸爸规划路线…") : t("Plan his route", "为爸爸规划路线")}
        <ArrowRight />
      </button>
      {offline && (
        <p className="onboarding-note">{t("Connect to the internet once to plan.", "首次规划需要连接网络。")}</p>
      )}
    </section>,
  ];

  return (
    <div className="onboarding">
      {stage > 0 && (
        <button className="text-button onboarding-back" onClick={() => setStage(stage - 1)}>
          <ArrowLeft size={20} />
          {t("Back", "上一题")}
        </button>
      )}
      {stages[stage]}
      {stage > 0 && stage < 4 && (
        <button className="primary onboarding-next" onClick={() => setStage(stage + 1)}>
          {t("Next", "下一题")}
          <ArrowRight />
        </button>
      )}
    </div>
  );
}
