import { useState } from "react";
import { ArrowRight, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { appointmentSchema } from "./profile";
import type { Appointment } from "./profile";
import type { Language } from "./journey";

export function AppointmentForm({
  initial,
  language,
  onSave,
  busy,
  disabled,
  caregiver = false,
}: {
  initial: Appointment;
  language: Language;
  onSave: (appointment: Appointment) => void;
  busy: boolean;
  disabled: boolean;
  caregiver?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(false);
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  return (
    <form
      className="appointment-form"
      onSubmit={(event) => {
        event.preventDefault();
        const result = appointmentSchema.safeParse(draft);
        if (!result.success) {
          setError(true);
          return;
        }
        if (disabled || busy) return;
        setError(false);
        onSave(result.data);
      }}
    >
      <div className="saved-places">
        <div>
          <MapPin size={22} />
          <div>
            <span>{t("From your saved home", "从已保存的住址出发")}</span>
            <strong>{t("Ang Mo Kio", "宏茂桥")}</strong>
          </div>
        </div>
        <div>
          <MapPin size={22} />
          <div>
            <span>{t("To your saved destination", "前往已保存的目的地")}</span>
            <strong>
              {t("Tan Tock Seng Hospital entrance", "陈笃生医院入口")}
            </strong>
          </div>
        </div>
        <p>
          {t(
            "This demo supports these saved places. Address search will be added with live routing.",
            "此演示支持以上地点。连接实时路线服务后将提供地址搜索。",
          )}
        </p>
      </div>
      <div className="form-grid">
        <label>
          {t("Appointment date", "预约日期")}
          <input
            type="date"
            required
            value={draft.date}
            onChange={(event) =>
              setDraft({ ...draft, date: event.target.value })
            }
            disabled={disabled || busy}
          />
        </label>
        <label>
          {t("Appointment time", "预约时间")}
          <input
            type="time"
            required
            value={draft.time}
            onChange={(event) =>
              setDraft({ ...draft, time: event.target.value })
            }
            disabled={disabled || busy}
          />
        </label>
      </div>
      <label>
        {t("Repeat appointment", "重复预约")}
        <select
          value={draft.repeat}
          onChange={(event) =>
            setDraft({
              ...draft,
              repeat: event.target.value as Appointment["repeat"],
            })
          }
          disabled={disabled || busy}
        >
          <option value="once">{t("Just this once", "仅此一次")}</option>
          <option value="fortnightly">
            {t("Every two weeks", "每两周一次")}
          </option>
        </select>
      </label>
      <p className="field-hint">
        <CalendarDays size={18} />
        {t(
          "Repeating visits are prepared only when you choose “Prepare next visit”. No reminders are sent yet.",
          "只有在您选择“准备下一次行程”时才会建立重复行程。目前不会发送提醒。",
        )}
      </p>
      <label>
        {t("Appointment note (optional)", "预约备注（可选）")}
        <input
          maxLength={100}
          value={draft.note}
          placeholder={t(
            "For example: bring appointment card",
            "例如：带上预约卡",
          )}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          disabled={disabled || busy}
        />
      </label>
      <div className="reassurance">
        <ShieldCheck size={22} />
        <p>
          {t(
            "No stairs. Walking pace: 60% of the usual speed. These travel needs stay in place.",
            "无需爬楼梯。步速为一般速度的60%。这些出行需求会保留。",
          )}
        </p>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {t(
            "Enter a valid date and time, and keep the note under 100 characters.",
            "请输入有效日期和时间，备注不超过100字。",
          )}
        </p>
      )}
      <button type="submit" className="primary" disabled={disabled || busy}>
        {busy
          ? t("Preparing your plan…", "正在准备行程…")
          : caregiver
            ? t("Save suggestion for review", "保存建议，等待确认")
            : t("Save appointment and plan", "保存预约并规划行程")}
        <ArrowRight size={22} />
      </button>
    </form>
  );
}
