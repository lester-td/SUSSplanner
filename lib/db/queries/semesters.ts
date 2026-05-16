import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { semesters } from "@/lib/db/schema";
import type { SemesterCreateInput, SemesterUpdateInput } from "@/lib/validation/semesters";

export async function getActiveSemester()
{
  const [activeSemester] = await db
    .select()
    .from(semesters)
    .where(eq(semesters.isActive, true))
    .orderBy(desc(semesters.updatedAt), asc(semesters.term))
    .limit(1);

  return activeSemester ?? null;
}

export async function resolveScopedSemesterId(semesterId?: string, activeOnly = true)
{
  if (semesterId)
  {
    return semesterId;
  }

  if (!activeOnly)
  {
    return undefined;
  }

  const activeSemester = await getActiveSemester();
  return activeSemester?.id;
}

export async function createSemester(input: SemesterCreateInput)
{
  return db.transaction(async (tx) => {
    if (input.isActive)
    {
      await tx.update(semesters).set({
        isActive: false,
        updatedAt: new Date(),
      });
    }

    const [createdSemester] = await tx
      .insert(semesters)
      .values({
        academicYear: input.academicYear,
        term: input.term,
        label: input.label,
        isActive: input.isActive,
      })
      .returning();

    return createdSemester;
  });
}

export async function updateSemesterById(id: string, input: SemesterUpdateInput)
{
  return db.transaction(async (tx) => {
    if (input.isActive)
    {
      await tx
        .update(semesters)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(eq(semesters.isActive, true), ne(semesters.id, id)));
    }

    const [updatedSemester] = await tx
      .update(semesters)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(semesters.id, id))
      .returning();

    return updatedSemester ?? null;
  });
}
