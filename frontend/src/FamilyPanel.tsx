import { useState } from "react";
import {
  ArrowRight,
  Check,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Language, Snapshot } from "./journey";
import { appointmentLabel, defaultFamily, familySchema } from "./profile";
import type { Appointment, Family } from "./profile";
import { AppointmentForm } from "./AppointmentForm";

export function FamilyPanel({
  snapshot,
  language,
  onUpdate,
  onReview,
  onRead,
  speaking,
}: {
  snapshot: Snapshot;
  language: Language;
  onUpdate: (family: Family) => boolean;
  onReview: () => void;
  onRead: (text: string) => void;
  speaking: boolean;
}) {
  const family = snapshot.family;
  const [role, setRole] = useState<"traveller" | "caregiver">("traveller");
  const [setup, setSetup] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [draft, setDraft] = useState(family);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);
  const t = (en: string, zh: string) => (language === "en" ? en : zh);

  function savePermissions() {
    const parsed = familySchema.safeParse({
      ...family,
      ...draft,
      linked: true,
      consentedAt: new Date().toISOString(),
      proposal: draft.scopes.prepareAppointments ? family.proposal : null,
    });
    if (!parsed.success) {
      setError(
        t(
          "Enter a name and a valid phone number, or leave the phone number blank.",
          "请输入姓名和有效电话号码，或将电话号码留空。",
        ),
      );
      return;
    }
    if (onUpdate(parsed.data)) {
      setSetup(false);
      setSavedMessage(true);
      setError("");
    }
  }
  function suggest(appointment: Appointment) {
    if (!family.linked || !family.scopes.prepareAppointments) return;
    const updated = {
      ...family,
      review: null,
      proposal: {
        appointment,
        author: family.name,
        proposedAt: new Date().toISOString(),
        baseRevision: snapshot.appointment.revision,
      },
    };
    if (onUpdate(updated)) setSuggesting(false);
  }
  const permissionsForm = (
    <form
      className="appointment-form"
      onSubmit={(event) => {
        event.preventDefault();
        savePermissions();
      }}
    >
      <label>
        {t("Caregiver name", "家属姓名")}
        <input
          id="caregiver-name"
          required
          maxLength={50}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label>
        {t("Phone number (optional)", "电话号码（可选）")}
        <input
          type="tel"
          autoComplete="tel"
          value={draft.phone}
          onChange={(event) =>
            setDraft({ ...draft, phone: event.target.value })
          }
          placeholder={t("Enter their actual number", "请输入真实电话号码")}
        />
      </label>
      <p className="field-hint">
        {t(
          "Used only when you choose to open a call or text message. Nothing is sent automatically.",
          "仅在您选择拨打电话或打开短信时使用。不会自动发送信息。",
        )}
      </p>
      <fieldset className="permission-options">
        <legend>
          {t("Mr Tan decides what to allow", "由陈先生决定允许什么")}
        </legend>
        <label className="permission-option">
          <input
            type="checkbox"
            aria-label={t("Share trip updates", "分享行程进度")}
            checked={draft.scopes.tripUpdates}
            onChange={(event) =>
              setDraft({
                ...draft,
                scopes: { ...draft.scopes, tripUpdates: event.target.checked },
              })
            }
          />
          <span>
            <strong>{t("Share trip updates", "分享行程进度")}</strong>
            <small>
              {t(
                "Progress, available location and deviation records in this browser. No remote notifications.",
                "在本机查看行程进度、可用位置和偏航记录。不发送远程通知。",
              )}
            </small>
          </span>
        </label>
        <label className="permission-option">
          <input
            type="checkbox"
            aria-label={t("Allow appointment suggestions", "允许提出预约建议")}
            checked={draft.scopes.prepareAppointments}
            onChange={(event) =>
              setDraft({
                ...draft,
                scopes: {
                  ...draft.scopes,
                  prepareAppointments: event.target.checked,
                },
              })
            }
          />
          <span>
            <strong>
              {t("Allow appointment suggestions", "允许提出预约建议")}
            </strong>
            <small>
              {t(
                "Can see the appointment and suggest changes. You accept or decline every suggestion.",
                "可查看预约并提出修改建议。每项建议都由您接受或拒绝。",
              )}
            </small>
          </span>
        </label>
      </fieldset>
      <div className="reassurance">
        <ShieldCheck size={24} />
        <p>
          {t(
            "You can stop sharing at any time. Your caregiver cannot start a trip or change your active route.",
            "您可以随时停止分享。家属无法开始行程或更改正在使用的路线。",
          )}
        </p>
      </div>
      <button
        type="button"
        className="listen-button"
        onClick={() =>
          onRead(
            [
              t(
                "These are your selected permissions. They apply after you confirm.",
                "以下是您选择的权限。确认后才会生效。",
              ),
              draft.scopes.tripUpdates
                ? t(
                    "Your caregiver can see your appointment, current step and confirmed arrival.",
                    "家属可以查看预约、当前步骤及已确认到达的状态。",
                  )
                : t("Trip updates will not be shared.", "不会分享行程进度。"),
              draft.scopes.prepareAppointments
                ? t(
                    "Your caregiver can suggest appointment changes. You decide whether to accept.",
                    "家属可以提出预约修改建议。由您决定是否接受。",
                  )
                : t(
                    "Your caregiver cannot suggest appointment changes.",
                    "家属无法提出预约修改建议。",
                  ),
              t(
                "You can stop sharing at any time. This local demo does not send data to anyone.",
                "您可以随时停止分享。此本地演示不会向他人发送数据。",
              ),
            ].join(" "),
          )
        }
      >
        {speaking ? <VolumeX size={22} /> : <Volume2 size={22} />}
        {speaking
          ? t("Stop reading", "停止朗读")
          : t("Read permissions aloud", "朗读权限说明")}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        {family.linked
          ? t("Save permissions", "保存权限")
          : t("Confirm permissions", "确认权限")}
        <Check size={22} />
      </button>
    </form>
  );

  return (
    <section className="standalone-card family-panel">
      <span className="large-symbol">
        <HeartHandshake size={32} />
      </span>
      <div>
        <span className="eyebrow">
          {t("SUPPORT, ON YOUR TERMS", "由您决定如何获得支持")}
        </span>
        <h1 tabIndex={-1}>
          {t("A little help from family", "家人的一份支持")}
        </h1>
      </div>
      <p className="local-demo-note">
        {t(
          "Local demo: both views use this browser. No account is linked and no data or notification is sent to another person.",
          "本地演示：两个视角均使用此浏览器。未连接真实账户，也不会向他人发送数据或通知。",
        )}
      </p>
      <div
        className="role-switch"
        aria-label={t("Demo perspective", "演示视角")}
      >
        <button
          aria-pressed={role === "traveller"}
          onClick={() => {
            if (speaking) onRead("");
            setRole("traveller");
            setSuggesting(false);
          }}
        >
          <UserRound size={19} />
          {t("Mr Tan’s controls", "陈先生的设置")}
        </button>
        <button
          aria-pressed={role === "caregiver"}
          onClick={() => {
            if (speaking) onRead("");
            setRole("caregiver");
            setSavedMessage(false);
          }}
        >
          <HeartHandshake size={19} />
          {t("Caregiver preview", "家属视角预览")}
        </button>
      </div>
      {role === "traveller" ? (
        <>
          {!family.linked && !setup ? (
            <div className="family-empty">
              <LockKeyhole size={28} />
              <h2>{t("You choose who can help", "由您选择谁可以帮忙")}</h2>
              <p>
                {t(
                  "Start with two simple permissions. You can still travel independently without family support.",
                  "只需选择两项简单权限。您仍可独立出行，无需连接家属。",
                )}
              </p>
              <button
                className="primary"
                onClick={() => {
                  setDraft(defaultFamily);
                  setSetup(true);
                  requestAnimationFrame(() =>
                    document.getElementById("caregiver-name")?.focus(),
                  );
                }}
              >
                {t("Set up family support", "设置家属支持")}
                <ArrowRight size={22} />
              </button>
            </div>
          ) : (
            <>
              {family.linked && (
                <div className="sharing-heading">
                  <span className="person-avatar">
                    {family.name.slice(0, 1)}
                  </span>
                  <div>
                    <h2>{family.name}</h2>
                    <p>
                      {t(
                        "Permissions saved on this phone",
                        "权限已保存在此手机上",
                      )}
                    </p>
                  </div>
                </div>
              )}
              {family.proposal && (
                <div className="suggestion-note">
                  <strong>
                    {t(
                      `${family.proposal.author} has a suggestion`,
                      `${family.proposal.author}提出了建议`,
                    )}
                  </strong>
                  <button className="secondary" onClick={onReview}>
                    {t("Review suggestion", "查看建议")}
                    <ArrowRight size={20} />
                  </button>
                </div>
              )}
              {savedMessage && (
                <p role="status" className="status-note">
                  {t("Your permissions are saved.", "您的权限已保存。")}
                </p>
              )}
              {permissionsForm}
              {family.linked &&
                (confirmStop ? (
                  <div className="stop-sharing">
                    <h2>{t("Stop family sharing?", "停止与家属分享？")}</h2>
                    <p>
                      {t(
                        "The caregiver preview will lose access. Pending suggestions will be removed. Your journey stays saved.",
                        "家属视角将无法查看信息，待处理建议会被移除。您的行程会保留。",
                      )}
                    </p>
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (onUpdate(defaultFamily)) {
                          setDraft(defaultFamily);
                          setConfirmStop(false);
                          setSetup(false);
                          setSavedMessage(false);
                        }
                      }}
                    >
                      {t("Confirm stop sharing", "确认停止分享")}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setConfirmStop(false)}
                    >
                      {t("Keep sharing", "继续分享")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button danger-text"
                    onClick={() => setConfirmStop(true)}
                  >
                    {t("Stop sharing", "停止分享")}
                  </button>
                ))}
            </>
          )}
        </>
      ) : !family.linked ? (
        <div className="family-empty">
          <LockKeyhole size={30} />
          <h2>{t("Permission comes first", "先获得允许")}</h2>
          <p>
            {t("Mr Tan has not connected a caregiver.", "陈先生尚未连接家属。")}
          </p>
        </div>
      ) : (
        <>
          <p>
            {t(
              `Hello, ${family.name}. Here is what Mr Tan has chosen to share.`,
              `${family.name}，您好。以下是陈先生选择分享的信息。`,
            )}
          </p>
          {family.scopes.tripUpdates ? (
            <div className="caregiver-trip">
              <div className="section-heading">
                <h2>{t("Mr Tan’s trip", "陈先生的行程")}</h2>
                <span className="pill">
                  {snapshot.phase === "active"
                    ? t("On the way", "行程中")
                    : snapshot.phase === "arrived"
                      ? t("Arrival confirmed", "已确认到达")
                      : t("Not started", "尚未出发")}
                </span>
              </div>
              <p>{appointmentLabel(snapshot.appointment, language)}</p>
              <strong>{t("Tan Tock Seng Hospital", "陈笃生医院")}</strong>
              {snapshot.phase === "active" && (
                <p>
                  {t(
                    `Step ${snapshot.stepIndex + 1}: `,
                    `第${snapshot.stepIndex + 1}步：`,
                  )}
                  {
                    snapshot.journey.steps[snapshot.stepIndex].instruction[
                      language
                    ]
                  }
                </p>
              )}
              <p className="field-hint">
                {snapshot.phase === "arrived"
                  ? t(
                      "Mr Tan confirmed arrival on this phone. No notification was sent.",
                      "陈先生已在此手机上确认到达。未发送通知。",
                    )
                  : t(
                      "Progress is manually confirmed. This is not live location tracking.",
                      "进度由用户手动确认，并非实时位置追踪。",
                    )}
              </p>
              {snapshot.progressUpdatedAt && (
                <p className="field-hint">
                  {t("Last progress update: ", "进度更新时间：")}
                  {new Intl.DateTimeFormat(
                    language === "en" ? "en-SG" : "zh-SG",
                    {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Singapore",
                    },
                  ).format(new Date(snapshot.progressUpdatedAt))}
                </p>
              )}
              {(snapshot.blocked || snapshot.proposal) && (
                <p className="form-error">
                  {snapshot.blocked
                    ? t(
                        "A step-free route could not be confirmed.",
                        "暂时无法确认无障碍路线。",
                      )
                    : t(
                        "A route update needs Mr Tan’s review.",
                        "路线更新需要陈先生确认。",
                      )}
                </p>
              )}
            </div>
          ) : (
            <p className="permission-hidden">
              <LockKeyhole size={22} />
              {t("Trip updates are not shared.", "未分享行程进度。")}
            </p>
          )}
          {family.scopes.prepareAppointments ? (
            <div className="suggestion-area">
              <h2>{t("Help with the next appointment", "帮忙准备预约")}</h2>
              {!family.scopes.tripUpdates && (
                <p>{appointmentLabel(snapshot.appointment, language)}</p>
              )}
              {family.proposal && (
                <div className="suggestion-note">
                  <strong>
                    {t("Waiting for Mr Tan to review", "等待陈先生确认")}
                  </strong>
                  <p>
                    {appointmentLabel(family.proposal.appointment, language)}
                  </p>
                  <p className="field-hint">
                    {t(
                      "His saved appointment has not changed.",
                      "他已保存的预约尚未更改。",
                    )}
                  </p>
                </div>
              )}
              {family.review && (
                <p role="status" className="status-note">
                  {family.review === "accepted"
                    ? t(
                        "Mr Tan accepted your suggestion.",
                        "陈先生已接受您的建议。",
                      )
                    : t(
                        "Mr Tan kept his existing appointment.",
                        "陈先生保留了原预约。",
                      )}
                </p>
              )}
              {suggesting ? (
                <>
                  <AppointmentForm
                    initial={
                      family.proposal?.appointment ?? snapshot.appointment
                    }
                    language={language}
                    onSave={suggest}
                    busy={false}
                    disabled={false}
                    caregiver
                  />
                  <button
                    className="text-button"
                    onClick={() => setSuggesting(false)}
                  >
                    {t("Cancel suggestion", "取消建议")}
                  </button>
                </>
              ) : (
                <button
                  className="secondary"
                  onClick={() => setSuggesting(true)}
                >
                  {t("Suggest appointment change", "建议更改预约")}
                  <ArrowRight size={22} />
                </button>
              )}
            </div>
          ) : (
            <p className="permission-hidden">
              <LockKeyhole size={22} />
              {t(
                "Appointment suggestions are not enabled.",
                "未开启预约建议功能。",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
