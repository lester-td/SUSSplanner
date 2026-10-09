import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseSnapshot, DataSnapshotManifest } from "./snapshot-types";
import type { CourseClassRecord, SharedClassIdentifier } from "@/lib/timetable/types";
import { buildTimetableBlocks } from "@/lib/timetable/timetable-utils";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import { annotateEventCohort } from "@/lib/timetable/schedule-cohorts";
import { filterTimetableForSemester } from "@/lib/timetable/semester-events";

vi.mock("server-only", () => ({}));
vi.mock("./metadata", () => ({
  getSemesterById: vi.fn(), getSemesterWeeks: vi.fn(), getSemesters: vi.fn(), getSemestersWithWeeks: vi.fn(),
}));
vi.mock("./schedule-snapshot-reader", () => ({ getScheduleSnapshot: vi.fn() }));
vi.mock("./course-snapshot-reader", () => ({ getCourseSnapshot: vi.fn() }));

import { getSemesterById, getSemesterWeeks, getSemesters, getSemestersWithWeeks } from "./metadata";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import { getCourseSnapshot } from "./course-snapshot-reader";
import { getTimetableDataFromClassIdentifiers } from "./timetable";
import { getCourseClasses } from "./course-details";

const semesters: DataSnapshotManifest["semesters"] = [
  { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: false, weeks: [] },
  { semesterId: 2, academicYear: "2025/2026", semesterNo: 3, semesterName: "May 2026", weeks: [] },
  { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026", weeks: [] },
  { semesterId: 14, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027", weeks: [] },
];
// Calendar weeks, including the actual September continuation week.
for (const semester of semesters.filter(item => item.semesterId !== 2))
{
  const firstMonday = semester.semesterId === 1 ? "2026-01-05" : semester.semesterId === 3 ? "2026-08-10" : "2027-01-04";
  semester.weeks = Array.from({ length: 10 }, (_, index) => {
    const start = new Date(`${firstMonday}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + index * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { semesterId: semester.semesterId, weekId: semester.semesterId * 100 + index + 1,
      weekNo: index + 1, weekType: "TEACHING" as const, label: `Week ${index + 1}`,
      startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  });
}
const course: CourseSnapshot = {
  requisites: { prerequisiteVariants: [], dependentCourses: [], coursesByCode: {}, sourcesByRuleKey: {} },
  course: {
    courseCode: "NIE301", courseName: "Learning", schoolName: null,
    isPostgraduate: false, courseLevel: "3", creditUnits: 5,
    presentationPattern: null, courseSynopsis: null, courseTopics: null,
    learningOutcomes: null, synopsisUrl: null,
  },
  assessments: [],
  offeredSemesters: semesters.filter((item) => item.semesterId !== 2),
};
function group(semesterId: number, groupCode: string, classId: number): CourseClassRecord
{
  const evening = groupCode.startsWith("CRN");
  return {
    classId, semesterId, courseCode: "NIE301", courseName: "Learning", schoolName: null,
    creditUnits: 5, presentationPattern: null, scheduleType: evening ? "evening" : "daytime",
    groupCodeType: evening ? "CRN" : "TG", groupCode, availableAsGsp: false,
    isRestricted: false, remarks: null,
    events: [{
      eventId: classId * 10, classId, semesterId, courseCode: "NIE301",
      scheduleType: evening ? "evening" : "daytime", groupCodeType: evening ? "CRN" : "TG", groupCode,
      eventKind: "CLASS", eventDate: semesterId === 1 ? "2026-01-05" : semesterId === 3 ? "2026-08-17" : "2027-01-04",
      dayOfWeek: 1, startTime: evening ? "19:00" : "09:00", endTime: evening ? "22:00" : "12:00",
      eventMode: "On campus", campus: "CLE", remarks: null,
      weekId: semesterId * 10, weekNo: 1, weekType: "TEACHING", weekLabel: "Week 1",
    }],
  };
}
const schedules = new Map([1, 3, 14].map((id) => [id,
  [group(id, "TG01", id * 100 + 1), group(id, "TG03", id * 100 + 3), group(id, "CRN01", id * 100 + 5)],
]));
for (const julyGroup of schedules.get(3)!)
{
  julyGroup.events.push({ ...julyGroup.events[0], eventId: julyGroup.classId * 10 + 1,
    eventDate: "2026-09-12", dayOfWeek: 6, startSemesterId: 1 });
}
const JANUARY: SharedClassIdentifier = {
  courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01", originSemesterId: 1,
};
const JULY: SharedClassIdentifier = {
  courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG03",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSemesters).mockResolvedValue(semesters);
  vi.mocked(getSemestersWithWeeks).mockResolvedValue(semesters);
  vi.mocked(getSemesterById).mockImplementation(async (id) => semesters.find((semester) => semester.semesterId === id) ?? null);
  vi.mocked(getSemesterWeeks).mockImplementation(async (id) => semesters.find((semester) => semester.semesterId === id)?.weeks ?? []);
  vi.mocked(getCourseSnapshot).mockResolvedValue(course);
  vi.mocked(getScheduleSnapshot).mockImplementation(async (id) => ({ semesterId: id, courseCode: "NIE301", classes: schedules.get(id) ?? [] }));
});

describe("timetable continuation schedule resolution", () => {
  it("provides all May cohort sessions for PDF exports from either May or July without borrowing a future run", async () => {
    const may = { semesterId: 20, academicYear: "2026/2027", semesterNo: 3 as const,
      semesterName: "May 2027", hasIntakeSchedule: true, weeks: [] };
    const july = { semesterId: 21, academicYear: "2027/2028", semesterNo: 1 as const,
      semesterName: "July 2027", hasIntakeSchedule: false, weeks: [] };
    const originGroup = { ...group(20, "CRN06", 2006), continuationSemesterIds: [21] };
    originGroup.events = [
      { ...originGroup.events[0], eventDate: "2027-05-14", startSemesterId: 20 },
      { ...originGroup.events[0], eventId: 20062, eventKind: "EXAM", eventDate: "2027-06-16", startSemesterId: 20 },
    ];
    const completion = { ...originGroup.events[0], semesterId: 21, eventId: 2106, eventDate: "2027-08-21" };
    const targetGroup = { ...originGroup, semesterId: 21, events: [completion,
      { ...completion, eventId: 2107 },
      { ...completion, eventId: 2108, startSemesterId: 21, eventDate: "2027-08-09" },
    ] };
    vi.mocked(getSemesters).mockResolvedValue([may, july]);
    vi.mocked(getSemesterById).mockImplementation(async id => id === 20 ? may : july);
    vi.mocked(getSemesterWeeks).mockResolvedValue([]);
    vi.mocked(getCourseSnapshot).mockResolvedValue({ ...course, offeredSemesters: [may], scheduledSemesters: [may, july] });
    vi.mocked(getScheduleSnapshot).mockImplementation(async id => ({ semesterId: id, courseCode: "NIE301",
      classes: [id === 20 ? originGroup : targetGroup] }));
    const selected: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN06" };
    const mayData = await getTimetableDataFromClassIdentifiers([selected], 20);
    expect(mayData.events.map(event => event.eventDate)).toEqual(["2027-05-14", "2027-06-16"]);
    expect(mayData.classSessionEvents?.map(event => event.eventDate)).toEqual(["2027-05-14", "2027-08-21"]);
    const julyData = await getTimetableDataFromClassIdentifiers([{ ...selected, originSemesterId: 20 }], 21);
    expect(julyData.events.map(event => event.eventDate)).toEqual(["2027-08-21"]);
    expect(julyData.classSessionEvents?.map(event => event.eventDate)).toEqual(["2027-05-14", "2027-08-21"]);
  });
  it("resolves continuations but rejects new enrolments when the target intake is unavailable", async () => {
    const unavailable = { ...semesters[2], hasIntakeSchedule: false };
    vi.mocked(getSemesterById).mockResolvedValue(unavailable);
    vi.mocked(getSemesters).mockResolvedValue(semesters.map(semester => semester.semesterId === 3 ? unavailable : semester));
    vi.mocked(getSemestersWithWeeks).mockResolvedValue([unavailable]);
    vi.mocked(getCourseSnapshot).mockResolvedValue({ ...course,
      offeredSemesters: course.offeredSemesters.filter(semester => semester.semesterId !== 3),
      scheduledSemesters: course.offeredSemesters,
    });
    const timetable = await getTimetableDataFromClassIdentifiers([JANUARY, JULY], 3);
    expect(timetable.selections.map(selection => selection.identifier)).toEqual([JANUARY]);
    expect(timetable.events.map(event => event.eventDate)).toEqual(["2026-09-12"]);
    expect(timetable.unresolvedSelections).toEqual([JULY]);
    expect(await getCourseClasses("NIE301", 3)).toEqual([]);
  });
  it("sanitizes stale API responses before displaying schedule cards and clashes", async () => {
    const data = await getTimetableDataFromClassIdentifiers([{ ...JANUARY, originSemesterId: undefined }], 1);
    const julyEvent = { ...data.events[0], eventDate: "2026-08-17", eventKind: "EXAM" as const };
    const mixed = {
      ...data,
      events: [...data.events, julyEvent],
      selections: data.selections.map((selection) => ({ ...selection, events: [...selection.events, julyEvent] })),
      clashes: [{ clashKey: "stale", eventDate: julyEvent.eventDate, startTime: "09:00", endTime: "12:00", events: [julyEvent] }],
    };
    expect(filterTimetableForSemester(mixed, semesters[0], semesters[0].weeks)).toEqual(data);
  });

  it.each([...Array.from({ length: 18 }, (_, index) => `TG${String(index + 1).padStart(2, "0")}`), "CRN01"])(
    "filters July sessions attached to a January %s class from the timetable and class picker",
    async (groupCode) => {
      const january = group(1, groupCode, 115);
      const july = group(3, groupCode, 315);
      // Imported schedules may attach both terms to one class and label every
      // event with that class's semester, including a stale week ID.
      january.events.push({ ...july.events[0], semesterId: 1, weekId: january.events[0].weekId });
      vi.mocked(getScheduleSnapshot).mockResolvedValue({ semesterId: 1, courseCode: "NIE301", classes: [january] });
      const selection = { courseCode: "NIE301", scheduleType: january.scheduleType, groupCodeType: january.groupCodeType, groupCode };
      const timetable = await getTimetableDataFromClassIdentifiers([selection], 1);
      expect(timetable.events.map((event) => event.eventDate)).toEqual(["2026-01-05"]);
      expect(timetable.selections[0].events.map((event) => event.eventDate)).toEqual(["2026-01-05"]);
      expect(timetable.clashes).toEqual([]);
      const picker = await getCourseClasses("NIE301", 1);
      expect(picker[0].events.map((event) => event.eventDate)).toEqual(["2026-01-05"]);
    },
  );

  it("uses only the originating cohort’s sessions for each selection in July", async () => {
    const timetable = await getTimetableDataFromClassIdentifiers([JANUARY, JULY], 3);
    expect(timetable.unresolvedSelections).toEqual([]);
    expect(timetable.selections).toHaveLength(2);
    const carried = timetable.selections.find((item) => item.identifier.originSemesterId === 1)!;
    const start = timetable.selections.find((item) => item.identifier.originSemesterId === undefined)!;
    expect(carried.groupCode).toBe("TG01");
    expect(start.groupCode).toBe("TG03");
    expect(carried.courseLabel).toBe("NIE301 (Jan '26)");
    expect(start.courseLabel).toBe("NIE301");
    expect(timetable.events.every((event) => event.semesterId === 3 && event.eventDate >= "2026-07-01")).toBe(true);
    expect(carried.events.map(event => event.eventDate)).toEqual(["2026-09-12"]);
    expect(start.events.map(event => event.eventDate)).toEqual(["2026-08-17"]);
    expect(carried.events.every((event) => event.groupCode === "TG01" && event.shareKey === buildSharedClassIdentifier(JANUARY))).toBe(true);
    expect(start.events.every((event) => event.groupCode === "TG03" && event.shareKey === buildSharedClassIdentifier(JULY))).toBe(true);
    expect(timetable.clashes).toEqual([]);
  });

  it("keeps block IDs and selection keys distinct even when the TG is reused", async () => {
    const timetable = await getTimetableDataFromClassIdentifiers([JANUARY, { ...JULY, groupCode: "TG01" }], 3);
    expect(timetable.selections).toHaveLength(2);
    expect(new Set(timetable.selections.map((item) => item.shareKey)).size).toBe(2);
    for (const week of ["all", ...timetable.events.map(event => event.weekId!)] as const)
    {
      const blocks = buildTimetableBlocks(timetable.events, week);
      expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length);
      expect(blocks).toHaveLength(week === "all" ? 2 : 1);
    }
    // Separate cohorts do not create fictitious overlapping sessions.
    expect(timetable.clashes).toEqual([]);
  });

  it("keeps the original selection without borrowing another cohort when its future sessions are missing", async () => {
    vi.mocked(getScheduleSnapshot).mockImplementation(async (id) => ({
      semesterId: id, courseCode: "NIE301",
      classes: (schedules.get(id) ?? []).filter((item) => id !== 3 || item.groupCode !== "TG01"),
    }));
    const timetable = await getTimetableDataFromClassIdentifiers([JANUARY, JULY], 3);
    expect(timetable.unresolvedSelections).toEqual([]);
    expect(timetable.selections.find(item => item.identifier.originSemesterId === 1)?.events).toEqual([]);
    expect(timetable.selections.find(item => item.identifier.originSemesterId === undefined)?.events).toHaveLength(1);
  });

  it("keeps evening CRN schedules separate from daytime TG schedules", async () => {
    const evening: SharedClassIdentifier = { ...JANUARY, scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01" };
    const timetable = await getTimetableDataFromClassIdentifiers([evening, JULY], 3);
    expect(timetable.unresolvedSelections).toEqual([]);
    const carried = timetable.selections.find((item) => item.identifier.originSemesterId === 1)!;
    expect(carried.events.map(event => event.eventDate)).toEqual(["2026-09-12"]);
    expect(carried.scheduleType).toBe("evening");
    expect(carried.groupCodeType).toBe("CRN");
    expect(carried.events.every((event) => event.groupCode === "CRN01" && event.scheduleType === "evening")).toBe(true);
  });

  it("resolves January TG16's September completion separately from July TG16 weeks 1–4, 6 and 9", async () => {
    const january = group(1, "TG16", 1422);
    january.events = ["2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29", "2026-02-05", "2026-03-12"].map((eventDate, index) => ({
      ...january.events[0], eventId: 14220 + index, eventDate, dayOfWeek: 4,
      startTime: "15:30:00", endTime: "18:30:00",
    }));
    const july = group(3, "TG16", 1423);
    july.events = ["2026-08-14", "2026-08-21", "2026-08-28", "2026-09-04", "2026-09-18", "2026-10-09"].map((eventDate, index) => ({
      ...july.events[0], eventId: 14230 + index, eventDate, dayOfWeek: 5,
      startTime: "12:00:00", endTime: "15:00:00",
    }));
    july.events.push({ ...july.events[0], eventId: 14236, eventDate: "2026-09-12", dayOfWeek: 6,
      startTime: "15:30:00", endTime: "18:30:00" });
    for (const item of [january, july]) item.events = item.events.map(event => annotateEventCohort(event, semesters));
    vi.mocked(getScheduleSnapshot).mockImplementation(async id => ({
      semesterId: id, courseCode: "NIE301", classes: id === 1 ? [january] : id === 3 ? [july] : [],
    }));
    const carriedIdentifier = { ...JANUARY, groupCode: "TG16" };
    const startIdentifier = { ...JULY, groupCode: "TG16" };
    const timetable = await getTimetableDataFromClassIdentifiers([carriedIdentifier, startIdentifier], 3);
    const carried = timetable.selections.find(item => item.identifier.originSemesterId === 1)!;
    const start = timetable.selections.find(item => item.identifier.originSemesterId === undefined)!;
    expect(carried.events.map(event => [event.eventDate, event.startTime, event.endTime, event.weekNo])).toEqual([
      ["2026-09-12", "15:30:00", "18:30:00", 5],
    ]);
    expect(start.events.map(event => event.weekNo)).toEqual([1, 2, 3, 4, 6, 9]);
    expect(timetable.clashes).toEqual([]);
    expect(filterTimetableForSemester(timetable, semesters[2], semesters[2].weeks)).toEqual(timetable);
    const januaryTimetable = await getTimetableDataFromClassIdentifiers([startIdentifier], 1);
    expect(januaryTimetable.events).toHaveLength(6);
    expect((await getCourseClasses("NIE301", 3))[0].events).toEqual(july.events.slice(0, 6));
    expect((await getCourseClasses("NIE301", 1))[0].events).toEqual(january.events);
  });

  it("still detects real clashes between cohorts when their own sessions overlap", async () => {
    const july = group(3, "TG03", 303);
    july.events[0].eventDate = "2026-09-12";
    vi.mocked(getScheduleSnapshot).mockImplementation(async id => ({ semesterId: id, courseCode: "NIE301",
      classes: id === 3 ? [schedules.get(3)![0], july] : schedules.get(id) ?? [] }));
    const timetable = await getTimetableDataFromClassIdentifiers([JANUARY, JULY], 3);
    expect(timetable.clashes).toHaveLength(1);
    expect(timetable.clashes[0].events.map(event => event.originSemesterId)).toEqual(expect.arrayContaining([1, undefined]));
  });

  it.each([...Array.from({ length: 18 }, (_, index) => `TG${String(index + 1).padStart(2, "0")}`), "CRN01"])(
    "separates %s continuation sessions from a new start using the same group", async groupCode => {
      const january = group(1, groupCode, 115);
      const july = group(3, groupCode, 315);
      july.events.push({ ...july.events[0], eventId: 3151, eventDate: "2026-09-12", startSemesterId: 1 });
      vi.mocked(getScheduleSnapshot).mockImplementation(async id => ({ semesterId: id, courseCode: "NIE301", classes: id === 1 ? [january] : [july] }));
      const selection = { courseCode: "NIE301", scheduleType: january.scheduleType, groupCodeType: january.groupCodeType, groupCode };
      const timetable = await getTimetableDataFromClassIdentifiers([{ ...selection, originSemesterId: 1 }, selection], 3);
      expect(timetable.selections.find(item => item.identifier.originSemesterId === 1)?.events.map(event => event.eventDate)).toEqual(["2026-09-12"]);
      expect(timetable.selections.find(item => item.identifier.originSemesterId === undefined)?.events.map(event => event.eventDate)).toEqual(["2026-08-17"]);
      expect((await getCourseClasses("NIE301", 3))[0].events.map(event => event.eventDate)).toEqual(["2026-08-17"]);
      expect(timetable.clashes).toEqual([]);
    },
  );

  it("does not expose a carry-only group as a new starting class", async () => {
    const carriedOnly = group(3, "TG16", 315);
    carriedOnly.events[0].startSemesterId = 1;
    vi.mocked(getScheduleSnapshot).mockResolvedValue({ semesterId: 3, courseCode: "NIE301", classes: [carriedOnly] });
    expect(await getCourseClasses("NIE301", 3)).toEqual([]);
    const selection = { ...JULY, groupCode: "TG16" };
    const timetable = await getTimetableDataFromClassIdentifiers([selection], 3);
    expect(timetable.unresolvedSelections).toEqual([selection]);
    expect(timetable.events).toEqual([]);
  });

  it("rejects same-semester or unrelated origin references", async () => {
    for (const originSemesterId of [3, 14])
    {
      const invalid = { ...JANUARY, originSemesterId };
      const timetable = await getTimetableDataFromClassIdentifiers([invalid], 3);
      expect(timetable.unresolvedSelections).toEqual([invalid]);
      expect(timetable.events).toEqual([]);
    }
  });
});


describe("archived timetable access", () => {
  it("does not resolve a direct archived timetable even when a saved selection exists", async () => {
    vi.mocked(getSemesterById).mockResolvedValue(null);
    const selected = { ...JANUARY, originSemesterId: undefined };
    const result = await getTimetableDataFromClassIdentifiers([selected], 1);
    expect(result.semester).toBeNull();
    expect(result.semesterWeeks).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.selections).toEqual([]);
    expect(result.unresolvedSelections).toEqual([selected]);
    expect(getScheduleSnapshot).not.toHaveBeenCalled();
  });

  it("restores active completion sessions without loading an archived origin", async () => {
    const active = semesters.filter(semester => semester.semesterId !== 1);
    vi.mocked(getSemesters).mockResolvedValue(active);
    vi.mocked(getSemestersWithWeeks).mockResolvedValue(active);
    const result = await getTimetableDataFromClassIdentifiers([JANUARY], 3);
    expect(result.unresolvedSelections).toEqual([]);
    expect(result.events.map(event => event.eventDate)).toEqual(["2026-09-12"]);
    expect(result.selections[0].semesterId).toBe(3);
    expect(result.selections[0].courseLabel).toBe("NIE301");
    expect(getScheduleSnapshot).not.toHaveBeenCalledWith(1, "NIE301");
  });
});
