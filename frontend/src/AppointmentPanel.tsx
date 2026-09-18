import { ArrowRight, CalendarDays, Check } from "lucide-react";
import { AppointmentForm } from "./AppointmentForm";
import { appointmentLabel, nextVisit } from "./profile";
import type { Appointment } from "./profile";
import type { Language, Snapshot } from "./journey";

export function AppointmentPanel({
  snapshot,
  language,
  busy,
  offline,
  onSave,
  onAccept,
  onDecline,
}: {
  snapshot: Snapshot;
  language: Language;
  busy: boolean;
  offline: boolean;
  onSave: (appointment: Appointment) => void;
  onAccept: (appointment: Appointment) => void;
  onDecline: () => void;
}) {
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const { appointment, family, phase } = snapshot;
  const proposal =
    family.linked && family.scopes.prepareAppointments ? family.proposal : null;
  return (
    <section className="standalone-card appointment-panel">
      <span className="large-symbol">
        <CalendarDays size={32} />
      </span>
      <div>
        <span className="eyebrow">
          {t("PLAN AHEAD, TRAVEL WITH CONFIDENCE", "提前准备，安心出行")}
        </span>
        <h1 tabIndex={-1}>{t("Your hospital appointment", "您的医院预约")}</h1>
      </div>
      <p>
        {t(
          "Keep your appointment here. We’ll adjust the journey times around it.",
          "在这里保存预约。我们会据此调整出发及到达时间。",
        )}
      </p>
      {proposal && (
        <section className="proposal-review">
          <span className="eyebrow">
            {t(`SUGGESTED BY ${proposal.author}`, `${proposal.author}的建议`)}
          </span>
          <h2>{t("Review appointment suggestion", "查看预约建议")}</h2>
          <div className="appointment-comparison">
            {[appointment, proposal.appointment].map((item, index) => (
              <div key={index}>
                <span>
                  {index === 0
                    ? t("Your saved appointment", "原预约")
                    : t("Suggested appointment", "建议的预约")}
                </span>
                <strong>{appointmentLabel(item, language)}</strong>
                <small>
                  {item.repeat === "fortnightly"
                    ? t("Every two weeks", "每两周一次")
                    : t("One visit", "仅此一次")}
                </small>
                {item.note && <p>{item.note}</p>}
              </div>
            ))}
          </div>
          <p className="field-hint">
            {t(
              "Your appointment and route change only if you accept. This does not book or change a hospital appointment.",
              "只有您接受后，本应用才会更改预约和路线。这不会实际预约或更改医院预约。",
            )}
          </p>
          <button
            className="primary"
            disabled={busy || offline || phase === "active"}
            onClick={() => onAccept(proposal.appointment)}
          >
            {busy
              ? t("Preparing…", "正在准备…")
              : t("Accept and update plan", "接受并更新行程")}
            <Check size={22} />
          </button>
          <button className="text-button" disabled={busy} onClick={onDecline}>
            {t("Keep my appointment", "保留原预约")}
          </button>
        </section>
      )}
      {phase === "active" && (
        <p className="warning-banner" role="status">
          {t(
            "Finish your current journey before changing this appointment. Your active instructions will stay unchanged.",
            "请先完成当前行程，再更改预约。正在使用的指引会保持不变。",
          )}
        </p>
      )}
      {offline && (
        <p className="field-hint">
          {t(
            "You can review the saved appointment offline. Connect to update its route.",
            "离线时可查看已保存的预约。请连接网络后更新路线。",
          )}
        </p>
      )}
      {phase === "arrived" && appointment.repeat === "fortnightly" && (
        <div className="next-visit">
          <h2>{t("Your next visit", "您的下一次行程")}</h2>
          <p>{appointmentLabel(nextVisit(appointment), language)}</p>
          <button
            className="secondary"
            disabled={busy || offline}
            onClick={() => onSave(nextVisit(appointment))}
          >
            {t("Prepare next visit", "准备下一次行程")}
            <ArrowRight size={22} />
          </button>
        </div>
      )}
      <AppointmentForm
        key={appointment.revision}
        initial={appointment}
        language={language}
        onSave={onSave}
        busy={busy}
        disabled={phase === "active" || offline}
      />
      <p className="field-hint">
        {t(
          "Saved on this phone only. Check any appointment change with the hospital.",
          "仅保存在此手机上。预约变更请与医院确认。",
        )}
      </p>
    </section>
  );
}
