import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readCachedJson } from "./snapshot-cache";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";
import { inferCatalogSemesterSpan } from "@/lib/courses/semester-span";
import { isClassStartingInSemester } from "@/lib/timetable/semester-events";

const snapshotRoot = path.resolve(process.cwd(), "data", "snapshots");
let startingIndex: Promise<CourseIndexSnapshotRecord[]> | undefined;

async function resolveStartingOfferings(record: CourseIndexSnapshotRecord): Promise<CourseIndexSnapshotRecord>
{
  if (inferCatalogSemesterSpan(record.courseCode) === 1) return record;
  const offerings = (await Promise.all(record.offerings.map(async offering => {
    const snapshot = await getScheduleSnapshot(offering.semesterId, record.courseCode);
    const classes = snapshot?.classes.filter(group => group.scheduleType === offering.scheduleType && isClassStartingInSemester(group)) ?? [];
    return { ...offering, classCount: classes.length, availableAsGsp: classes.some(group => group.availableAsGsp === true) };
  }))).filter(offering => offering.classCount > 0);
  const availableClassCount = offerings.reduce((total, offering) => total + offering.classCount, 0);
  return {
    ...record,
    offerings,
    // Retain covered terms for automatic continuation links. Search availability
    // is determined by offerings, which contains only new starting classes.
    availableClassCount,
    hasAvailableClasses: availableClassCount > 0,
    scheduleTypes: [...new Set(offerings.map(offering => offering.scheduleType))],
    availableAsGsp: offerings.some(offering => offering.availableAsGsp),
  };
}

export function getCourseIndexSnapshot()
{
  startingIndex ??= readCachedJson<CourseIndexSnapshotRecord[]>(
    "course-index.json",
    () => readFile(path.join(snapshotRoot, "course-index.json"), "utf8"),
  ).then(records => Promise.all(records.map(resolveStartingOfferings))).catch(error => {
    startingIndex = undefined;
    throw error;
  });
  return startingIndex;
}
