import { z } from "zod";

export const scheduleTypeSchema = z.enum(["daytime", "evening"]);
export const groupCodeTypeSchema = z.enum(["TG", "CRN"]);
export const eventKindSchema = z.enum(["CLASS", "EXAM", "OTHER"]);
export const weekTypeSchema = z.enum(["TEACHING", "STUDY", "EXAM"]);
export const plannerViewModeSchema = z.enum(["class", "exam"]);
export const timetableOrientationSchema = z.enum(["horizontal", "vertical"]);

export const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(20)
  .regex(/^[A-Z0-9]+$/);

export const groupCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((value) => !value.includes(":") && !value.includes(","), {
    message: "groupCode cannot contain ':' or ','.",
  });

export const semesterIdSchema = z.coerce.number().int().positive();
export const optionalSemesterIdSchema = z
  .union([semesterIdSchema, z.literal(""), z.undefined()])
  .transform((value) => (typeof value === "number" ? value : undefined));

export const sharedClassIdentifierSchema = z.object({
  courseCode: courseCodeSchema,
  scheduleType: scheduleTypeSchema,
  groupCodeType: groupCodeTypeSchema,
  groupCode: groupCodeSchema,
});

export const sharedTimetableStateSchema = z.object({
  semesterId: semesterIdSchema,
  selectedClasses: z.array(sharedClassIdentifierSchema).max(50),
});

export const courseColorPreferenceSchema = z.string().regex(/^theme-color:\d+$/);

export const plannerSemesterStateSchema = sharedTimetableStateSchema.extend({
  hiddenClasses: z.array(z.string()).max(50),
  courseColorsByCourseCode: z.record(courseCodeSchema, courseColorPreferenceSchema).default({}),
  selectedWeekId: z.union([z.literal("all"), semesterIdSchema]),
});

export const plannerStorageStateSchema = plannerSemesterStateSchema.extend({
  orientation: timetableOrientationSchema,
  viewMode: plannerViewModeSchema,
  semesterStates: z.record(z.string(), plannerSemesterStateSchema).default({}),
});

export const classesQuerySchema = z.object({
  semesterId: optionalSemesterIdSchema,
  courseCode: courseCodeSchema.optional(),
  scheduleType: scheduleTypeSchema.optional(),
  classes: z.string().trim().optional(),
});

export const courseSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  semesterId: optionalSemesterIdSchema,
  scheduleType: scheduleTypeSchema.optional(),
  postgraduate: z
    .enum(["all", "undergraduate", "postgraduate"])
    .optional()
    .default("all"),
  school: z.string().trim().max(255).optional(),
  courseLevel: z.string().trim().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});
