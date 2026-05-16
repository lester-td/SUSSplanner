import { z } from "zod";

import {
  classStartTimeSchema,
  colorSchema,
  daySchema,
  durationHoursSchema,
  tgSchema,
  uuidSchema,
  weekPatternSchema,
} from "./common";

export const offeringCreateSchema = z.object({
  moduleId: uuidSchema,
  semesterId: uuidSchema,
  tg: tgSchema.optional().default("TG01"),
  color: colorSchema.optional(),
});

const classFieldsSchema = {
  day: daySchema,
  startTime: classStartTimeSchema,
  durationHours: durationHoursSchema,
  type: z.string().trim().min(1).max(60),
  venue: z.string().trim().min(1).max(120).default("TBA"),
  weekPattern: weekPatternSchema.optional().default("all"),
};

export const classCreateSchema = z
  .object({
    offeringId: uuidSchema.optional(),
    offering: offeringCreateSchema.optional(),
    ...classFieldsSchema,
  })
  .refine((value) => Boolean(value.offeringId || value.offering), {
    message: "Either offeringId or offering is required.",
    path: ["offeringId"],
  });

export const classUpdateSchema = z
  .object({
    offeringId: uuidSchema.optional(),
    offering: offeringCreateSchema.optional(),
    day: classFieldsSchema.day.optional(),
    startTime: classFieldsSchema.startTime.optional(),
    durationHours: classFieldsSchema.durationHours.optional(),
    type: classFieldsSchema.type.optional(),
    venue: classFieldsSchema.venue.optional(),
    weekPattern: classFieldsSchema.weekPattern.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type OfferingCreateInput = z.infer<typeof offeringCreateSchema>;
export type ClassCreateInput = z.infer<typeof classCreateSchema>;
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;
