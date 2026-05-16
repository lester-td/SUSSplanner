import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { modules } from "@/lib/db/schema";
import type { ModuleCreateInput, ModuleUpdateInput } from "@/lib/validation/modules";
import { normalizeModuleCode } from "@/lib/validation/common";
import { getPublicModules, getPublicOfferings, type OfferingFilters } from "./offerings";

export async function getPublicModuleByCode(code: string, filters: OfferingFilters = {})
{
  const normalizedCode = normalizeModuleCode(code);

  const [moduleRecord] = await db
    .select()
    .from(modules)
    .where(eq(modules.code, normalizedCode))
    .limit(1);

  if (!moduleRecord)
  {
    return null;
  }

  const offerings = await getPublicOfferings({
    ...filters,
    moduleCode: normalizedCode,
  });

  return {
    id: moduleRecord.id,
    code: moduleRecord.code,
    name: moduleRecord.name,
    offerings,
    frontendModules: offerings.map((offering) => ({
      code: offering.code,
      rootCode: offering.rootCode,
      tg: offering.tg,
      name: offering.moduleName,
      color: offering.color,
      lessons: offering.lessons,
    })),
  };
}

export async function listPublicModules(filters: OfferingFilters = {})
{
  return getPublicModules(filters);
}

export async function createModule(input: ModuleCreateInput)
{
  const [createdModule] = await db
    .insert(modules)
    .values({
      code: input.code,
      name: input.name,
    })
    .returning();

  return createdModule;
}

export async function updateModuleById(id: string, input: ModuleUpdateInput)
{
  const [updatedModule] = await db
    .update(modules)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(modules.id, id))
    .returning();

  return updatedModule ?? null;
}

export async function deleteModuleById(id: string)
{
  const [deletedModule] = await db
    .delete(modules)
    .where(eq(modules.id, id))
    .returning();

  return deletedModule ?? null;
}
