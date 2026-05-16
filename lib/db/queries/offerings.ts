import { and, asc, eq } from "drizzle-orm";

import {
  fallbackModuleColor,
  normalizeFrontendLessonType,
  sortFrontendLessons,
  type FrontendCatalogModule,
  type FrontendLesson,
} from "@/lib/api/catalog";
import { db } from "@/lib/db";
import { classes, moduleOfferings, modules, semesters } from "@/lib/db/schema";
import { computeEndTime, normalizeModuleCode, toFrontendTime } from "@/lib/validation/common";
import { resolveScopedSemesterId } from "./semesters";

export type OfferingFilters = {
  moduleCode?: string;
  semesterId?: string;
  activeOnly?: boolean;
};

type OfferingRow = {
  offeringId: string;
  offeringTg: string;
  offeringColor: string | null;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  semesterId: string;
  semesterAcademicYear: string;
  semesterTerm: number;
  semesterLabel: string;
  semesterIsActive: boolean;
  classId: string | null;
  classDay: string | null;
  classStartTime: string | null;
  classDurationHours: number | null;
  classType: string | null;
  classVenue: string | null;
  classWeekPattern: string | null;
};

export type PublicClassRecord = {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  type: string;
  venue: string;
  weekPattern: "all" | "odd" | "even";
};

export type PublicOffering = {
  id: string;
  code: string;
  rootCode: string;
  tg: string;
  color: string;
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  semesterId: string;
  semester: {
    id: string;
    academicYear: string;
    term: number;
    label: string;
    isActive: boolean;
  };
  lessons: FrontendLesson[];
  classes: PublicClassRecord[];
};

async function fetchOfferingRows(filters: OfferingFilters = {})
{
  const scopedSemesterId = await resolveScopedSemesterId(
    filters.semesterId,
    filters.activeOnly ?? true
  );

  const predicates = [];
  if (scopedSemesterId)
  {
    predicates.push(eq(moduleOfferings.semesterId, scopedSemesterId));
  }

  if (filters.moduleCode)
  {
    predicates.push(eq(modules.code, normalizeModuleCode(filters.moduleCode)));
  }

  return db
    .select({
      offeringId: moduleOfferings.id,
      offeringTg: moduleOfferings.tg,
      offeringColor: moduleOfferings.color,
      moduleId: modules.id,
      moduleCode: modules.code,
      moduleName: modules.name,
      semesterId: semesters.id,
      semesterAcademicYear: semesters.academicYear,
      semesterTerm: semesters.term,
      semesterLabel: semesters.label,
      semesterIsActive: semesters.isActive,
      classId: classes.id,
      classDay: classes.day,
      classStartTime: classes.startTime,
      classDurationHours: classes.durationHours,
      classType: classes.classType,
      classVenue: classes.venue,
      classWeekPattern: classes.weekPattern,
    })
    .from(moduleOfferings)
    .innerJoin(modules, eq(moduleOfferings.moduleId, modules.id))
    .innerJoin(semesters, eq(moduleOfferings.semesterId, semesters.id))
    .leftJoin(classes, eq(classes.offeringId, moduleOfferings.id))
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(
      asc(modules.code),
      asc(semesters.academicYear),
      asc(semesters.term),
      asc(moduleOfferings.tg),
      asc(classes.startTime)
    ) as Promise<OfferingRow[]>;
}

function mapClassRowToPublicClass(row: OfferingRow): PublicClassRecord | null
{
  if (!row.classId || !row.classDay || !row.classStartTime || !row.classDurationHours || !row.classType || !row.classVenue || !row.classWeekPattern)
  {
    return null;
  }

  return {
    id: row.classId,
    day: row.classDay,
    startTime: row.classStartTime,
    endTime: computeEndTime(row.classStartTime, row.classDurationHours),
    durationHours: row.classDurationHours,
    type: row.classType,
    venue: row.classVenue,
    weekPattern: row.classWeekPattern as "all" | "odd" | "even",
  };
}

function mapPublicClassToFrontendLesson(classRow: PublicClassRecord): FrontendLesson
{
  return {
    day: classRow.day,
    start: toFrontendTime(classRow.startTime),
    end: toFrontendTime(classRow.endTime),
    type: normalizeFrontendLessonType(classRow.type),
    venue: classRow.venue,
    weekPattern: classRow.weekPattern,
  };
}

function sortPublicClasses(classRows: PublicClassRecord[])
{
  return [...classRows].sort((left, right) => {
    const dayA = left.day;
    const dayB = right.day;
    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayDifference = dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
    if (dayDifference !== 0)
    {
      return dayDifference;
    }

    return left.startTime.localeCompare(right.startTime);
  });
}

function groupOfferingRows(rows: OfferingRow[])
{
  const offeringsById = new Map<string, PublicOffering>();

  for (const row of rows)
  {
    const existingOffering = offeringsById.get(row.offeringId);
    if (!existingOffering)
    {
      offeringsById.set(row.offeringId, {
        id: row.offeringId,
        code: `${row.moduleCode}-${row.offeringTg}`,
        rootCode: row.moduleCode,
        tg: row.offeringTg,
        color: row.offeringColor ?? fallbackModuleColor(`${row.moduleCode}-${row.offeringTg}`),
        moduleId: row.moduleId,
        moduleCode: row.moduleCode,
        moduleName: row.moduleName,
        semesterId: row.semesterId,
        semester: {
          id: row.semesterId,
          academicYear: row.semesterAcademicYear,
          term: row.semesterTerm,
          label: row.semesterLabel,
          isActive: row.semesterIsActive,
        },
        lessons: [],
        classes: [],
      });
    }

    const publicClass = mapClassRowToPublicClass(row);
    if (!publicClass)
    {
      continue;
    }

    const offering = offeringsById.get(row.offeringId)!;
    offering.classes.push(publicClass);
    offering.lessons.push(mapPublicClassToFrontendLesson(publicClass));
  }

  return [...offeringsById.values()].map((offering) => ({
    ...offering,
    classes: sortPublicClasses(offering.classes),
    lessons: sortFrontendLessons(offering.lessons),
  }));
}

export async function getPublicOfferings(filters: OfferingFilters = {})
{
  const rows = await fetchOfferingRows(filters);
  return groupOfferingRows(rows);
}

export async function getPublicModules(filters: OfferingFilters = {}): Promise<FrontendCatalogModule[]>
{
  const offerings = await getPublicOfferings(filters);

  return offerings
    .filter((offering) => offering.lessons.length > 0)
    .map((offering) => ({
      code: offering.code,
      rootCode: offering.rootCode,
      tg: offering.tg,
      name: offering.moduleName,
      color: offering.color,
      lessons: offering.lessons,
    }));
}
