import "server-only";

import { detectTimetableClashes } from "@/lib/timetable/clash-detection";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import type {
  SharedClassIdentifier,
  TimetableData,
  TimetableEventRecord,
  TimetableSelectionRecord,
} from "@/lib/timetable/types";
import { getCourseSnapshot } from "./course-snapshot-reader";
import { getSemesterById, getSemesterWeeks } from "./metadata";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

function normalizeSelections(selectedClasses: SharedClassIdentifier[])
{
  const uniqueByKey = new Map(
    selectedClasses.map((selection) => [buildSharedClassIdentifier(selection), {
      ...selection,
      courseCode: normalizeCourseCode(selection.courseCode),
    }]),
  );
  return [...uniqueByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, selection]) => selection);
}

export async function getTimetableDataFromClassIdentifiers(
  selectedClasses: SharedClassIdentifier[],
  semesterId: number,
)
{
  const normalizedSelections = normalizeSelections(selectedClasses);
  const [semester, semesterWeeks] = await Promise.all([
    getSemesterById(semesterId),
    getSemesterWeeks(semesterId),
  ]);

  if (normalizedSelections.length === 0)
  {
    return {
      semester,
      semesterWeeks,
      selections: [],
      events: [],
      clashes: [],
      unresolvedSelections: [],
    } satisfies TimetableData;
  }

  const courseCodes = [...new Set(normalizedSelections.map((selection) => selection.courseCode))];
  const [scheduleSnapshots, courseSnapshots] = await Promise.all([
    Promise.all(courseCodes.map((courseCode) => getScheduleSnapshot(semesterId, courseCode))),
    Promise.all(courseCodes.map((courseCode) => getCourseSnapshot(courseCode))),
  ]);
  const scheduleByCourseCode = new Map(courseCodes.map((courseCode, index) => [courseCode, scheduleSnapshots[index]]));
  const courseByCourseCode = new Map(courseCodes.map((courseCode, index) => [courseCode, courseSnapshots[index]]));

  const resolvedSelections: TimetableSelectionRecord[] = [];
  const unresolvedSelections: SharedClassIdentifier[] = [];
  const events: TimetableEventRecord[] = [];

  for (const selectedClass of normalizedSelections)
  {
    const matchingClass = scheduleByCourseCode.get(selectedClass.courseCode)?.classes.find((item) => (
      item.scheduleType === selectedClass.scheduleType
      && item.groupCodeType === selectedClass.groupCodeType
      && item.groupCode === selectedClass.groupCode
    ));

    if (!matchingClass)
    {
      unresolvedSelections.push(selectedClass);
      continue;
    }

    const shareKey = buildSharedClassIdentifier(selectedClass);
    const classEvents = matchingClass.events.map((event) => ({
      ...event,
      courseName: matchingClass.courseName,
      schoolName: matchingClass.schoolName,
      shareKey,
    } satisfies TimetableEventRecord));
    const hasEca = courseByCourseCode.get(selectedClass.courseCode)?.assessments.some((assessment) => (
      assessment.scheduleType === selectedClass.scheduleType
      && [assessment.componentName, assessment.assessmentMode]
        .some((value) => value?.toLocaleLowerCase("en-SG").includes("eca"))
    )) ?? false;

    events.push(...classEvents);
    resolvedSelections.push({
      ...matchingClass,
      events: classEvents,
      identifier: selectedClass,
      shareKey,
      hasEca,
    });
  }

  events.sort((left, right) => (
    left.eventDate.localeCompare(right.eventDate)
    || left.startTime.localeCompare(right.startTime)
  ));

  return {
    semester,
    semesterWeeks,
    selections: resolvedSelections,
    events,
    clashes: detectTimetableClashes(events),
    unresolvedSelections,
  } satisfies TimetableData;
}
