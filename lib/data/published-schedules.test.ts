import { describe, expect, it } from "vitest";
import { getPublishedScheduleClasses } from "./published-schedules";
import type { CourseClassRecord } from "../timetable/types";
import { isClassStartingInSemester } from "../timetable/semester-events";

const semesters = [
  { semesterId: 1, academicYear: "2026/2027", semesterNo: 3 as const, semesterName: "May 2027", isArchived: true, weeks: [] },
  { semesterId: 2, academicYear: "2027/2028", semesterNo: 1 as const, semesterName: "July 2027", weeks: [
    { semesterId: 2, weekId: 20, weekNo: 1, weekType: "TEACHING" as const, label: "Week 1", startDate: "2027-08-16", endDate: "2027-08-22" },
  ] },
];
const group: CourseClassRecord = {
  classId: 10, courseCode: "NIE351", semesterId: 1, scheduleType: "daytime",
  groupCodeType: "TG", groupCode: "TG01", availableAsGsp: false, isRestricted: false,
  language: "ENGLISH", remarks: null, courseName: "Learning", schoolName: null,
  creditUnits: 5, presentationPattern: null,
  events: ["2027-05-07", "2027-08-21"].map((eventDate, index) => ({
    eventId: index + 1, classId: 10, courseCode: "NIE351", semesterId: 1, startSemesterId: 1,
    scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01", eventDate,
    eventKind: "CLASS", dayOfWeek: 6, startTime: "09:00", endTime: "12:00",
    eventMode: null, campus: "CLE", remarks: null,
    weekId: null, weekNo: null, weekType: null, weekLabel: null,
  })),
};

describe("published schedule projection", () => {
  it("keeps January sessions in May/June in January instead of duplicating them in May", () => {
    const terms = [
      { semesterId: 10, academicYear: "2026/2027", semesterNo: 2 as const, semesterName: "January 2027", weeks: [] },
      ...semesters.map(semester => ({ ...semester, isArchived: false })),
    ];
    const january = { ...group, semesterId: 10, events: ["2027-05-07", "2027-06-12", "2027-07-17", "2027-08-21"].map((eventDate, index) => ({
      ...group.events[0], eventId: index + 1, semesterId: 10, startSemesterId: 10, eventDate,
    })) };
    const result = getPublishedScheduleClasses([january], terms);
    expect(result.map(item => item.semesterId)).toEqual([10, 2]);
    expect(result[0].events.map(event => event.eventDate)).toEqual(["2027-05-07", "2027-06-12"]);
    expect(result[1].events.map(event => event.eventDate)).toEqual(["2027-07-17", "2027-08-21"]);
    expect(result[0].continuationSemesterIds).toEqual([2]);
  });

  it("keeps May ownership while publishing only its August completion in July", () => {
    const active = semesters.map(semester => ({ ...semester, isArchived: false }));
    const result = getPublishedScheduleClasses([group], active);
    const may = result.find(item => item.semesterId === 1)!;
    const july = result.find(item => item.semesterId === 2)!;
    expect(may.events.map(event => event.eventDate)).toEqual(["2027-05-07"]);
    expect(july.events.map(event => event.eventDate)).toEqual(["2027-08-21"]);
    expect(july.events[0].startSemesterId).toBe(1);
    expect(isClassStartingInSemester(may)).toBe(true);
    expect(isClassStartingInSemester(july)).toBe(false);
    expect(may.continuationSemesterIds).toEqual([2]);
  });

  it("publishes November/December pre-term sessions with January, not the preceding July", () => {
    const terms = [
      { semesterId: 10, academicYear: "2026/2027", semesterNo: 1 as const, semesterName: "July 2026", weeks: [] },
      { semesterId: 11, academicYear: "2026/2027", semesterNo: 2 as const, semesterName: "January 2027", weeks: [] },
    ];
    const preTerm: CourseClassRecord = { ...group, semesterId: 11, events: [
      { ...group.events[0], semesterId: 11, startSemesterId: 11, eventDate: "2026-11-23" },
      { ...group.events[0], eventId: 3, semesterId: 11, startSemesterId: 11, eventDate: "2026-12-21" },
    ] };
    const result = getPublishedScheduleClasses([preTerm], terms);
    expect(result).toHaveLength(1);
    expect(result[0].semesterId).toBe(11);
    expect(result[0].events.map(event => [event.eventDate, event.isPreTerm])).toEqual([
      ["2026-11-23", true], ["2026-12-21", true],
    ]);
  });

  it("omits archived schedules and keeps only completion sessions in active terms", () => {
    const [published] = getPublishedScheduleClasses([group], semesters);
    expect(published.semesterId).toBe(2);
    expect(published.events.map(event => event.eventDate)).toEqual(["2027-08-21"]);
    expect(published.events[0]).toMatchObject({ semesterId: 2, startSemesterId: 1, weekId: 20 });
    expect(isClassStartingInSemester(published)).toBe(false);
    expect(group.events).toHaveLength(2);
  });

  it("publishes no classes when all semesters are archived", () => {
    expect(getPublishedScheduleClasses([group], semesters.map(semester => ({ ...semester, isArchived: true })))).toEqual([]);
  });

  it("does not publish archived-only classes or sessions", () => {
    expect(getPublishedScheduleClasses([{ ...group, events: [group.events[0]] }], semesters)).toEqual([]);
    expect(getPublishedScheduleClasses([{ ...group, events: [] }], semesters)).toEqual([]);
  });

  it("retains new starting classes without dated events in active terms", () => {
    const [published] = getPublishedScheduleClasses([{ ...group, semesterId: 2, events: [] }], semesters);
    expect(isClassStartingInSemester(published)).toBe(true);
  });

  it("merges completion and new-start sessions sharing a TG, preferring active metadata", () => {
    const active: CourseClassRecord = { ...group, classId: 11, semesterId: 2, language: "CHINESE", events: [
      { ...group.events[1], eventId: 3, classId: 11, semesterId: 2, startSemesterId: 2 },
    ] };
    for (const groups of [[active, group], [group, active]]) {
      const result = getPublishedScheduleClasses(groups, semesters);
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe("CHINESE");
      expect(result[0].events.map(event => event.startSemesterId).sort()).toEqual([1, 2]);
      expect(isClassStartingInSemester(result[0])).toBe(true);
    }
  });
});
