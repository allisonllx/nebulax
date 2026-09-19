import { z } from "zod";
import {
  appointmentSchema,
  familySchema,
  defaultAppointment,
  defaultFamily,
  appointmentInstant,
} from "./profile";
import type { Appointment } from "./profile";

export type Language = "en" | "zh";
export type Scenario = "normal" | "change" | "blocked";
const bilingual = z.object({ en: z.string(), zh: z.string() });
const position = z.tuple([z.number(), z.number()]);
const geometry = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.object({
        mode: z.enum(["walk", "train", "bus"]),
        affected: z.boolean().optional(),
        legId: z.string().optional(),
      }),
      geometry: z.object({
        type: z.literal("LineString"),
        coordinates: z.array(position).min(2),
      }),
    }),
  ),
});

const endpointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  name: bilingual,
});
export const journeySchema = z.object({
  id: z.string(),
  origin: endpointSchema.nullish(),
  destination: endpointSchema.nullish(),
  version: z.number().int().positive(),
  status: z.literal("ready"),
  updatedAt: z.string().datetime({ offset: true }),
  departureTime: z.string().datetime({ offset: true }),
  arrivalWindow: z.object({
    earliest: z.string().datetime({ offset: true }),
    latest: z.string().datetime({ offset: true }),
  }),
  steps: z
    .array(
      z.object({
        id: z.string(),
        legId: z.string().optional(),
        mode: z.enum(["walk", "train", "bus", "lift"]),
        instruction: bilingual,
        directions: z.array(bilingual).default([]),
        detail: bilingual,
        confirmation: bilingual,
        durationMinutes: z.number().nonnegative(),
        distanceMetres: z.number().nonnegative().nullish(),
        place: bilingual,
      }),
    )
    .min(1),
  routeGeometry: geometry,
  alerts: z.array(z.object({ id: z.string(), message: bilingual })),
  transfers: z.number().int().nonnegative().optional(),
  walkDistanceMetres: z.number().nonnegative().optional(),
});
export type Journey = z.infer<typeof journeySchema>;
export const refreshSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unchanged"),
    checkedAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    status: z.literal("replacement_available"),
    journey: journeySchema,
  }),
  z.object({ status: z.literal("no_accessible_route"), message: bilingual }),
]);
export type RefreshResult = z.infer<typeof refreshSchema>;
export interface PlacePin {
  lat: number;
  lon: number;
  name: string;
}
export interface PlanRequest {
  origin: string | PlacePin;
  destination: string | PlacePin;
  arriveBy: string;
  stepFree: boolean;
  walkingSpeedFactor: number;
}
export const planRequest: PlanRequest = {
  origin: "saved-home",
  destination: "ttsh-entrance",
  arriveBy: "2026-09-21T10:00:00+08:00",
  stepFree: true,
  walkingSpeedFactor: 0.6,
};

