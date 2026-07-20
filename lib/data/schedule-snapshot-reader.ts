import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
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

export async function getScheduleSnapshot(semesterId: number, courseCode: string)
{
  const normalizedCourseCode = courseCode.trim().toUpperCase();
  const bucket = getDataSnapshotBucket(normalizedCourseCode);
  const manifest = await getSnapshotManifest();
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
  const classes = snapshots.courses[normalizedCourseCode];
  return classes
    ? { semesterId, courseCode: normalizedCourseCode, classes } satisfies ScheduleSnapshot
    : null;
}
