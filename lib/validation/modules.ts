import { z } from "zod";

import { moduleCodeSchema } from "./common";

export const moduleCreateSchema = z.object({
  code: moduleCodeSchema,
  name: z.string().trim().min(1).max(200),
});

export const moduleUpdateSchema = moduleCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type ModuleCreateInput = z.infer<typeof moduleCreateSchema>;
export type ModuleUpdateInput = z.infer<typeof moduleUpdateSchema>;
