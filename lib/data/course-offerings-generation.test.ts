import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { classes, classEvents, courses, curriculumPlans, curriculumPrerequisiteRules, semesters } from "../db/schema";
import { isClassStartingInSemester } from "../timetable/semester-events";
import { validateSnapshotArtifacts } from "./prerequisites/artifact-validation";
import { fixturePlan, fixtureRule } from "./prerequisites/fixtures";
import { getDataSnapshotBucket, type CourseIndexSnapshotRecord, type CourseSnapshot, type DataSnapshotManifest, type ScheduleSnapshotBucket } from "./snapshot-types";

const database = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>() }));
vi.mock("@next/env", () => ({ loadEnvConfig: vi.fn() }));
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end: vi.fn(async () => {}) })) }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () => ({ transaction: async (work: (db: unknown) => Promise<unknown>) => work({
    select: () => ({ from: (table: unknown) => Promise.resolve(database.rows.get(table) ?? []) }),
  }) }),
}));

let root: string;
let index: CourseIndexSnapshotRecord[];
let manifest: DataSnapshotManifest;
const details = new Map<string, CourseSnapshot>();
const schedules = new Map<string, ScheduleSnapshotBucket>();
const record = (code: string) => index.find(course => course.courseCode === code)!;
const groups = (code: string, semesterId: number) => schedules.get(`${semesterId}-${getDataSnapshotBucket(code)}`)?.courses[code] ?? [];
const ids = (terms: Array<{ semesterId: number }>) => terms.map(term => term.semesterId);

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "suss-offering-generation-"));
  const lastUpdated = "2026-01-01T00:00:00Z";
  database.rows.set(courses, ["ECE499", "NIE499", "NIE301", "ACC201"].map(courseCode => ({
    courseCode, courseName: courseCode, courseLevel: "4", creditUnits: 5, lastUpdated,
  })));
  database.rows.set(semesters, [
    { semesterId: 9, academicYear: "2025/2026", semesterNo: 1, semesterName: "July 2025", isArchived: true, hasIntakeSchedule: true },
    { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: false, hasIntakeSchedule: true },
    { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026", isArchived: false, hasIntakeSchedule: true },
    { semesterId: 14, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027", isArchived: false, hasIntakeSchedule: true },
    { semesterId: 15, academicYear: "2026/2027", semesterNo: 3, semesterName: "May 2027", isArchived: false, hasIntakeSchedule: false },
  ].map(semester => ({ ...semester, lastUpdated })));
  database.rows.set(classes, [
    { classId: 1, courseCode: "ECE499", semesterId: 1, scheduleType: "daytime", availableAsGsp: true },
    { classId: 2, courseCode: "NIE499", semesterId: 9, scheduleType: "daytime", availableAsGsp: true },
    { classId: 3, courseCode: "NIE301", semesterId: 1, scheduleType: "daytime", availableAsGsp: true },
    { classId: 4, courseCode: "NIE301", semesterId: 3, scheduleType: "evening", availableAsGsp: false },
    { classId: 5, courseCode: "ACC201", semesterId: 9, scheduleType: "daytime", availableAsGsp: true },
    { classId: 6, courseCode: "ACC201", semesterId: 15, scheduleType: "daytime", availableAsGsp: true },
    { classId: 7, courseCode: "ACC201", semesterId: 1, scheduleType: "evening", availableAsGsp: false },
  ].map(group => ({ ...group, groupCodeType: "TG", groupCode: `FIXTURE${group.classId}`, lastUpdated })));
  database.rows.set(classEvents, [
    [1, "2026-02-14"], [1, "2026-08-15"],
    [2, "2026-02-21"], [2, "2026-08-22"],
    [3, "2026-02-28"], [3, "2026-08-29"], [3, "2027-02-13"],
    [4, "2026-09-05"], [4, "2027-02-20"],
    [5, "2025-08-16"], [6, "2027-05-15"],
  ].map(([classId, eventDate], i) => ({
    classId, eventDate, eventId: i + 1, eventKind: "CLASS", dayOfWeek: 6,
    startTime: "09:00:00", endTime: "12:00:00", lastUpdated,
  })));

  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const pdfRoot = path.join(root, "scraper/data/input/curriculum-plans");
  await mkdir(pdfRoot, { recursive: true });
  await writeFile(path.join(pdfRoot, "fixture.pdf"), bytes);
  const plan = fixturePlan({ sourcePath: "fixture.pdf", sourceHash: createHash("sha256").update(bytes).digest("hex") });
  const rule = fixtureRule(plan, { type: "course", courseCode: "NIE499" }, {
    courseCode: "ECE499", ruleKey: `prerequisite:${plan.planKey}:ECE499:default`,
    rawText: "NIE499", ruleJson: { type: "course", courseCode: "NIE499" },
  });
  database.rows.set(curriculumPlans, [plan]);
  database.rows.set(curriculumPrerequisiteRules, [rule]);

  vi.stubEnv("DATABASE_URL", "postgres://fixture:fixture@localhost/fixture");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try { await import("../../scripts/build-data-snapshots"); }
  finally { cwd.mockRestore(); }
  const snapshotRoot = path.join(root, "data/snapshots");
  await vi.waitFor(async () => { await readFile(path.join(snapshotRoot, "manifest.json")); }, { timeout: 5000 });
  manifest = JSON.parse(await readFile(path.join(snapshotRoot, "manifest.json"), "utf8"));
  index = JSON.parse(await readFile(path.join(snapshotRoot, "course-index.json"), "utf8"));
  for (const file of Object.values(manifest.courseBucketFiles))
    for (const [code, course] of Object.entries(JSON.parse(await readFile(path.join(snapshotRoot, file), "utf8")) as Record<string, CourseSnapshot>)) details.set(code, course);
  for (const files of Object.values(manifest.scheduleBucketFiles))
    for (const file of Object.values(files)) schedules.set(path.basename(file, ".json"), JSON.parse(await readFile(path.join(snapshotRoot, file), "utf8")));
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});

