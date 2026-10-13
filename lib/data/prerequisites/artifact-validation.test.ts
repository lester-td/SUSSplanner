import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { validateSnapshotArtifacts } from "./artifact-validation";
import { buildRequisites } from "./build-requisites";
import { fixtureCatalogue } from "./fixtures";
import { getDataSnapshotBucket, type DataSnapshotManifest } from "../snapshot-types";

vi.mock("server-only", () => ({}));
vi.mock("../manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
vi.mock("../snapshot-cache", () => ({ readCachedJson: vi.fn() }));
import { getSnapshotManifest } from "../manifest-reader";
import { readCachedJson } from "../snapshot-cache";
import { getCourseSnapshot } from "../course-snapshot-reader";

const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function artifacts(formatVersion = 2)
{
  const root = await mkdtemp(path.join(os.tmpdir(), "suss-requisite-artifacts-")); roots.push(root);
  await mkdir(path.join(root, "courses"));
  const requisites = buildRequisites([], [], fixtureCatalogue).byCourse;
  const courses = Object.fromEntries(fixtureCatalogue.map(course => [course.courseCode, {
    course: { courseCode: course.courseCode }, offeredSemesters: [], requisites: requisites[course.courseCode],
  }]));
  const buckets: Record<string, typeof courses> = {};
  for (const [code, course] of Object.entries(courses)) (buckets[getDataSnapshotBucket(code)] ??= {})[code] = course;
  const manifest = { formatVersion, semesters: [], courseBucketFiles: Object.fromEntries(Object.keys(buckets).map(key => [key, `courses/${key}.json`])), scheduleBucketFiles: {} };
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "course-index.json"), JSON.stringify(fixtureCatalogue));
  for (const [key, bucket] of Object.entries(buckets)) await writeFile(path.join(root, `courses/${key}.json`), JSON.stringify(bucket));
  return { root, courses, buckets, manifest };
}
it("rejects format-1 artifacts and accepts complete, readable format-2 information", async () => {
  await expect(validateSnapshotArtifacts((await artifacts(1)).root)).rejects.toThrow(/expected 2/);
  const { root, manifest } = await artifacts();
  await expect(validateSnapshotArtifacts(root)).resolves.toEqual({ formatVersion: 2, courses: fixtureCatalogue.length });
  vi.mocked(getSnapshotManifest).mockResolvedValue(manifest as unknown as DataSnapshotManifest);
  vi.mocked(readCachedJson).mockImplementation(async file => JSON.parse(await readFile(path.join(root, file), "utf8")));
  for (const course of fixtureCatalogue) expect((await getCourseSnapshot(course.courseCode))?.course.courseCode).toBe(course.courseCode);
});
it("rejects missing prerequisite fields and absent referenced shards", async () => {
  const { root, courses, buckets } = await artifacts();
  delete (courses.MAIN300 as { requisites?: unknown }).requisites;
  const key = getDataSnapshotBucket("MAIN300");
  await writeFile(path.join(root, `courses/${key}.json`), JSON.stringify(buckets[key]));
  await expect(validateSnapshotArtifacts(root)).rejects.toThrow();
  const other = await artifacts(); await rm(path.join(other.root, `courses/${key}.json`));
  await expect(validateSnapshotArtifacts(other.root)).rejects.toThrow(/ENOENT/);
});
it("rejects otherwise valid courses placed together in the wrong bucket", async () => {
  const { root, courses, manifest } = await artifacts();
  manifest.courseBucketFiles = { "00": "courses/00.json" };
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "courses/00.json"), JSON.stringify(courses));
  await expect(validateSnapshotArtifacts(root)).rejects.toThrow(/Course .* belongs to bucket .* not 00/);
});
it("rejects swapped manifest bucket mappings", async () => {
  const { root, manifest } = await artifacts();
  const [first, second] = Object.keys(manifest.courseBucketFiles);
  [manifest.courseBucketFiles[first], manifest.courseBucketFiles[second]] = [manifest.courseBucketFiles[second], manifest.courseBucketFiles[first]];
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await expect(validateSnapshotArtifacts(root)).rejects.toThrow(/Invalid course artifact path for bucket/);
});
it.each(["0", "gg", "0A", "10", "ff", "../00"])("rejects invalid bucket key %s", async key => {
  const { root, manifest } = await artifacts();
  const valid = Object.keys(manifest.courseBucketFiles)[0];
  manifest.courseBucketFiles[key] = manifest.courseBucketFiles[valid];
  delete manifest.courseBucketFiles[valid];
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await expect(validateSnapshotArtifacts(root)).rejects.toThrow(/Invalid course bucket key/);
});
