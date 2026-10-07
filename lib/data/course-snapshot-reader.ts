import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import { getActiveSemesters, getSemesterChoices } from "@/lib/timetable/semester-visibility";
import {
  getDataSnapshotBucket,
  type CourseSnapshot,
  type CourseSnapshotBucket,
} from "./snapshot-types";

const courseSnapshotRoot = path.resolve(process.cwd(), "data", "snapshots", "courses");

function courseSnapshotFileName(relativePath: string)
{
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const fileName = normalizedPath.startsWith("courses/") ? normalizedPath.slice("courses/".length) : "";
  if (!/^[A-Za-z0-9_-]+\.json$/.test(fileName))
  {
    throw new Error(`Invalid course snapshot path: ${relativePath}`);
  }
  return fileName;
}

export async function getCourseSnapshot(courseCode: string): Promise<CourseSnapshot | null>
{
  const normalizedCourseCode = courseCode.trim().toUpperCase();
  const bucket = getDataSnapshotBucket(normalizedCourseCode);
  const manifest = await getSnapshotManifest();
  const relativePath = manifest.courseBucketFiles[bucket];
  if (!relativePath)
  {
    return null;
  }
  const fileName = courseSnapshotFileName(relativePath);
  const snapshots = await readCachedJson<CourseSnapshotBucket>(
    relativePath,
    () => readFile(path.join(courseSnapshotRoot, fileName), "utf8"),
  );
  const snapshot = snapshots[normalizedCourseCode];
  if (!snapshot) return null;
  const activeById = new Map(getActiveSemesters(manifest.semesters).map(semester => {
    const { weeks: _weeks, ...record } = semester;
    return [semester.semesterId, record] as const;
  }));
  const availableIds = new Set(getSemesterChoices(manifest.semesters).map(semester => semester.semesterId));
  return {
    ...snapshot,
    offeredSemesters: snapshot.offeredSemesters.filter(semester => availableIds.has(semester.semesterId) && !semester.isArchived)
      .map(semester => activeById.get(semester.semesterId)!),
    scheduledSemesters: (snapshot.scheduledSemesters ?? snapshot.offeredSemesters)
      .filter(semester => activeById.has(semester.semesterId) && !semester.isArchived)
      .map(semester => activeById.get(semester.semesterId)!),
  };
}
