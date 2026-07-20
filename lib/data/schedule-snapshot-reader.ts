import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import type { ScheduleSnapshot } from "./snapshot-types";

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
  const manifest = await getSnapshotManifest();
  const relativePath = manifest.scheduleFiles[String(semesterId)]?.[courseCode.trim().toUpperCase()];
  if (!relativePath)
  {
    return null;
  }
  const fileName = scheduleSnapshotLocation(relativePath, semesterId);
  return readCachedJson<ScheduleSnapshot>(
    relativePath,
    () => readFile(path.join(scheduleSnapshotRoot, fileName), "utf8"),
  );
}
