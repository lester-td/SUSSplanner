import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { classes, moduleOfferings, modules, semesters } from "@/lib/db/schema";
import type { ClassCreateInput, ClassUpdateInput } from "@/lib/validation/classes";
import { computeEndTime, normalizeModuleCode } from "@/lib/validation/common";
import { resolveScopedSemesterId } from "./semesters";

export type ClassFilters = {
  moduleCode?: string;
  semesterId?: string;
  offeringId?: string;
  activeOnly?: boolean;
};

async function resolveOfferingId(
  input: Pick<ClassCreateInput | ClassUpdateInput, "offeringId" | "offering">
)
{
  if (input.offering)
  {
    const [offeringRecord] = await db
      .insert(moduleOfferings)
      .values({
        moduleId: input.offering.moduleId,
        semesterId: input.offering.semesterId,
        tg: input.offering.tg,
        color: input.offering.color,
      })
      .onConflictDoUpdate({
        target: [
          moduleOfferings.moduleId,
          moduleOfferings.semesterId,
          moduleOfferings.tg,
        ],
        set: {
          color: input.offering.color,
          updatedAt: new Date(),
        },
      })
      .returning();

    return offeringRecord.id;
  }

  return input.offeringId!;
}

export async function getPublicClasses(filters: ClassFilters = {})
{
  const scopedSemesterId = await resolveScopedSemesterId(
    filters.semesterId,
    filters.activeOnly ?? true
  );

  const predicates = [];
  if (filters.offeringId)
  {
    predicates.push(eq(classes.offeringId, filters.offeringId));
  }

  if (filters.moduleCode)
  {
    predicates.push(eq(modules.code, normalizeModuleCode(filters.moduleCode)));
  }

  if (scopedSemesterId)
  {
    predicates.push(eq(moduleOfferings.semesterId, scopedSemesterId));
  }

  const rows = await db
    .select({
      id: classes.id,
      offeringId: classes.offeringId,
      moduleId: modules.id,
      moduleCode: modules.code,
      moduleName: modules.name,
      semesterId: semesters.id,
      academicYear: semesters.academicYear,
      term: semesters.term,
      semesterLabel: semesters.label,
      tg: moduleOfferings.tg,
      color: moduleOfferings.color,
      day: classes.day,
      startTime: classes.startTime,
      durationHours: classes.durationHours,
      type: classes.classType,
      venue: classes.venue,
      weekPattern: classes.weekPattern,
    })
    .from(classes)
    .innerJoin(moduleOfferings, eq(classes.offeringId, moduleOfferings.id))
    .innerJoin(modules, eq(moduleOfferings.moduleId, modules.id))
    .innerJoin(semesters, eq(moduleOfferings.semesterId, semesters.id))
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(
      asc(modules.code),
      asc(moduleOfferings.tg),
      asc(classes.day),
      asc(classes.startTime)
    );

  return rows.map((row) => ({
    ...row,
    code: `${row.moduleCode}-${row.tg}`,
    endTime: computeEndTime(row.startTime, row.durationHours),
  }));
}

export async function createClass(input: ClassCreateInput)
{
  const offeringId = await resolveOfferingId(input);

  const [createdClass] = await db
    .insert(classes)
    .values({
      offeringId,
      day: input.day,
      startTime: input.startTime,
      durationHours: input.durationHours,
      classType: input.type,
      venue: input.venue,
      weekPattern: input.weekPattern ?? "all",
    })
    .returning();

  return createdClass;
}

export async function updateClassById(id: string, input: ClassUpdateInput)
{
  const offeringId = input.offering || input.offeringId
    ? await resolveOfferingId(input)
    : undefined;

  const [updatedClass] = await db
    .update(classes)
    .set({
      offeringId,
      day: input.day,
      startTime: input.startTime,
      durationHours: input.durationHours,
      classType: input.type,
      venue: input.venue,
      weekPattern: input.weekPattern,
      updatedAt: new Date(),
    })
    .where(eq(classes.id, id))
    .returning();

  return updatedClass ?? null;
}

export async function deleteClassById(id: string)
{
  const [deletedClass] = await db
    .delete(classes)
    .where(eq(classes.id, id))
    .returning();

  return deletedClass ?? null;
}
