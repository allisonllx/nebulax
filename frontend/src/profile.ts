import { z } from "zod";

export const appointmentSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T12:00:00+08:00`);
      return (
        !Number.isNaN(date.valueOf()) &&
        date.toISOString().slice(0, 10) === value
      );
    }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  repeat: z.enum(["once", "fortnightly"]),
  note: z.string().trim().max(100),
  revision: z.number().int().positive(),
});
export type Appointment = z.infer<typeof appointmentSchema>;
export const defaultAppointment: Appointment = {
  date: "2026-09-21",
  time: "10:00",
  repeat: "fortnightly",
  note: "",
  revision: 1,
};

export const familySchema = z.object({
  linked: z.boolean(),
  name: z.string().trim().min(1).max(50),
  phone: z
    .string()
    .trim()
    .refine((value) => !value || /^\+?[\d ()-]{6,22}$/.test(value)),
  scopes: z.object({
    tripUpdates: z.boolean(),
    prepareAppointments: z.boolean(),
  }),
  consentedAt: z.string().datetime().nullable(),
  proposal: z
    .object({
      appointment: appointmentSchema,
      author: z.string(),
      proposedAt: z.string().datetime(),
      baseRevision: z.number().int(),
    })
    .nullable(),
  review: z.enum(["accepted", "declined"]).nullable(),
});
export type Family = z.infer<typeof familySchema>;
export const defaultFamily: Family = {
  linked: false,
  name: "Mei Ling",
  phone: "",
  scopes: { tripUpdates: false, prepareAppointments: false },
  consentedAt: null,
  proposal: null,
  review: null,
};

export function appointmentInstant(appointment: Appointment) {
  return `${appointment.date}T${appointment.time}:00+08:00`;
}
export function appointmentLabel(
  appointment: Appointment,
  language: "en" | "zh",
) {
  return new Intl.DateTimeFormat(language === "en" ? "en-SG" : "zh-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(new Date(appointmentInstant(appointment)));
}
export function nextVisit(appointment: Appointment): Appointment {
  const date = new Date(`${appointment.date}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + 14);
  return { ...appointment, date: date.toISOString().slice(0, 10) };
}
export function dialNumber(phone: string) {
  return phone.replace(/[ ()-]/g, "");
}
