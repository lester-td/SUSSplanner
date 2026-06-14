import { z } from "zod";

export const studyPlanCourseSchema = z.object({
  id: z.string().trim().min(1).max(120),
  courseCode: z.string().trim().toUpperCase().min(1).max(40),
  courseName: z.string().trim().min(1).max(255),
  schoolName: z.string().trim().max(255).nullable(),
  creditUnits: z.number().min(0).max(100),
  semesterSpan: z.number().int().min(1).max(20),
  assignedSemester: z.number().int().min(0).max(99).nullable(),
  source: z.enum(["catalog", "manual"]),
});

export const studyPlanStateSchema = z.object({
  totalCreditsGoal: z.number().min(0).max(400),
  numSemesters: z.number().int().min(1).max(20),
  courses: z.array(studyPlanCourseSchema).max(300),
});

export const studyPlanBackupSchema = z.object({
  format: z.literal("sussplanner-study-plan"),
  version: z.literal(1),
  exportedAt: z.string().trim().min(1),
  plan: studyPlanStateSchema,
});
