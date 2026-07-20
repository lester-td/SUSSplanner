import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import {
  getDataSnapshotBucket,
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

export async function getCourseSnapshot(courseCode: string)
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
  return snapshots[normalizedCourseCode] ?? null;
}
