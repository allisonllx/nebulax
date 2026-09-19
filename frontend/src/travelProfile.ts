import { z } from "zod";
export const savedPlaceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  name: z.string().trim().min(1).max(200),
});
export const travelProfileSchema = z.object({
  home: savedPlaceSchema,
  destinations: z.array(savedPlaceSchema).min(1).max(8),
  mobilityAid: z.enum(["none", "cane", "walker"]),
  walkMinutes: z.number().int().min(1).max(60).optional(),
  paceFactor: z.number().min(0.1).max(1.5),
  /** How often the spoken guidance repeats en route, in seconds. 0 = only on step change. */
  repeatSeconds: z.number().int().min(0).max(600).default(60),
});
export type TravelProfile = z.infer<typeof travelProfileSchema>;
export const defaultTravelProfile: TravelProfile = {
  home: { lat: 1.3691, lon: 103.8454, name: "Home, Ang Mo Kio" },
  destinations: [
    { lat: 1.3214, lon: 103.8459, name: "Tan Tock Seng Hospital" },
  ],
  mobilityAid: "cane",
  paceFactor: 0.6,
  repeatSeconds: 60,
};