it("offers a January start without advertising its globally eligible July continuation", () => {
  expect(ids(record("ECE499").offeredSemesters)).toEqual([1]);
  expect(ids(record("ECE499").scheduledSemesters!)).toEqual([3, 1]);
  expect(record("ECE499")).toMatchObject({ availableClassCount: 1, availableAsGsp: true });
  expect(groups("ECE499", 3)).toHaveLength(1);
  expect(groups("ECE499", 3).some(isClassStartingInSemester)).toBe(false);
  expect(groups("ECE499", 1)[0].continuationSemesterIds).toEqual([3]);
});

it("retains published continuations from an archived origin when there are no available starts", () => {
  expect(record("NIE499")).toMatchObject({ offeredSemesters: [], offerings: [], availableClassCount: 0, hasAvailableClasses: false, availableAsGsp: false });
  expect(ids(record("NIE499").scheduledSemesters!)).toEqual([3, 1]);
  for (const semesterId of [1, 3]) {
    expect(groups("NIE499", semesterId)).toHaveLength(1);
    expect(groups("NIE499", semesterId)[0].events[0].startSemesterId).toBe(9);
  }
});

it("keeps both starting semesters and the separate continuation-only third semester", () => {
  expect(ids(record("NIE301").offeredSemesters)).toEqual([3, 1]);
  expect(ids(record("NIE301").scheduledSemesters!)).toEqual([14, 3, 1]);
  expect(record("NIE301").offerings).toEqual([
    { semesterId: 1, scheduleType: "daytime", classCount: 1, availableAsGsp: true },
    { semesterId: 3, scheduleType: "evening", classCount: 1, availableAsGsp: false },
  ]);
  expect(record("NIE301").availableClassCount).toBe(2);
  expect(groups("NIE301", 14)).toHaveLength(2);
  expect(groups("NIE301", 14).some(isClassStartingInSemester)).toBe(false);
});

it("preserves archive/intake eligibility and undated starting classes", () => {
  expect(ids(manifest.semesters)).not.toContain(9);
  expect(manifest.scheduleBucketFiles["9"]).toBeUndefined();
  expect(record("ACC201")).toMatchObject({ availableClassCount: 1, availableAsGsp: false, scheduleTypes: ["evening"] });
  expect(ids(record("ACC201").offeredSemesters)).toEqual([1]);
  expect(ids(record("ACC201").scheduledSemesters!)).toEqual([15, 1]);
  expect(groups("ACC201", 1)[0].events).toEqual([]);
  expect(groups("ACC201", 15)).toHaveLength(1);
  expect(groups("ACC201", 15)[0].classId).toBe(6);
});

it("writes consistent index, detail and prerequisite summaries without changing academic rules", async () => {
  for (const course of index) {
    const detail = details.get(course.courseCode)!;
    expect(detail.offeredSemesters).toEqual(course.offeredSemesters);
    expect(detail.scheduledSemesters).toEqual(course.scheduledSemesters);
    expect(new Set(ids(course.offeredSemesters))).toEqual(new Set(course.offerings.map(offering => offering.semesterId)));
    expect(detail.requisites.coursesByCode[course.courseCode].offeredSemesters.map(term => term.semesterId))
      .toEqual([...ids(course.offeredSemesters)].reverse());
  }
  const ece = details.get("ECE499")!.requisites;
  expect(ece.coursesByCode.NIE499).toMatchObject({ availability: "catalogued", offeredSemesters: [] });
  expect(ece.prerequisiteVariants[0].rule).toMatchObject({ type: "course", courseCode: "NIE499" });
  const nie = details.get("NIE499")!.requisites;
  expect(nie.dependentCourses[0].courseCode).toBe("ECE499");
  expect(nie.coursesByCode.ECE499.offeredSemesters).toEqual([{ semesterId: 1, semesterName: "January 2026" }]);
  await expect(validateSnapshotArtifacts(path.join(root, "data/snapshots"))).resolves.toEqual({ formatVersion: 2, courses: 4 });
});
