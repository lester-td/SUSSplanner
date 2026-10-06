import "server-only";

import { getCourseSnapshot } from "./course-snapshot-reader";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import { getSemestersWithWeeks } from "./metadata";
import { filterEventsForSemester, isClassStartingInSemester } from "@/lib/timetable/semester-events";

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

export async function getCourseByCode(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.course ?? null;
}

export async function getCourseOfferedSemesters(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.offeredSemesters ?? [];
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

  return snapshots
    .flatMap((snapshot) => snapshot?.classes ?? [])
    .filter((item) => (!semesterId || item.semesterId === semesterId) && (!scheduleType || item.scheduleType === scheduleType))
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
  const schedules = await Promise.all(
    normalizedCourseCodes.map((courseCode) => getScheduleSnapshot(semesterId, courseCode)),
  );

  return Object.fromEntries(normalizedCourseCodes.map((courseCode, index) => [
    courseCode,
    schedules[index]?.classes.filter(isClassStartingInSemester).length ?? 0,
  ]));
}
