import "server-only";

import { detectTimetableClashes } from "@/lib/timetable/clash-detection";
import { getExamAssessmentMode } from "@/lib/timetable/exam-status";
import { formatContinuationSemesterShort, getFollowingContinuationSemesters } from "@/lib/timetable/course-continuation";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import { filterEventsForSemester, isClassStartingInSemester } from "@/lib/timetable/semester-events";
import type {
  SharedClassIdentifier,
  TimetableData,
  TimetableEventRecord,
  TimetableSelectionRecord,
} from "@/lib/timetable/types";
import { getCourseSnapshot } from "./course-snapshot-reader";
import { getSemesterById, getSemesterWeeks, getSemesters } from "./metadata";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import type { ScheduleSnapshot } from "./snapshot-types";

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
  const [semester, semesterWeeks, semesters] = await Promise.all([
    getSemesterById(semesterId),
    getSemesterWeeks(semesterId),
    getSemesters(),
  ]);

  if (!semester || semester.isArchived || normalizedSelections.length === 0)
  {
    return {
      semester: semester?.isArchived ? null : semester,
      semesterWeeks: semester && !semester.isArchived ? semesterWeeks : [],
      selections: [],
      events: [],
      clashes: [],
      unresolvedSelections: normalizedSelections,
    } satisfies TimetableData;
  }

  const courseCodes = [...new Set(normalizedSelections.map((selection) => selection.courseCode))];
  const snapshotCache = new Map<string, Promise<ScheduleSnapshot | null>>();
  const readSchedule = (id: number, courseCode: string) => {
    const key = `${id}:${courseCode}`;
    if (!snapshotCache.has(key)) snapshotCache.set(key, getScheduleSnapshot(id, courseCode));
    return snapshotCache.get(key)!;
  };
  const [scheduleSnapshots, courseSnapshots] = await Promise.all([
    Promise.all(courseCodes.map((courseCode) => readSchedule(semesterId, courseCode))),
    Promise.all(courseCodes.map((courseCode) => getCourseSnapshot(courseCode))),
  ]);
  const scheduleByCourseCode = new Map(courseCodes.map((courseCode, index) => [courseCode, scheduleSnapshots[index]]));
  const courseByCourseCode = new Map(courseCodes.map((courseCode, index) => [courseCode, courseSnapshots[index]]));

  const resolvedSelections: TimetableSelectionRecord[] = [];
  const unresolvedSelections: SharedClassIdentifier[] = [];
  const events: TimetableEventRecord[] = [];
  const classSessionEvents: TimetableEventRecord[] = [];
  const activeSemesterIds = new Set(semesters.filter(item => !item.isArchived).map(item => item.semesterId));

  for (const selectedClass of normalizedSelections)
  {
    const originId = selectedClass.originSemesterId ?? semesterId;
    const originSemester = semesters.find((item) => item.semesterId === selectedClass.originSemesterId);
    const targetClass = scheduleByCourseCode.get(selectedClass.courseCode)?.classes.find((item) => (
      item.semesterId === semesterId
      && item.scheduleType === selectedClass.scheduleType
      && item.groupCodeType === selectedClass.groupCodeType
      && item.groupCode === selectedClass.groupCode
    ));
    let matchingClass = targetClass;
    if (selectedClass.originSemesterId !== undefined)
    {
      // An archived origin has no published schedule or semester metadata. Its
      // active completion sessions carry the ownership ID needed for restoration.
      const publishedContinuation = originId !== semesterId && targetClass?.events.some(event => event.startSemesterId === originId);
      const originSchedule = originSemester && !originSemester.isArchived
        ? await readSchedule(originId, selectedClass.courseCode) : null;
      matchingClass = originSchedule?.classes.find((item) => (
        item.semesterId === originId
        && item.scheduleType === selectedClass.scheduleType
        && item.groupCodeType === selectedClass.groupCodeType
        && item.groupCode === selectedClass.groupCode
      )) ?? (publishedContinuation ? targetClass : undefined);
      const validTarget = getFollowingContinuationSemesters({
        courseCode: selectedClass.courseCode,
        semesterId: originId,
        offeredSemesters: courseByCourseCode.get(selectedClass.courseCode)?.scheduledSemesters
          ?? courseByCourseCode.get(selectedClass.courseCode)?.offeredSemesters ?? [],
        semesters,
        continuationSemesterIds: matchingClass?.continuationSemesterIds,
      }).some((item) => item.semesterId === semesterId);
      if (originId === semesterId || (originSemester && !originSemester.isArchived ? !validTarget : !publishedContinuation))
      {
        unresolvedSelections.push(selectedClass);
        continue;
      }
    }

    if (!matchingClass || (selectedClass.originSemesterId === undefined
      && (semester.hasIntakeSchedule === false || !isClassStartingInSemester(matchingClass))))
    {
      unresolvedSelections.push(selectedClass);
      continue;
    }

    const shareKey = buildSharedClassIdentifier(selectedClass);
    const courseLabel = originSemester && !originSemester.isArchived
      ? `${selectedClass.courseCode} (${formatContinuationSemesterShort(originSemester.semesterName)})`
      : selectedClass.courseCode;
    const candidates = selectedClass.originSemesterId === undefined
      ? matchingClass.events
      : [...matchingClass.events, ...(targetClass?.events ?? [])];
    const ownEvents = candidates.filter((event) => (event.startSemesterId ?? event.semesterId) === originId);
    const scopedEvents = ownEvents.map((event) => {
      const week = semesterWeeks.find((item) => event.eventDate >= item.startDate && event.eventDate <= item.endDate);
      return {
        ...event,
        semesterId,
        startSemesterId: originId,
        weekId: week?.weekId ?? null,
        weekNo: week?.weekNo ?? null,
        weekType: week?.weekType ?? null,
        weekLabel: week?.label ?? null,
      };
    });
    const uniqueEvents = new Map(scopedEvents.map((event) => [
      [event.eventKind, event.eventDate, event.startTime, event.endTime].join("|"), event,
    ]));
    const classEvents = (semester ? filterEventsForSemester([...uniqueEvents.values()], semester, semesterWeeks) : [])
      .map((event) => ({
        ...event,
        courseName: matchingClass.courseName,
        schoolName: matchingClass.schoolName,
        shareKey,
        courseLabel,
        originSemesterId: selectedClass.originSemesterId,
      } satisfies TimetableEventRecord));
    const courseSnapshot = courseByCourseCode.get(selectedClass.courseCode);
    const sessionSemesterIds = new Set([
      originId, semesterId,
      ...(courseSnapshot?.scheduledSemesters ?? courseSnapshot?.offeredSemesters ?? []).map(item => item.semesterId),
      ...(matchingClass.continuationSemesterIds ?? []),
    ]);
    const sessionSnapshots = await Promise.all([...sessionSemesterIds]
      .filter(id => activeSemesterIds.has(id))
      .map(id => readSchedule(id, selectedClass.courseCode)));
    const sessionCandidates = [
      ...matchingClass.events,
      ...sessionSnapshots.flatMap(snapshot => snapshot?.classes
        .filter(group => group.scheduleType === selectedClass.scheduleType
          && group.groupCodeType === selectedClass.groupCodeType && group.groupCode === selectedClass.groupCode)
        .flatMap(group => group.events) ?? []),
    ].filter(event => event.eventKind !== "EXAM" && (event.startSemesterId ?? event.semesterId) === originId);
    const uniqueSessions = new Map(sessionCandidates.map(event => [
      [event.eventKind, event.eventDate, event.startTime, event.endTime].join("|"), event,
    ]));
    classSessionEvents.push(...[...uniqueSessions.values()].map(event => ({
      ...event,
      courseName: matchingClass.courseName,
      schoolName: matchingClass.schoolName,
      shareKey,
      courseLabel,
      originSemesterId: selectedClass.originSemesterId,
    })));
    const assessments = courseByCourseCode.get(selectedClass.courseCode)?.assessments.filter((assessment) => (
      assessment.scheduleType === selectedClass.scheduleType
    )) ?? [];
    const hasEca = assessments.some((assessment) => (
      [assessment.componentName, assessment.assessmentMode]
        .some((value) => value?.toLocaleLowerCase("en-SG").includes("eca"))
    ));
    const examAssessmentMode = getExamAssessmentMode(assessments);

    events.push(...classEvents);
    resolvedSelections.push({
      ...matchingClass,
      semesterId,
      events: classEvents,
      identifier: selectedClass,
      shareKey,
      hasEca,
      examAssessmentMode,
      courseLabel,
    });
  }

  events.sort((left, right) => (
    left.eventDate.localeCompare(right.eventDate)
    || left.startTime.localeCompare(right.startTime)
  ));
  classSessionEvents.sort((left, right) => left.eventDate.localeCompare(right.eventDate)
    || left.startTime.localeCompare(right.startTime) || left.courseCode.localeCompare(right.courseCode));

  return {
    semester,
    semesterWeeks,
    selections: resolvedSelections,
    events,
    classSessionEvents,
    clashes: detectTimetableClashes(events),
    unresolvedSelections,
  } satisfies TimetableData;
}
