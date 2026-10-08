import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import { annotateEventCohort } from "@/lib/timetable/schedule-cohorts";
import type { ClassEventWithWeekRecord } from "@/lib/timetable/types";
import {
  getDataSnapshotBucket,
  type ScheduleSnapshot,
  type ScheduleSnapshotBucket,
} from "./snapshot-types";

const scheduleSnapshotRoot = path.resolve(process.cwd(), "data", "snapshots", "schedules");

function scheduleSnapshotLocation(relativePath: string, expectedSemesterId: number)
{
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const match = /^schedules\/(\d+)-([A-Za-z0-9_-]+\.json)$/.exec(normalizedPath);
  if (!match || Number(match[1]) !== expectedSemesterId)
  {
    throw new Error(`Invalid schedule snapshot path: ${relativePath}`);
  }
  return `${match[1]}-${match[2]}`;
}

export async function getScheduleSnapshot(semesterId: number, courseCode: string): Promise<ScheduleSnapshot | null>
{
  const normalizedCourseCode = courseCode.trim().toUpperCase();
  const bucket = getDataSnapshotBucket(normalizedCourseCode);
  const manifest = await getSnapshotManifest();
  if (!manifest.semesters.some(semester => semester.semesterId === semesterId && !semester.isArchived)) return null;
  const relativePath = manifest.scheduleBucketFiles[String(semesterId)]?.[bucket];
  if (!relativePath)
  {
    return null;
  }
  const fileName = scheduleSnapshotLocation(relativePath, semesterId);
  const snapshots = await readCachedJson<ScheduleSnapshotBucket>(
    relativePath,
    () => readFile(path.join(scheduleSnapshotRoot, fileName), "utf8"),
  );
  const classes = snapshots.courses[normalizedCourseCode]?.map(group => ({
    ...group,
    language: group.language ?? null,
    events: group.events.map((event: ClassEventWithWeekRecord & { venue?: string | null }) => {
      const { venue, ...current } = event;
      const normalized = { ...current, campus: event.campus ?? venue ?? null };
      return normalized.startSemesterId === undefined
        ? annotateEventCohort(normalized, manifest.semesters) : normalized;
    }),
  }));
  return classes
    ? { semesterId, courseCode: normalizedCourseCode, classes } satisfies ScheduleSnapshot
    : null;
}
