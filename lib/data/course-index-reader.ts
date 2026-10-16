import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";
import { getActiveSemesters, getSemesterChoices } from "@/lib/timetable/semester-visibility";

const snapshotRoot = path.resolve(process.cwd(), "data", "snapshots");
let startingIndex: Promise<CourseIndexSnapshotRecord[]> | undefined;

function resolveStartingOfferings(record: CourseIndexSnapshotRecord): CourseIndexSnapshotRecord
{
  // The snapshot generator already excludes continuation-only classes.
  const offerings = record.offerings.filter(offering => offering.classCount > 0);
  const availableClassCount = offerings.reduce((total, offering) => total + offering.classCount, 0);
  return {
    ...record,
    offerings,
    // Continuation destinations are retained separately in scheduledSemesters.
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
  ).then(async records => {
    const manifest = await getSnapshotManifest();
    const activeById = new Map(getActiveSemesters(manifest.semesters).map(semester => {
      const { weeks: _weeks, ...record } = semester;
      return [semester.semesterId, record] as const;
    }));
    const availableIds = new Set(getSemesterChoices(manifest.semesters).map(semester => semester.semesterId));
    return Promise.all(records.map(record => resolveStartingOfferings({
      ...record,
      offeredSemesters: record.offeredSemesters.filter(semester => availableIds.has(semester.semesterId) && !semester.isArchived)
        .map(semester => activeById.get(semester.semesterId)!),
      scheduledSemesters: (record.scheduledSemesters ?? record.offeredSemesters)
        .filter(semester => activeById.has(semester.semesterId) && !semester.isArchived)
        .map(semester => activeById.get(semester.semesterId)!),
      offerings: record.offerings.filter(offering => availableIds.has(offering.semesterId)),
    })));
  }).catch(error => {
    startingIndex = undefined;
    throw error;
  });
  return startingIndex;
}
