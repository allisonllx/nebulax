import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, HeartHandshake } from "lucide-react";
import type { Language } from "./journey";

import { PlaceField } from "./PlaceField";
import { defaultTravelProfile, type TravelProfile } from "./travelProfile";
import type { PlacePin } from "./journey";
export interface SetupAnswers extends TravelProfile {
  shareWithFamily: boolean;
}

interface Props {
  initial?: SetupAnswers;
  editing?: boolean;
  onCancel?: () => void;
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

export function Onboarding({
  language,
  busy,
  offline,
  onLanguage,
  onComplete,
  initial,
  editing = false,
  onCancel,
}: Props) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [stage, setStage] = useState(editing ? 1 : 0);
  const [mobilityAid, setMobilityAid] = useState<SetupAnswers["mobilityAid"]>(
    initial?.mobilityAid ?? "cane",
  );
  const initialWalkMinutes =
    initial?.walkMinutes ??
    (initial ? Math.round((1.1 - initial.paceFactor) / 0.032) : 15);
  const [walkMinutes, setWalkMinutes] = useState(initialWalkMinutes);
  const [voice, setVoice] = useState<SetupAnswers["voice"]>(
    initial?.voice ?? "both",
  );
  const [share, setShare] = useState(initial?.shareWithFamily ?? true);

  const [home, setHome] = useState<PlacePin | null>(initial?.home ?? null);
  const [destinations, setDestinations] = useState<(PlacePin | null)[]>(
    initial?.destinations ?? [null],
  );
  const validPlaces =
    home !== null && destinations.length > 0 && destinations.every(Boolean);

