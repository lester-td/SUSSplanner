import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { classes, moduleOfferings, modules, semesters } from "@/lib/db/schema";
import type { ImportPayload } from "@/lib/validation/imports";

export async function importModuleCatalog(payload: ImportPayload)
{
  return db.transaction(async (tx) => {
    let semesterId = payload.semesterId;

    if (!semesterId && payload.semester)
    {
      if (payload.semester.isActive)
      {
        await tx.update(semesters).set({
          isActive: false,
          updatedAt: new Date(),
        });
      }

      const [semesterRecord] = await tx
        .insert(semesters)
        .values({
          academicYear: payload.semester.academicYear,
          term: payload.semester.term,
          label: payload.semester.label,
          isActive: payload.semester.isActive,
        })
        .onConflictDoUpdate({
          target: [semesters.academicYear, semesters.term],
          set: {
            label: payload.semester.label,
            isActive: payload.semester.isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      semesterId = semesterRecord.id;
    }

    if (!semesterId)
    {
      throw new Error("A semester or semesterId is required for imports.");
    }

    let moduleCount = 0;
    let offeringCount = 0;
    let classCount = 0;

    for (const moduleEntry of payload.modules)
    {
      const [moduleRecord] = await tx
        .insert(modules)
        .values({
          code: moduleEntry.code,
          name: moduleEntry.name,
        })
        .onConflictDoUpdate({
          target: modules.code,
          set: {
            name: moduleEntry.name,
            updatedAt: new Date(),
          },
        })
        .returning();

      moduleCount += 1;

      const [offeringRecord] = await tx
        .insert(moduleOfferings)
        .values({
          moduleId: moduleRecord.id,
          semesterId,
          tg: moduleEntry.tg,
          color: moduleEntry.color,
        })
        .onConflictDoUpdate({
          target: [
            moduleOfferings.moduleId,
            moduleOfferings.semesterId,
            moduleOfferings.tg,
          ],
          set: {
            color: moduleEntry.color,
            updatedAt: new Date(),
          },
        })
        .returning();

      offeringCount += 1;

      if (payload.replaceExisting)
      {
        await tx
          .delete(classes)
          .where(eq(classes.offeringId, offeringRecord.id));
      }

      if (moduleEntry.lessons.length > 0)
      {
        await tx.insert(classes).values(
          moduleEntry.lessons.map((lesson) => ({
            offeringId: offeringRecord.id,
            day: lesson.day,
            startTime: lesson.startTime,
            durationHours: lesson.durationHours,
            classType: lesson.type,
            venue: lesson.venue,
            weekPattern: lesson.weekPattern,
          }))
        );
        classCount += moduleEntry.lessons.length;
      }
    }

    const [semesterRecord] = await tx
      .select()
      .from(semesters)
      .where(eq(semesters.id, semesterId))
      .limit(1);

    return {
      semesterId,
      semester: semesterRecord ?? null,
      replaceExisting: payload.replaceExisting,
      moduleCount,
      offeringCount,
      classCount,
    };
  });
}
