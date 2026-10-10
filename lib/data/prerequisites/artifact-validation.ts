import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_SNAPSHOT_FORMAT_VERSION, type CourseSnapshotBucket, type DataSnapshotManifest } from "../snapshot-types";
import { validateRequisitesSnapshot } from "./snapshot-validation";

export async function validateSnapshotArtifacts(root: string)
{
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as DataSnapshotManifest;
  if (manifest.formatVersion !== DATA_SNAPSHOT_FORMAT_VERSION) throw new Error(`Unsupported data snapshot format ${manifest.formatVersion}; expected ${DATA_SNAPSHOT_FORMAT_VERSION}. Regenerate snapshots after migrating reviewed curriculum tables.`);
  const index = JSON.parse(await readFile(path.join(root, "course-index.json"), "utf8")) as Array<{ courseCode: string }>;
  const codes = new Set(index.map(course => course.courseCode));
  const exported = new Set<string>();
  for (const file of Object.values(manifest.courseBucketFiles))
  {
    if (!/^courses\/[a-f0-9]{2}\.json$/.test(file)) throw new Error(`Invalid course artifact path: ${file}`);
    const bucket = JSON.parse(await readFile(path.join(root, file), "utf8")) as CourseSnapshotBucket;
    for (const [code, course] of Object.entries(bucket))
    {
      if (course.course.courseCode !== code || !codes.has(code) || exported.has(code)) throw new Error(`Invalid/duplicate exported course: ${code}`);
      exported.add(code);
      const requisites = validateRequisitesSnapshot(course.requisites, code);
      for (const summary of Object.values(requisites.coursesByCode)) if ((summary.availability === "catalogued") !== codes.has(summary.courseCode)) throw new Error(`Catalogue membership mismatch: ${summary.courseCode}`);
    }
  }
  if (codes.size !== exported.size) throw new Error("Course index/shard coverage mismatch");
  for (const files of Object.values(manifest.scheduleBucketFiles)) for (const file of Object.values(files))
  {
    if (!/^schedules\/\d+-[a-f0-9]{2}\.json$/.test(file)) throw new Error(`Invalid schedule artifact path: ${file}`);
    await readFile(path.join(root, file), "utf8");
  }
  return { formatVersion: manifest.formatVersion, courses: exported.size };
}
