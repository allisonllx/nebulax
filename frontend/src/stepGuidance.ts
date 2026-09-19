import type { Journey, Language } from "./journey";

/** Resolve a leg consistently, including journeys saved before structured endpoints. */
export function stepGuidance(
  journey: Journey,
  step: Journey["steps"][number],
  language: Language,
) {
  const zh = language === "zh";
  const transit = step.mode === "bus" || step.mode === "train";
  const siblings = step.legId
    ? journey.steps.filter(
        (s) => s.legId === step.legId && s.mode === step.mode,
      )
    : [];
  const pair = siblings.length === 2 ? siblings : [];
  const action =
    step.action ??
    (transit && pair.length
      ? step.id === pair[0].id
        ? "board"
        : "ride"
      : undefined);
  const detail = step.detail[language].split("→").map((s) => s.trim());
  const from =
    step.fromPlace?.name[language] ??
    (detail.length === 2 ? detail[0] : undefined) ??
    (transit ? pair[0]?.place[language] : undefined);
  const to =
    step.toPlace?.name[language] ??
    (detail.length === 2 ? detail[1] : undefined) ??
    (transit ? pair[1]?.place[language] : step.place[language]);
  const fromLabel = transit
    ? zh
      ? "上车站"
      : "Board at"
    : zh
      ? "出发地"
      : "From";
  const toLabel = transit ? (zh ? "下车站" : "Alight at") : zh ? "前往" : "To";
  const instruction =
    action === "board" && from && to
      ? zh
        ? `在 ${from} 上车，前往 ${to}。${step.instruction[language]}`
        : `Board at ${from} for ${to}. ${step.instruction[language]}`
      : action === "ride"
        ? (zh ? "继续乘车。" : "Stay on board. ") + step.instruction[language]
        : step.instruction[language];
  return { action, from, to, fromLabel, toLabel, instruction };
}
