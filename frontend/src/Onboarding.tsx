import { useState } from "react";
import { ArrowLeft, ArrowRight, HeartHandshake } from "lucide-react";
import type { Language } from "./journey";

import { PlaceField } from "./PlaceField";
import { defaultTravelProfile, type TravelProfile } from "./travelProfile";
import type { PlacePin } from "./journey";
export interface SetupAnswers extends TravelProfile {
  shareWithFamily: boolean;
  /** Daughter's phone for the elder-side "Call Mei Ling" button. Optional. */
  familyPhone: string;
}

const REPEAT_OPTIONS = [
  { seconds: 30, en: "Every 30 seconds", zh: "每 30 秒" },
  { seconds: 60, en: "Every 1 minute", zh: "每 1 分钟" },
  { seconds: 120, en: "Every 2 minutes", zh: "每 2 分钟" },
  { seconds: 0, en: "Only when the step changes", zh: "仅在换步骤时" },
] as const;

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
  const [repeatSeconds, setRepeatSeconds] = useState(initial?.repeatSeconds ?? 30);
  const [share, setShare] = useState(initial?.shareWithFamily ?? true);
  const [familyPhone, setFamilyPhone] = useState("");

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
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </button>
  );

  const stages = [
    // 0 — welcome, addressed to the daughter
    <section key="w" className="onboarding-card">
      <HeartHandshake size={44} className="onboarding-icon" />
      <span className="eyebrow">{t("SET UP TOGETHER", "一起完成设置")}</span>
      <h1>
        {t(
          "Mei Ling, set this up with your dad",
          "美玲，请和爸爸一起回答几个问题",
        )}
      </h1>
      <p>
        {t(
          "Five quick questions. The route is planned around his pace, and the app speaks each step aloud — and repeats it — so it is easy to follow even when memory is not.",
          "只有五个问题。路线会按爸爸的步速规划，App 会把每一步用语音读出来，并重复播报，即使记性不好也能跟上。",
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
      <span className="eyebrow">
        {t("QUESTION 1 OF 5", "第 1 题，共 5 题")}
      </span>
      <h1>
        {t(
          "Where does Dad live, and where does he often go?",
          "爸爸住在哪里，平时常去哪里？",
        )}
      </h1>
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
      <span className="eyebrow">
        {t("QUESTION 2 OF 5", "第 2 题，共 5 题")}
      </span>
      <h1>{t("What does he use when going out?", "爸爸出门时用什么辅助？")}</h1>
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
          "Routes always avoid stairs. A walker adds extra walking time and buffer so he is never rushed.",
          "无论选哪项，路线都会避开楼梯。使用助行器时，会额外增加步行时间和余量，让爸爸不必赶。",
        )}
      </p>
    </section>,
    // 2 — pace, asked as a fact he knows
    <section key="q2" className="onboarding-card">
      <span className="eyebrow">
        {t("QUESTION 3 OF 5", "第 3 题，共 5 题")}
      </span>
      <h1>
        {t(
          "How long does Dad usually take to walk from home to his nearest station?",
          "爸爸从家走到最近的车站，平时要多久？",
        )}
      </h1>
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
    // 3 — how often to repeat the spoken reminder (voice is always on for this persona)
    <section key="q3" className="onboarding-card">
      <span className="eyebrow">
        {t("QUESTION 4 OF 5", "第 4 题，共 5 题")}
      </span>
      <h1>{t("How often should the app remind him aloud?", "多久用语音提醒一次爸爸？")}</h1>
      {REPEAT_OPTIONS.map((option) =>
        choice(repeatSeconds === option.seconds, () => setRepeatSeconds(option.seconds),
          t(option.en, option.zh)),
      )}
      <label className="onboarding-field">
        <span>{t("Or enter the exact seconds", "或直接填写具体秒数")}</span>
        <div className="onboarding-number">
          <input
            type="number"
            min={10}
            max={600}
            inputMode="numeric"
            value={
              REPEAT_OPTIONS.some((option) => option.seconds === repeatSeconds)
                ? ""
                : repeatSeconds || ""
            }
            placeholder={t("e.g. 90", "例如 90")}
            onChange={(event) => {
              const value = parseInt(event.target.value, 10);
              if (!Number.isNaN(value))
                setRepeatSeconds(Math.min(600, Math.max(10, value)));
            }}
          />
          <span>{t("sec", "秒")}</span>
        </div>
      </label>
      <p className="onboarding-note">
        {t(
          "Every step is always spoken aloud. This sets how often it repeats while he is on the way — helpful if he forgets what he is doing. You can change it later.",
          "每一步都会用语音读出来。这里设定行程中重复播报的频率——如果爸爸容易忘记正在做什么，重复会很有帮助。以后随时可以修改。",
        )}
      </p>
    </section>,
    // 4 — consent, phrased as his choice
    <section key="q4" className="onboarding-card">
      <span className="eyebrow">
        {t("QUESTION 5 OF 5", "第 5 题，共 5 题")}
      </span>
      <h1>
        {t(
          "Mr Tan — may Mei Ling see how your trip is going?",
          "陈伯——让美玲看到您走到哪一步了，好吗？",
        )}
      </h1>
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
      <label className="onboarding-field">
        <span>
          {t(
            "Mei Ling's phone — for his 'Call Mei Ling' button (optional)",
            "美玲的电话——用于爸爸的“联系女儿”按钮（可不填）",
          )}
        </span>
        <div className="onboarding-number">
          <input
            type="tel"
            inputMode="tel"
            value={familyPhone}
            placeholder={t("e.g. 9123 4567", "例如 9123 4567")}
            onChange={(event) => setFamilyPhone(event.target.value)}
          />
        </div>
      </label>
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
            repeatSeconds,
            shareWithFamily: share,
            familyPhone: familyPhone.trim(),
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