const text = (en: string, zh: string) => ({ en, zh });
export const demoJourney: Journey = {
  id: "demo-tan-001",
  version: 1,
  status: "ready",
  updatedAt: "2026-09-21T08:30:00+08:00",
  departureTime: "2026-09-21T08:45:00+08:00",
  arrivalWindow: {
    earliest: "2026-09-21T09:35:00+08:00",
    latest: "2026-09-21T09:45:00+08:00",
  },
  steps: [
    {
      id: "home-walk",
      mode: "walk",
      instruction: text("Walk to Ang Mo Kio station", "步行到宏茂桥地铁站"),
      detail: text(
        "Take your time. At the station, look for the lift sign.",
        "慢慢走。到达地铁站后，寻找电梯标志。",
      ),
      confirmation: text("I'm at the station", "我已到达地铁站"),
      directions: [],
      durationMinutes: 10,
      place: text("Home → Ang Mo Kio · NS16", "家 → 宏茂桥 · NS16"),
    },
    {
      id: "amk-lift",
      mode: "lift",
      instruction: text("Take the lift to the platform", "乘电梯到站台"),
      detail: text(
        "Follow signs for the North South Line towards Marina South Pier. Ask station staff if you cannot find the lift.",
        "跟随南北线往滨海南码头方向的标志。如果找不到电梯，请向车站工作人员求助。",
      ),
      confirmation: text("I'm on the platform", "我已到达站台"),
      directions: [],
      durationMinutes: 5,
      place: text("Ang Mo Kio · NS16", "宏茂桥 · NS16"),
    },
    {
      id: "train",
      mode: "train",
      instruction: text("Take the train to Novena", "乘地铁到诺维娜站"),
      detail: text(
        "Towards Marina South Pier. Novena is 4 stops away: Bishan, Braddell, Toa Payoh, then Novena. Confirm when you get off.",
        "往滨海南码头方向，共4站：碧山、布莱德、 大巴窑，然后到诺维娜。下车后请确认。",
      ),
      confirmation: text("I've reached Novena", "我已到达诺维娜"),
      directions: [],
      durationMinutes: 15,
      place: text("NS16 → NS20 · North South Line", "NS16 → NS20 · 南北线"),
    },
    {
      id: "novena-lift",
      mode: "lift",
      instruction: text("Take the lift to the concourse", "乘电梯到大厅"),
      detail: text(
        "Look for the lift sign. Ask station staff to confirm the step-free exit towards the hospital.",
        "寻找电梯标志。请向工作人员确认前往医院的无障碍出口。",
      ),
      confirmation: text("I'm at the concourse", "我已到达大厅"),
      directions: [],
      durationMinutes: 5,
      place: text("Novena · NS20", "诺维娜 · NS20"),
    },
    {
      id: "hospital-walk",
      mode: "walk",
      instruction: text(
        "Continue to the hospital entrance",
        "继续前往医院入口",
      ),
      detail: text(
        "Follow the Tan Tock Seng Hospital signs. Confirm arrival only when you reach your saved destination.",
        "跟随陈笃生医院的标志。到达目的地后再确认。",
      ),
      confirmation: text("I have arrived", "我已到达"),
      directions: [],
      durationMinutes: 15,
      place: text("Novena → Tan Tock Seng Hospital", "诺维娜 → 陈笃生医院"),
    },
  ],
  routeGeometry: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { mode: "walk" },
        geometry: {
          type: "LineString",
          coordinates: [
            [103.843, 1.372],
            [103.848, 1.372],
            [103.8496, 1.37],
          ],
        },
      },
      {
        type: "Feature",
        properties: { mode: "train" },
        geometry: {
          type: "LineString",
          coordinates: [
            [103.8496, 1.37],
            [103.8492, 1.351],
            [103.8467, 1.3405],
            [103.8474, 1.3326],
            [103.8438, 1.3205],
          ],
        },
      },
      {
        type: "Feature",
        properties: { mode: "walk" },
        geometry: {
          type: "LineString",
          coordinates: [
            [103.8438, 1.3205],
            [103.8445, 1.322],
            [103.8464, 1.3215],
          ],
        },
      },
    ],
  },
  alerts: [],
};

export function changedJourney(current: Journey): Journey {
  return {
    ...current,
    version: current.version + 1,
    updatedAt: new Date(
      new Date(current.updatedAt).valueOf() + 10 * 60000,
    ).toISOString(),
    arrivalWindow: {
      earliest: new Date(
        new Date(current.arrivalWindow.earliest).valueOf() +
          (current.alerts.some((alert) => alert.id === "demo-closure")
            ? 0
            : 8 * 60000),
      ).toISOString(),
      latest: new Date(
        new Date(current.arrivalWindow.latest).valueOf() +
          (current.alerts.some((alert) => alert.id === "demo-closure")
            ? 0
            : 8 * 60000),
      ).toISOString(),
    },
    steps: demoJourney.steps.map((step) =>
      step.id !== "hospital-walk"
        ? step
        : {
            ...step,
            instruction: text(
              "Use the alternative hospital approach",
              "使用另一条路线前往医院",
            ),
            durationMinutes: 23,
            detail: text(
              "Demo only: an alternative walking connection adds 8 minutes. Its accessibility and landmarks must be verified before real use.",
              "仅供演示：另一条步行路线增加8分钟。实际使用前须核实其无障碍设施及地标。",
            ),
          },
    ),
    routeGeometry: {
      ...demoJourney.routeGeometry,
      features: [
        ...demoJourney.routeGeometry.features.slice(0, 2),
        {
          type: "Feature",
          properties: { mode: "walk" },
          geometry: {
            type: "LineString",
            coordinates: [
              [103.8438, 1.3205],
              [103.8433, 1.3228],
              [103.8455, 1.3232],
              [103.8464, 1.3215],
            ],
          },
        },
      ],
    },
    alerts: [
      {
        id: "demo-closure",
        message: text(
          "Sample closure on the usual hospital walking approach. Alternative adds 8 minutes.",
          "示例：原医院步行路线关闭。另一条路线增加8分钟。",
        ),
      },
    ],
  };
}

