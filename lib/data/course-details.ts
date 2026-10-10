import "server-only";

import { getCourseSnapshot } from "./course-snapshot-reader";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import { getSemesterById, getSemestersWithWeeks } from "./metadata";
import { filterEventsForSemester, isClassStartingInSemester } from "@/lib/timetable/semester-events";
import { getSemesterChoices } from "@/lib/timetable/semester-visibility";
import { buildPostrequisiteTree } from "./prerequisites/build-postrequisite-tree";
import { buildPrerequisiteTree } from "./prerequisites/build-prerequisite-tree";
import type { CourseRequisitesSnapshot } from "./prerequisites/types";

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

export async function getCourseDetailSnapshot(courseCode: string)
{
  return getCourseSnapshot(normalizeCourseCode(courseCode));
}

export async function getCoursePostrequisites(courseCode: string, requisites: CourseRequisitesSnapshot)
{
  return buildPostrequisiteTree(normalizeCourseCode(courseCode), requisites,
    async code => (await getCourseSnapshot(code))?.requisites ?? null);
}

export async function getCoursePrerequisites(courseCode: string, requisites: CourseRequisitesSnapshot)
{
  return buildPrerequisiteTree(normalizeCourseCode(courseCode), requisites,
    async code => (await getCourseSnapshot(code))?.requisites ?? null);
}

export async function getCourseByCode(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.course ?? null;
}

export async function getCourseOfferedSemesters(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.offeredSemesters ?? [];
}

export async function getCourseScheduledSemesters(courseCode: string)
{
  const snapshot = await getCourseSnapshot(normalizeCourseCode(courseCode));
  return snapshot?.scheduledSemesters ?? snapshot?.offeredSemesters ?? [];
}

export async function getAssessmentComponents(
  courseCode: string,
  scheduleType?: "daytime" | "evening",
)
{
  const assessments = (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.assessments ?? [];
  return scheduleType
    ? assessments.filter((assessment) => assessment.scheduleType === scheduleType)
    : assessments;
}

export async function getCourseClasses(
  courseCode: string,
  semesterId?: number,
  scheduleType?: "daytime" | "evening",
)
{
  const normalizedCourseCode = normalizeCourseCode(courseCode);
  const course = await getCourseSnapshot(normalizedCourseCode);
  if (!course)
  {
    return [];
  }

  const semesterIds = semesterId
    ? [semesterId]
    : course.offeredSemesters.map((semester) => semester.semesterId);
  const [snapshots, semesters] = await Promise.all([
    Promise.all(semesterIds.map((id) => getScheduleSnapshot(id, normalizedCourseCode))),
    getSemestersWithWeeks(),
  ]);
  const availableIntakeIds = new Set(getSemesterChoices(semesters).map(semester => semester.semesterId));

  return snapshots
    .flatMap((snapshot) => snapshot?.classes ?? [])
    .filter((item) => availableIntakeIds.has(item.semesterId)
      && (!semesterId || item.semesterId === semesterId) && (!scheduleType || item.scheduleType === scheduleType))
    .filter(isClassStartingInSemester)
    .map((item) => {
      const semester = semesters.find((entry) => entry.semesterId === item.semesterId);
      const ownEvents = item.events.filter(event => (event.startSemesterId ?? event.semesterId) === item.semesterId);
      return { ...item, events: semester ? filterEventsForSemester(ownEvents, semester, semester.weeks) : [] };
    })
    .sort((left, right) => (
      left.scheduleType.localeCompare(right.scheduleType)
      || left.groupCodeType.localeCompare(right.groupCodeType)
      || left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true })
    ));
}

export async function getClassCountsByCourseCodes(courseCodes: string[], semesterId: number)
{
  const normalizedCourseCodes = [...new Set(courseCodes.map(normalizeCourseCode))];
  const semester = await getSemesterById(semesterId);
  if (!semester || semester.hasIntakeSchedule === false)
  {
    return Object.fromEntries(normalizedCourseCodes.map(courseCode => [courseCode, 0]));
  }
  const schedules = await Promise.all(
    normalizedCourseCodes.map((courseCode) => getScheduleSnapshot(semesterId, courseCode)),
  );

  return Object.fromEntries(normalizedCourseCodes.map((courseCode, index) => [
    courseCode,
    schedules[index]?.classes.filter(isClassStartingInSemester).length ?? 0,
  ]));
}
