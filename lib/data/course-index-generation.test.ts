import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { courses, semesters, classes, classEvents } from "../db/schema";
import { getDataSnapshotBucket, type CourseIndexSnapshotRecord, type ScheduleSnapshotBucket } from "./snapshot-types";
import { validateSnapshotArtifacts } from "./prerequisites/artifact-validation";
import { parseCourseSearchFilters } from "../timetable/course-search";

const database = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), end: vi.fn(async () => {}) }));
vi.mock("@next/env", () => ({ loadEnvConfig: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end: database.end })) }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () => ({ transaction: async (work: (db: unknown) => Promise<unknown>) => work({
    select: () => ({ from: (table: unknown) => Promise.resolve(database.rows.get(table) ?? []) }),
  }) }),
}));

it("generates starting counts and GSP availability without counting continuations, archived terms or unavailable intakes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "suss-course-index-generation-"));
  const lastUpdated = "2026-01-01T00:00:00Z";
  database.rows.set(courses, ["NIE301", "NIE351", "ACC201"].map(courseCode => ({
    courseCode, courseName: courseCode, courseLevel: "3", creditUnits: 5, lastUpdated,
  })));
  database.rows.set(semesters, [
    { semesterId: 9, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: true, hasIntakeSchedule: true },
    { semesterId: 1, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026", isArchived: false, hasIntakeSchedule: true },
    { semesterId: 2, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027", isArchived: false, hasIntakeSchedule: true },
    { semesterId: 3, academicYear: "2026/2027", semesterNo: 3, semesterName: "May 2027", isArchived: false, hasIntakeSchedule: false },
  ].map(semester => ({ ...semester, lastUpdated })));
  const groups = [
    { classId: 1, courseCode: "NIE301", semesterId: 1, scheduleType: "daytime", availableAsGsp: true },
    { classId: 2, courseCode: "NIE301", semesterId: 2, scheduleType: "daytime", availableAsGsp: false },
    { classId: 3, courseCode: "NIE351", semesterId: 1, scheduleType: "daytime", availableAsGsp: true },
    { classId: 4, courseCode: "ACC201", semesterId: 2, scheduleType: "evening", availableAsGsp: false },
    { classId: 5, courseCode: "ACC201", semesterId: 3, scheduleType: "daytime", availableAsGsp: true },
    { classId: 6, courseCode: "ACC201", semesterId: 9, scheduleType: "daytime", availableAsGsp: true },
  ];
  database.rows.set(classes, groups.map(group => ({ ...group, groupCodeType: "TG", groupCode: `FIXTURE${group.classId}`, lastUpdated })));
  database.rows.set(classEvents, [
    [1, "2026-08-15"], [1, "2027-02-13"], [2, "2027-02-20"], [3, "2027-02-27"],
    [4, "2027-03-06"], [5, "2027-05-15"], [6, "2026-02-14"],
  ].map(([classId, eventDate], index) => ({
    classId, eventDate, eventId: index + 1, eventKind: "CLASS", dayOfWeek: 6,
    startTime: "09:00:00", endTime: "12:00:00", lastUpdated,
  })));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("DATABASE_URL", "postgres://fixture:fixture@localhost/fixture");
  try
  {
    await import("../../scripts/build-data-snapshots");
    cwd.mockRestore();
    const snapshotRoot = path.join(root, "data/snapshots");
    await vi.waitFor(async () => { await readFile(path.join(snapshotRoot, "manifest.json")); });
    const index: CourseIndexSnapshotRecord[] = JSON.parse(await readFile(path.join(snapshotRoot, "course-index.json"), "utf8"));
    const nie301 = index.find(course => course.courseCode === "NIE301")!;
    expect(nie301.availableClassCount).toBe(2);
    expect(nie301.offerings).toEqual([
      { semesterId: 1, scheduleType: "daytime", classCount: 1, availableAsGsp: true },
      { semesterId: 2, scheduleType: "daytime", classCount: 1, availableAsGsp: false },
    ]);
    const shard: ScheduleSnapshotBucket = JSON.parse(await readFile(path.join(snapshotRoot, `schedules/2-${getDataSnapshotBucket("NIE301")}.json`), "utf8"));
    expect(shard.courses.NIE301).toHaveLength(2); // One start and one continuation.
    expect(index.find(course => course.courseCode === "NIE351")).toMatchObject({
      availableClassCount: 0, hasAvailableClasses: false, availableAsGsp: false, offerings: [],
      scheduledSemesters: [expect.objectContaining({ semesterId: 2 })],
    });
    expect(index.find(course => course.courseCode === "ACC201")).toMatchObject({
      availableClassCount: 1, availableAsGsp: false, scheduleTypes: ["evening"],
      offerings: [{ semesterId: 2, scheduleType: "evening", classCount: 1, availableAsGsp: false }],
    });
    await expect(validateSnapshotArtifacts(snapshotRoot)).resolves.toEqual({ formatVersion: 2, courses: 3 });
    const readerCwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    const { searchCourses, searchCalculatorCourses } = await import("./course-search");
    readerCwd.mockRestore();
    const january = await searchCourses(parseCourseSearchFilters(new URLSearchParams("q=NIE301&semesterIds=2")));
    expect(january).toHaveLength(1);
    expect(january[0].availableClassCount).toBe(1);
    for (const [courseCode, query] of [
      ["NIE351", "q=NIE351&semesterIds=2"],
      ["ACC201", "q=ACC201&semesterIds=3"],
      ["NIE301", "q=NIE301&semesterIds=2&availableAsGspOnly=1"],
    ])
      expect((await searchCourses(parseCourseSearchFilters(new URLSearchParams(query)))).find(course => course.courseCode === courseCode)).toBeUndefined();
    expect(await searchCalculatorCourses("NIE351")).toEqual([{ courseCode: "NIE351", courseName: "NIE351", creditUnits: 5 }]);
  }
  finally
  {
    cwd.mockRestore();
    vi.restoreAllMocks();
    log.mockRestore();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