export const isDemo = import.meta.env?.VITE_API_MODE !== "live";

async function request(path: string, body: unknown) {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<unknown>;
}
export function requestForAppointment(appointment: Appointment): PlanRequest {
  return { ...planRequest, arriveBy: appointmentInstant(appointment) };
}
function demoPlan(input: PlanRequest): Journey {
  const appointmentTime = new Date(input.arriveBy).valueOf();
  const before = (minutes: number) =>
    new Date(appointmentTime - minutes * 60000).toISOString();
  return {
    ...demoJourney,
    updatedAt: before(90),
    departureTime: before(75),
    arrivalWindow: { earliest: before(25), latest: before(15) },
  };
}
export async function planJourney(input: PlanRequest): Promise<Journey> {
  return journeySchema.parse(
    isDemo ? demoPlan(input) : await request("/journeys/plan", input),
  );
}
const planResponseSchema = journeySchema.extend({
  alternatives: z.array(journeySchema).default([]),
});
/** Plan plus genuinely different route options, for the setup route choice. */
export async function planJourneyWithOptions(
  input: PlanRequest,
): Promise<{ journey: Journey; alternatives: Journey[] }> {
  if (isDemo) return { journey: journeySchema.parse(demoPlan(input)), alternatives: [] };
  const { alternatives, ...journey } = planResponseSchema.parse(
    await request("/journeys/plan", input),
  );
  return { journey, alternatives };
}
export async function refreshJourney(
  journey: Journey,
  currentStepId: string,
  scenario: Scenario,
): Promise<RefreshResult> {
  if (!isDemo)
    return refreshSchema.parse(
      await request(`/journeys/${encodeURIComponent(journey.id)}/refresh`, {
        version: journey.version,
        currentStepId,
      }),
    );
  if (scenario === "change")
    return {
      status: "replacement_available",
      journey: changedJourney(journey),
    };
  if (scenario === "blocked")
    return {
      status: "no_accessible_route",
      message: text(
        "We cannot confirm a step-free alternative. Ask station staff for help before continuing.",
        "暂时无法确认无障碍替代路线。继续前请向车站工作人员求助。",
      ),
    };
  return { status: "unchanged", checkedAt: journey.updatedAt };
}

const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    journey: journeySchema,
    stepIndex: z.number().int().nonnegative(),
    phase: z.enum(["planned", "active", "arrived"]),
    language: z.enum(["en", "zh"]),
    large: z.boolean(),
    blocked: z.boolean(),
    proposal: journeySchema.nullable(),
    appointment: appointmentSchema.default(defaultAppointment),
    family: familySchema.default(defaultFamily),
    progressUpdatedAt: z.string().datetime().nullable().default(null),
  })
  .refine((value) => value.stepIndex < value.journey.steps.length);
export type Snapshot = z.infer<typeof snapshotSchema>;
const storageKey = `nebulax:journey:${isDemo ? "demo" : "live"}:1`;
export function loadSnapshot(): Snapshot | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? snapshotSchema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
export function saveSnapshot(value: Snapshot): boolean {
  try {
    const normalized = JSON.stringify(snapshotSchema.parse(value));
    localStorage.setItem(storageKey, normalized);
    return localStorage.getItem(storageKey) === normalized;
  } catch {
    return false;
  }
}
export function time(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  })
    .format(new Date(value))
    .replace(/^0/, "");
}
export function arrival(journey: Journey) {
  return `${time(journey.arrivalWindow.earliest)}–${time(journey.arrivalWindow.latest)}`;
}