  const choice = (
    active: boolean,
    onClick: () => void,
    label: string,
    hint?: string,
  ) => (
    <button
      key={label}
      className={`onboarding-choice${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="onboarding-choice-copy">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <span className="onboarding-choice-mark" aria-hidden="true">
        {active && <Check size={20} strokeWidth={2.5} />}
      </span>
    </button>
  );

  const stages = [
    // 0 — welcome, addressed to the daughter
    <section key="w" className="onboarding-card">
      <header className="onboarding-question">
      <HeartHandshake size={36} className="onboarding-icon" aria-hidden="true" />
      <span className="eyebrow">{t("SET UP TOGETHER", "一起完成设置")}</span>
      <h1>
        {t(
          "Mei Ling, set this up with your dad",
          "美玲，请和爸爸一起回答几个问题",
        )}
      </h1>
      </header>
      <p>
        {t(
          "Five quick questions. The answers shape every route we plan for him.",
          "只有五个问题。每一条为爸爸规划的路线，都会按这些答案来定。",
        )}
      </p>
      <div className="option-row">
        <button
          aria-pressed={language === "zh"}
          onClick={() => onLanguage("zh")}
        >
          中文
        </button>
        <button
          aria-pressed={language === "en"}
          onClick={() => onLanguage("en")}
        >
          English
        </button>
      </div>
      <button className="primary" onClick={() => setStage(1)}>
        {t("Start", "开始设置")}
        <ArrowRight />
      </button>
    </section>,
    <section key="places" className="onboarding-card">
      <header className="onboarding-question">
      <span className="eyebrow">
        {t("QUESTION 1 OF 5", "第 1 题，共 5 题")}
      </span>
      <h1>
        {t(
          "Where does Dad live, and where does he often go?",
          "爸爸住在哪里，平时常去哪里？",
        )}
      </h1>
      </header>
      <p>
        {t(
          "Mei Ling, save his home and familiar destinations. Choose a search result to confirm each address.",
          "美玲，请保存爸爸的家和常去地点。选择搜索结果以确认地址。",
        )}
      </p>
      <PlaceField
        label={t("Home address", "家庭地址")}
        language={language}
        value={home}
        onPick={setHome}
      />
      {destinations.map((place, i) => (
        <div key={i} className="saved-place-row">
          <PlaceField
            label={t(`Destination ${i + 1}`, `常去地点 ${i + 1}`)}
            language={language}
            value={place}
            onPick={(value) =>
              setDestinations((previous) =>
                previous.map((p, j) => (i === j ? value : p)),
              )
            }
          />
          {destinations.length > 1 && (
            <button
              className="text-button"
              onClick={() =>
                setDestinations((previous) =>
                  previous.filter((_, j) => j !== i),
                )
              }
            >
              {t(`Remove destination ${i + 1}`, `移除地点 ${i + 1}`)}
            </button>
          )}
        </div>
      ))}
      <p className="field-hint">
        {t(
          "The first destination is used for appointment journeys. All saved places are available in the family trip planner.",
          "第一个地点用于预约行程。家人可在规划行程时选择所有已保存地点。",
        )}
      </p>
      {destinations.length < 8 && (
        <button
          className="secondary"
          onClick={() => setDestinations([...destinations, null])}
        >
          {t("Add another destination", "添加常去地点")}
        </button>
      )}
      {!editing && (
        <button
          className="text-button"
          onClick={() => {
            setHome(defaultTravelProfile.home);
            setDestinations(defaultTravelProfile.destinations);
          }}
        >
          {t(
            "Use sample: Ang Mo Kio home → TTSH",
            "使用示例：宏茂桥的家 → 陈笃生医院",
          )}
        </button>
      )}
    </section>,
    // 1 — mobility aid
    <section key="q1" className="onboarding-card">
      <header className="onboarding-question">
      <span className="eyebrow">
        {t("QUESTION 2 OF 5", "第 2 题，共 5 题")}
      </span>
      <h1>{t("What does he use when going out?", "爸爸出门时用什么辅助？")}</h1>
      </header>
      {choice(
        mobilityAid === "none",
        () => setMobilityAid("none"),
        t("Nothing", "不用辅助"),
      )}
      {choice(
        mobilityAid === "cane",
        () => setMobilityAid("cane"),
        t("Walking stick", "拐杖"),
      )}
      {choice(
        mobilityAid === "walker",
        () => setMobilityAid("walker"),
        t("Walker", "助行器"),
      )}
      <p className="onboarding-note">
        {t(
          "Routes always avoid stairs, whatever the answer.",
          "无论选哪项，路线都会避开楼梯。",
        )}
      </p>
    </section>,
    // 2 — pace, asked as a fact he knows
    <section key="q2" className="onboarding-card">
      <header className="onboarding-question">
      <span className="eyebrow">
        {t("QUESTION 3 OF 5", "第 3 题，共 5 题")}
      </span>
      <h1>
        {t(
          "How long does Dad usually take to walk from home to his nearest station?",
          "爸爸从家走到最近的车站，平时要多久？",
        )}
      </h1>
      </header>
      {WALK_PRESETS.map((m) =>
        choice(
          walkMinutes === m,
          () => setWalkMinutes(m),
          t(`About ${m} minutes`, `大约 ${m} 分钟`),
        ),
      )}
      <label className="onboarding-field">
        <span>{t("Or enter the exact minutes", "或直接填写具体分钟数")}</span>
        <div className="onboarding-number">
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={
              (WALK_PRESETS as readonly number[]).includes(walkMinutes)
                ? ""
                : walkMinutes || ""
            }
            placeholder={t("e.g. 22", "例如 22")}
            onChange={(event) => {
              const value = parseInt(event.target.value, 10);
              if (!Number.isNaN(value))
                setWalkMinutes(Math.min(60, Math.max(1, value)));
            }}
          />
          <span>{t("min", "分钟")}</span>
        </div>
      </label>
      <p className="onboarding-note">
        {t(
          "Journey estimates use this pace. You can adjust it later.",
          "行程时间将按此步速估算，以后随时可以修改。",
        )}
      </p>
    </section>,
    // 3 — how instructions are given
    <section key="q3" className="onboarding-card">
      <header className="onboarding-question">
      <span className="eyebrow">
        {t("QUESTION 4 OF 5", "第 4 题，共 5 题")}
      </span>
      <h1>
        {t("How should instructions reach him?", "路上的指引怎么给爸爸？")}
      </h1>
      </header>
      {choice(
        voice === "text",
        () => setVoice("text"),
        t("Large text", "看大字"),
      )}
      {choice(
        voice === "voice",
        () => setVoice("voice"),
        t("Read aloud", "听语音"),
      )}
      {choice(
        voice === "both",
        () => setVoice("both"),
        t("Both", "大字加语音"),
      )}
    </section>,
    // 4 — consent, phrased as his choice
    <section key="q4" className="onboarding-card">
      <header className="onboarding-question">
      <span className="eyebrow">
        {t("QUESTION 5 OF 5", "第 5 题，共 5 题")}
      </span>
      <h1>
        {t(
          "Mr Tan — may Mei Ling see how your trip is going?",
          "陈伯——让美玲看到您走到哪一步了，好吗？",
        )}
      </h1>
      </header>
      {choice(
        share,
        () => setShare(true),
        t("Yes, she may", "可以"),
        t(
          "She sees which step you are on — never your exact location.",
          "她只看到您走到第几步，不是精确位置。",
        ),
      )}
      {choice(
        !share,
        () => setShare(false),
        t("Not for now", "暂时不要"),
        t(
          "The app works fully either way. You can change this later.",
          "不影响使用，以后随时可以改。",
        ),
      )}
      <button
        className="primary"
        disabled={busy || (!editing && offline) || !validPlaces}
        onClick={() =>
          home &&
          validPlaces &&
          onComplete({
            home,
            destinations: destinations as PlacePin[],
            mobilityAid,
            walkMinutes,
            paceFactor:
              initial && walkMinutes === initialWalkMinutes
                ? initial.paceFactor
                : paceFromMinutes(walkMinutes),
            voice,
            shareWithFamily: share,
          })
        }
      >
        {editing
          ? t("Save profile", "保存资料")
          : busy
            ? t("Planning his route…", "正在为爸爸规划路线…")
            : t("Plan his route", "为爸爸规划路线")}
        <ArrowRight />
      </button>
      {offline && !editing && (
        <p className="onboarding-note">
          {t("Connect to the internet once to plan.", "首次规划需要连接网络。")}
        </p>
      )}
    </section>,
  ];

  return (
    <div className="onboarding">
      {editing && (
        <>
          <p className="status-note">
            {t(
              "Changes apply to future plans. The current journey stays as it is.",
              "更改将用于以后的规划，当前行程保持不变。",
            )}
          </p>
          <button className="text-button" onClick={onCancel}>
            {t("Cancel editing", "取消编辑")}
          </button>
        </>
      )}
      {stage > (editing ? 1 : 0) && (
        <button
          className="text-button onboarding-back"
          onClick={() => setStage(stage - 1)}
        >
          <ArrowLeft size={20} />
          {t("Back", "上一题")}
        </button>
      )}
      {stage > 0 && (
        <div className="onboarding-progress" role="progressbar"
          aria-label={t("Setup progress", "设置进度")}
          aria-valuemin={0} aria-valuemax={5} aria-valuenow={stage}
          aria-valuetext={t(`Question ${stage} of 5`, `第 ${stage} 题，共 5 题`)}>
          {[1, 2, 3, 4, 5].map((step) => (
            <span key={step} className={step <= stage ? "is-reached" : ""} />
          ))}
        </div>
      )}
      {stages[stage]}
      {stage > 0 && stage < 5 && (
        <button
          className="primary onboarding-next"
          disabled={stage === 1 && !validPlaces}
          onClick={() => setStage(stage + 1)}
        >
          {t("Next", "下一题")}
          <ArrowRight />
        </button>
      )}
    </div>
  );
}
