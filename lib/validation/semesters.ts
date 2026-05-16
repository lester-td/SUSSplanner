import { z } from "zod";

export const semesterCreateSchema = z
  .object({
    academicYear: z.string().trim().min(4).max(20),
    term: z.coerce.number().int().min(1).max(3),
    label: z.string().trim().max(120).optional(),
    isActive: z.boolean().optional().default(false),
  })
  .transform((value) => ({
    ...value,
    label: value.label?.trim() || `AY ${value.academicYear} Semester ${value.term}`,
  }));

export const semesterUpdateSchema = z
  .object({
    academicYear: z.string().trim().min(4).max(20).optional(),
    term: z.coerce.number().int().min(1).max(3).optional(),
    label: z.string().trim().max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type SemesterCreateInput = z.infer<typeof semesterCreateSchema>;
export type SemesterUpdateInput = z.infer<typeof semesterUpdateSchema>;
