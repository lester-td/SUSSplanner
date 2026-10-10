import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { validateSnapshotArtifacts } from "./artifact-validation";
import { buildRequisites } from "./build-requisites";
import { fixtureCatalogue } from "./fixtures";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function artifacts(formatVersion = 2)
{
  const root = await mkdtemp(path.join(os.tmpdir(), "suss-requisite-artifacts-")); roots.push(root);
  await mkdir(path.join(root, "courses"));
  const requisites = buildRequisites([], [], fixtureCatalogue).byCourse;
  const bucket = Object.fromEntries(fixtureCatalogue.map(course => [course.courseCode, { course: { courseCode: course.courseCode }, requisites: requisites[course.courseCode] }]));
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({ formatVersion, courseBucketFiles: { "00": "courses/00.json" }, scheduleBucketFiles: {} }));
  await writeFile(path.join(root, "course-index.json"), JSON.stringify(fixtureCatalogue));
  await writeFile(path.join(root, "courses/00.json"), JSON.stringify(bucket));
  return { root, bucket };
}
it("rejects format-1 artifacts and accepts complete empty format-2 information", async () => {
  await expect(validateSnapshotArtifacts((await artifacts(1)).root)).rejects.toThrow(/expected 2/);
  await expect(validateSnapshotArtifacts((await artifacts()).root)).resolves.toEqual({ formatVersion: 2, courses: fixtureCatalogue.length });
});
it("rejects missing prerequisite fields and absent referenced shards", async () => {
  const { root, bucket } = await artifacts();
  delete (bucket.MAIN300 as { requisites?: unknown }).requisites;
  await writeFile(path.join(root, "courses/00.json"), JSON.stringify(bucket));
  await expect(validateSnapshotArtifacts(root)).rejects.toThrow();
  const other = await artifacts(); await rm(path.join(other.root, "courses/00.json"));
  await expect(validateSnapshotArtifacts(other.root)).rejects.toThrow(/ENOENT/);
});
