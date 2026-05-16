import { z } from "zod";

import {
  classStartTimeSchema,
  colorSchema,
  computeEndTime,
  daySchema,
  durationFromStartAndEnd,
  durationHoursSchema,
  moduleCodeSchema,
  normalizeClockValue,
  tgSchema,
  uuidSchema,
  weekPatternSchema,
} from "./common";
import { semesterCreateSchema } from "./semesters";

const importLessonSchema = z
  .object({
    day: daySchema,
    start: classStartTimeSchema,
    end: z.preprocess(
      normalizeClockValue,
      z.string().regex(/^\d{2}:\d{2}$/).optional()
    ),
    durationHours: durationHoursSchema.optional(),
    type: z.string().trim().min(1).max(60).default("LEC"),
    venue: z.string().trim().min(1).max(120).default("TBA"),
    weekPattern: weekPatternSchema.optional().default("all"),
  })
  .superRefine((value, ctx) => {
    if (!value.durationHours && !value.end)
    {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either end or durationHours is required.",
        path: ["end"],
      });
      return;
    }

    if (value.durationHours && value.end)
    {
      const expectedEnd = computeEndTime(value.start, value.durationHours);
      if (expectedEnd !== value.end)
      {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "end must match start plus durationHours.",
          path: ["end"],
        });
      }
      return;
    }

    if (value.end && !value.durationHours)
    {
      const computedDuration = durationFromStartAndEnd(value.start, value.end);
      if (computedDuration !== 2 && computedDuration !== 3)
      {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duration derived from start and end must be 2 or 3 hours.",
          path: ["end"],
        });
      }
    }
  })
  .transform((value) => {
    const durationHours = value.durationHours ?? durationFromStartAndEnd(value.start, value.end!);
    return {
      day: value.day,
      startTime: value.start,
      durationHours: durationHours as 2 | 3,
      type: value.type,
      venue: value.venue,
      weekPattern: value.weekPattern ?? "all",
    };
  });

export const importModuleSchema = z.object({
  code: moduleCodeSchema,
  tg: tgSchema.optional().default("TG01"),
  name: z.string().trim().min(1).max(200),
  color: colorSchema.optional(),
  lessons: z.array(importLessonSchema).min(1),
});

export const importPayloadSchema = z
  .object({
    semesterId: uuidSchema.optional(),
    semester: semesterCreateSchema.optional(),
    replaceExisting: z.boolean().optional().default(true),
    modules: z.array(importModuleSchema).min(1),
  })
  .refine((value) => Boolean(value.semesterId || value.semester), {
    message: "Either semesterId or semester is required.",
    path: ["semesterId"],
  });

export type ImportPayload = z.infer<typeof importPayloadSchema>;
