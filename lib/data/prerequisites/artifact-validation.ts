import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_SNAPSHOT_BUCKET_COUNT, DATA_SNAPSHOT_FORMAT_VERSION, getDataSnapshotBucket, type CourseSnapshotBucket, type DataSnapshotManifest } from "../snapshot-types";
import { validateRequisitesSnapshot } from "./snapshot-validation";

export async function validateSnapshotArtifacts(root: string)
{
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as DataSnapshotManifest;
  if (manifest.formatVersion !== DATA_SNAPSHOT_FORMAT_VERSION) throw new Error(`Unsupported data snapshot format ${manifest.formatVersion}; expected ${DATA_SNAPSHOT_FORMAT_VERSION}. Regenerate snapshots after migrating reviewed curriculum tables.`);
  const index = JSON.parse(await readFile(path.join(root, "course-index.json"), "utf8")) as Array<{ courseCode: string }>;
  const codes = new Set(index.map(course => course.courseCode));
  const exported = new Set<string>();
  for (const [bucketKey, file] of Object.entries(manifest.courseBucketFiles))
  {
    if (!/^[a-f0-9]{2}$/.test(bucketKey) || Number.parseInt(bucketKey, 16) >= DATA_SNAPSHOT_BUCKET_COUNT) throw new Error(`Invalid course bucket key: ${bucketKey}`);
    if (file !== `courses/${bucketKey}.json`) throw new Error(`Invalid course artifact path for bucket ${bucketKey}: ${file}; expected courses/${bucketKey}.json`);
    const bucket = JSON.parse(await readFile(path.join(root, file), "utf8")) as CourseSnapshotBucket;
    for (const [code, course] of Object.entries(bucket))
    {
      if (course.course.courseCode !== code || !codes.has(code) || exported.has(code)) throw new Error(`Invalid/duplicate exported course: ${code}`);
      const expectedBucket = getDataSnapshotBucket(code);
      if (expectedBucket !== bucketKey) throw new Error(`Course ${code} belongs to bucket ${expectedBucket}, not ${bucketKey}`);
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
