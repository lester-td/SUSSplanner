import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DATA_SNAPSHOT_FORMAT_VERSION,
  type CourseIndexSnapshotRecord,
  type CourseSnapshot,
  type DataSnapshotManifest,
  type ScheduleSnapshot,
} from "./snapshot-types";

const snapshotRoot = path.resolve(process.cwd(), "data", "snapshots");
const jsonPromises = new Map<string, Promise<unknown>>();

function resolveSnapshotPath(relativePath: string)
{
  const resolvedPath = path.resolve(snapshotRoot, relativePath);
  if (resolvedPath !== snapshotRoot && !resolvedPath.startsWith(`${snapshotRoot}${path.sep}`))
  {
    throw new Error(`Snapshot path escapes the snapshot directory: ${relativePath}`);
  }
  return resolvedPath;
}

async function readSnapshotJson<T>(relativePath: string): Promise<T>
{
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const existing = jsonPromises.get(normalizedPath);
  if (existing)
  {
    return existing as Promise<T>;
  }

  const pending = readFile(resolveSnapshotPath(normalizedPath), "utf8")
    .then((content) => JSON.parse(content) as T)
    .catch((error) => {
      jsonPromises.delete(normalizedPath);
      throw new Error(
        `Unable to read generated data snapshot ${normalizedPath}. Run \`npm run data:build\` before starting the app.`,
        { cause: error },
      );
    });

  jsonPromises.set(normalizedPath, pending);
  return pending;
}

export async function getSnapshotManifest()
{
  const manifest = await readSnapshotJson<DataSnapshotManifest>("manifest.json");
  if (manifest.formatVersion !== DATA_SNAPSHOT_FORMAT_VERSION)
  {
    throw new Error(
      `Unsupported data snapshot format ${manifest.formatVersion}; expected ${DATA_SNAPSHOT_FORMAT_VERSION}.`,
    );
  }
  return manifest;
}

export function getCourseIndexSnapshot()
{
  return readSnapshotJson<CourseIndexSnapshotRecord[]>("course-index.json");
}

export async function getCourseSnapshot(courseCode: string)
{
  const manifest = await getSnapshotManifest();
  const relativePath = manifest.courseFiles[courseCode.trim().toUpperCase()];
  return relativePath ? readSnapshotJson<CourseSnapshot>(relativePath) : null;
}

export async function getScheduleSnapshot(semesterId: number, courseCode: string)
{
  const manifest = await getSnapshotManifest();
  const relativePath = manifest.scheduleFiles[String(semesterId)]?.[courseCode.trim().toUpperCase()];
  return relativePath ? readSnapshotJson<ScheduleSnapshot>(relativePath) : null;
}
