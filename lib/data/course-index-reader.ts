import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readCachedJson } from "./snapshot-cache";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";

const snapshotRoot = path.resolve(process.cwd(), "data", "snapshots");

export function getCourseIndexSnapshot()
{
  return readCachedJson<CourseIndexSnapshotRecord[]>(
    "course-index.json",
    () => readFile(path.join(snapshotRoot, "course-index.json"), "utf8"),
  );
}
