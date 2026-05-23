import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import type { CourseSearchFilters } from "@/lib/timetable/course-search";
import { detectTimetableClashes } from "@/lib/timetable/clash-detection";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import type {
  AssessmentComponentRecord,
  ClassEventRecord,
  ClassEventWithWeekRecord,
  CourseClassRecord,
  CourseRecord,
  CourseSearchResult,
  SemesterRecord,
  SemesterWeekRecord,
  SharedClassIdentifier,
  TimetableData,
  TimetableEventRecord,
  TimetableSelectionRecord,
} from "@/lib/timetable/types";
import { db } from "./index";
import {
  assessmentComponents,
  classes,
  classEvents,
  courses,
  semesters,
  semesterWeeks,
  vClassEventsWithWeek,
} from "./schema";

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

function mapSemesterRow(row: typeof semesters.$inferSelect): SemesterRecord
{
  return {
    semesterId: row.semesterId,
    academicYear: row.academicYear,
    semesterNo: row.semesterNo as 1 | 2 | 3,
    semesterName: row.semesterName,
  };
}

function mapSemesterWeekRow(row: typeof semesterWeeks.$inferSelect): SemesterWeekRecord
{
  return {
    weekId: row.weekId,
    semesterId: row.semesterId,
    weekNo: row.weekNo,
    weekType: row.weekType as SemesterWeekRecord["weekType"],
    label: row.label,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

function mapCourseRow(row: typeof courses.$inferSelect): CourseRecord
{
  return {
    courseCode: row.courseCode,
    courseName: row.courseName,
    schoolName: row.schoolName,
    isPostgraduate: row.isPostgraduate,
    courseLevel: row.courseLevel,
    creditUnits: row.creditUnits,
    presentationPattern: row.presentationPattern,
    courseSynopsis: row.courseSynopsis,
    courseTopics: row.courseTopics,
    learningOutcomes: row.learningOutcomes,
    synopsisUrl: row.synopsisUrl,
  };
}

function mapClassEventRow(row: typeof classEvents.$inferSelect): ClassEventRecord
{
  return {
    eventId: row.eventId,
    classId: row.classId,
    eventKind: row.eventKind as ClassEventRecord["eventKind"],
    eventDate: row.eventDate,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    eventMode: row.eventMode,
    venue: row.venue,
    remarks: row.remarks,
  };
}

function mapClassEventWithWeekRow(
  row: typeof vClassEventsWithWeek.$inferSelect,
): ClassEventWithWeekRecord
{
  if (
    row.eventId === null
    || row.classId === null
    || row.courseCode === null
    || row.semesterId === null
    || row.scheduleType === null
    || row.groupCodeType === null
    || row.groupCode === null
    || row.eventKind === null
    || row.eventDate === null
    || row.dayOfWeek === null
    || row.startTime === null
    || row.endTime === null
  )
  {
    throw new Error("View row from v_class_events_with_week is missing required fields.");
  }

  return {
    eventId: row.eventId,
    classId: row.classId,
    courseCode: row.courseCode,
    semesterId: row.semesterId,
    scheduleType: row.scheduleType as ClassEventWithWeekRecord["scheduleType"],
    groupCodeType: row.groupCodeType as ClassEventWithWeekRecord["groupCodeType"],
    groupCode: row.groupCode,
    eventKind: row.eventKind as ClassEventWithWeekRecord["eventKind"],
    eventDate: row.eventDate,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    eventMode: row.eventMode,
    venue: row.venue,
    remarks: row.remarks,
    weekId: row.weekId,
    weekNo: row.weekNo,
    weekType: row.weekType as ClassEventWithWeekRecord["weekType"],
    weekLabel: row.weekLabel,
  };
}

export async function getSemesters()
{
  const rows = await db
    .select()
    .from(semesters)
    .orderBy(asc(semesters.academicYear), asc(semesters.semesterNo), asc(semesters.semesterId));

  return rows.map(mapSemesterRow);
}

export async function getSemesterWeeks(semesterId?: number)
{
  const rows = semesterId
    ? await db
        .select()
        .from(semesterWeeks)
        .where(eq(semesterWeeks.semesterId, semesterId))
        .orderBy(asc(semesterWeeks.startDate), asc(semesterWeeks.weekId))
    : await db
        .select()
        .from(semesterWeeks)
        .orderBy(asc(semesterWeeks.startDate), asc(semesterWeeks.weekId));

  return rows.map(mapSemesterWeekRow);
}

export async function getSemestersWithWeeks()
{
  const [semesterRows, weekRows] = await Promise.all([
    getSemesters(),
    getSemesterWeeks(),
  ]);

  return semesterRows.map((semester) => ({
    ...semester,
    weeks: weekRows.filter((week) => week.semesterId === semester.semesterId),
  }));
}

export async function getSemestersWithClassesAndWeeks()
{
  const [semesterRows, weekRows] = await Promise.all([
    db
      .selectDistinct({
        semesterId: semesters.semesterId,
        academicYear: semesters.academicYear,
        semesterNo: semesters.semesterNo,
        semesterName: semesters.semesterName,
      })
      .from(semesters)
      .innerJoin(classes, eq(classes.semesterId, semesters.semesterId))
      .orderBy(asc(semesters.academicYear), asc(semesters.semesterNo), asc(semesters.semesterId)),
    getSemesterWeeks(),
  ]);

  return semesterRows
    .map((semester) => ({
      semesterId: semester.semesterId,
      academicYear: semester.academicYear,
      semesterNo: semester.semesterNo as 1 | 2 | 3,
      semesterName: semester.semesterName,
      weeks: weekRows.filter((week) => week.semesterId === semester.semesterId),
    }))
    .filter((semester) => semester.weeks.length > 0);
}

export async function getSemesterById(semesterId: number)
{
  const [row] = await db
    .select()
    .from(semesters)
    .where(eq(semesters.semesterId, semesterId))
    .limit(1);

  return row ? mapSemesterRow(row) : null;
}

async function getOfferedSemestersForCourseCodes(courseCodes: string[])
{
  const normalizedCourseCodes = unique(courseCodes.map(normalizeCourseCode));

  if (normalizedCourseCodes.length === 0)
  {
    return new Map<string, SemesterRecord[]>();
  }

  const rows = await db
    .selectDistinct({
      courseCode: classes.courseCode,
      semesterId: semesters.semesterId,
      academicYear: semesters.academicYear,
      semesterNo: semesters.semesterNo,
      semesterName: semesters.semesterName,
    })
    .from(classes)
    .innerJoin(semesters, eq(classes.semesterId, semesters.semesterId))
    .where(inArray(classes.courseCode, normalizedCourseCodes))
    .orderBy(asc(classes.courseCode), desc(semesters.academicYear), desc(semesters.semesterNo), desc(semesters.semesterId));

  const semestersByCourseCode = new Map<string, SemesterRecord[]>();

  for (const row of rows)
  {
    const mappedSemester = mapSemesterRow({
      semesterId: row.semesterId,
      academicYear: row.academicYear,
      semesterNo: row.semesterNo,
      semesterName: row.semesterName,
      lastUpdated: new Date(0),
    });
    const existing = semestersByCourseCode.get(row.courseCode);

    if (existing)
    {
      existing.push(mappedSemester);
    }
    else
    {
      semestersByCourseCode.set(row.courseCode, [mappedSemester]);
    }
  }

  return semestersByCourseCode;
}

function unique<T>(values: T[])
{
  return [...new Set(values)];
}

export async function searchCourses({
  q,
  semesterIds,
  scheduleTypes,
  postgraduateOnly,
  availableAsGspOnly,
  writtenExamOnly,
  ecaOnly,
  schoolNames,
  courseLevels,
  limit,
}: CourseSearchFilters)
{
  const searchTerm = q.trim();
  const predicates = [];
  const classFilterPredicates = [eq(classes.courseCode, courses.courseCode)];
  const hasClassFilters = semesterIds.length > 0 || scheduleTypes.length > 0 || availableAsGspOnly;

  if (searchTerm)
  {
    predicates.push(
      or(
        ilike(courses.courseCode, `%${searchTerm.toUpperCase()}%`),
        ilike(courses.courseName, `%${searchTerm}%`),
        ilike(courses.schoolName, `%${searchTerm}%`),
        ilike(courses.courseSynopsis, `%${searchTerm}%`),
      ),
    );
  }

  if (postgraduateOnly)
  {
    predicates.push(eq(courses.isPostgraduate, true));
  }

  if (schoolNames.length > 0)
  {
    predicates.push(inArray(courses.schoolName, schoolNames));
  }

  if (courseLevels.length > 0)
  {
    predicates.push(inArray(courses.courseLevel, courseLevels));
  }

  if (writtenExamOnly)
  {
    predicates.push(exists(
      db
        .select({ one: sql<number>`1` })
        .from(assessmentComponents)
        .where(and(
          eq(assessmentComponents.courseCode, courses.courseCode),
          or(
            ilike(assessmentComponents.componentName, "%written%"),
            ilike(assessmentComponents.assessmentMode, "%written%"),
          ),
        )),
    ));
  }

  if (ecaOnly)
  {
    predicates.push(exists(
      db
        .select({ one: sql<number>`1` })
        .from(assessmentComponents)
        .where(and(
          eq(assessmentComponents.courseCode, courses.courseCode),
          or(
            ilike(assessmentComponents.componentName, "%eca%"),
            ilike(assessmentComponents.assessmentMode, "%eca%"),
          ),
        )),
    ));
  }

  if (semesterIds.length > 0)
  {
    classFilterPredicates.push(inArray(classes.semesterId, semesterIds));
  }
  if (scheduleTypes.length > 0)
  {
    classFilterPredicates.push(inArray(classes.scheduleType, scheduleTypes));
  }
  if (availableAsGspOnly)
  {
    classFilterPredicates.push(eq(classes.availableAsGsp, true));
  }

  const selectShape = {
    courseCode: courses.courseCode,
    courseName: courses.courseName,
    schoolName: courses.schoolName,
    isPostgraduate: courses.isPostgraduate,
    courseLevel: courses.courseLevel,
    creditUnits: courses.creditUnits,
    presentationPattern: courses.presentationPattern,
    courseSynopsis: courses.courseSynopsis,
    availableClassCount: sql<number>`count(distinct ${classes.classId})::int`,
  };

  const searchRanking = searchTerm
    ? sql<number>`case
      when upper(${courses.courseCode}) = upper(${searchTerm}) then 0
      when upper(${courses.courseCode}) like upper(${`${searchTerm}%`}) then 1
      when upper(${courses.courseCode}) like upper(${`%${searchTerm}%`}) then 2
      when ${courses.courseName} ilike ${`${searchTerm}%`} then 3
      when ${courses.courseName} ilike ${`%${searchTerm}%`} then 4
      when ${courses.schoolName} ilike ${`${searchTerm}%`} then 5
      when ${courses.schoolName} ilike ${`%${searchTerm}%`} then 6
      when ${courses.courseSynopsis} ilike ${`${searchTerm}%`} then 7
      when ${courses.courseSynopsis} ilike ${`%${searchTerm}%`} then 8
      else 9
    end`
    : sql<number>`9`;

  const rows = hasClassFilters
    ? await db
        .select(selectShape)
        .from(courses)
        .innerJoin(classes, and(...classFilterPredicates))
        .where(predicates.length > 0 ? and(...predicates) : undefined)
        .groupBy(
          courses.courseCode,
          courses.courseName,
          courses.schoolName,
          courses.isPostgraduate,
          courses.courseLevel,
          courses.creditUnits,
          courses.presentationPattern,
          courses.courseSynopsis,
        )
        .orderBy(asc(searchRanking), asc(courses.courseCode))
        .limit(limit)
    : await db
        .select(selectShape)
        .from(courses)
        .leftJoin(classes, eq(classes.courseCode, courses.courseCode))
        .where(predicates.length > 0 ? and(...predicates) : undefined)
        .groupBy(
          courses.courseCode,
          courses.courseName,
          courses.schoolName,
          courses.isPostgraduate,
          courses.courseLevel,
          courses.creditUnits,
          courses.presentationPattern,
          courses.courseSynopsis,
        )
        .orderBy(asc(searchRanking), asc(courses.courseCode))
        .limit(limit);

  const offeredSemestersByCourseCode = await getOfferedSemestersForCourseCodes(
    rows.map((row) => row.courseCode),
  );

  return rows.map((row) => ({
    courseCode: row.courseCode,
    courseName: row.courseName,
    schoolName: row.schoolName,
    isPostgraduate: row.isPostgraduate,
    courseLevel: row.courseLevel,
    creditUnits: row.creditUnits,
    presentationPattern: row.presentationPattern,
    courseSynopsis: row.courseSynopsis,
    hasAvailableClasses: row.availableClassCount > 0,
    availableClassCount: row.availableClassCount,
    offeredSemesters: offeredSemestersByCourseCode.get(row.courseCode) ?? [],
  } satisfies CourseSearchResult));
}

export async function getCourseOfferedSemesters(courseCode: string)
{
  return (await getOfferedSemestersForCourseCodes([courseCode])).get(normalizeCourseCode(courseCode)) ?? [];
}

export async function getCourseByCode(courseCode: string)
{
  const [row] = await db
    .select()
    .from(courses)
    .where(eq(courses.courseCode, normalizeCourseCode(courseCode)))
    .limit(1);

  return row ? mapCourseRow(row) : null;
}

export async function getCourseClasses(
  courseCode: string,
  semesterId?: number,
  scheduleType?: "daytime" | "evening",
)
{
  const predicates = [eq(classes.courseCode, normalizeCourseCode(courseCode))];
  if (semesterId)
  {
    predicates.push(eq(classes.semesterId, semesterId));
  }
  if (scheduleType)
  {
    predicates.push(eq(classes.scheduleType, scheduleType));
  }

  const classRows = await db
    .select({
      classId: classes.classId,
      courseCode: classes.courseCode,
      semesterId: classes.semesterId,
      scheduleType: classes.scheduleType,
      groupCodeType: classes.groupCodeType,
      groupCode: classes.groupCode,
      availableAsGsp: classes.availableAsGsp,
      isRestricted: classes.isRestricted,
      remarks: classes.remarks,
      courseName: courses.courseName,
      schoolName: courses.schoolName,
      creditUnits: courses.creditUnits,
      presentationPattern: courses.presentationPattern,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseCode, courses.courseCode))
    .where(and(...predicates))
    .orderBy(asc(classes.scheduleType), asc(classes.groupCodeType), asc(classes.groupCode));

  if (classRows.length === 0)
  {
    return [] as CourseClassRecord[];
  }

  const classIds = classRows.map((row) => row.classId);
  const eventRows = await db
    .select()
    .from(vClassEventsWithWeek)
    .where(inArray(vClassEventsWithWeek.classId, classIds))
    .orderBy(asc(vClassEventsWithWeek.eventDate), asc(vClassEventsWithWeek.startTime));

  const eventsByClassId = new Map<number, ClassEventWithWeekRecord[]>();
  for (const row of eventRows)
  {
    const event = mapClassEventWithWeekRow(row);
    const existing = eventsByClassId.get(event.classId);
    if (existing)
    {
      existing.push(event);
    }
    else
    {
      eventsByClassId.set(event.classId, [event]);
    }
  }

  return classRows.map((row) => ({
    classId: row.classId,
    courseCode: row.courseCode,
    semesterId: row.semesterId,
    scheduleType: row.scheduleType as CourseClassRecord["scheduleType"],
    groupCodeType: row.groupCodeType as CourseClassRecord["groupCodeType"],
    groupCode: row.groupCode,
    availableAsGsp: row.availableAsGsp,
    isRestricted: row.isRestricted,
    remarks: row.remarks,
    courseName: row.courseName,
    schoolName: row.schoolName,
    creditUnits: row.creditUnits,
    presentationPattern: row.presentationPattern,
    events: eventsByClassId.get(row.classId) ?? [],
  } satisfies CourseClassRecord));
}

export async function getClassCountsByCourseCodes(
  courseCodes: string[],
  semesterId: number,
)
{
  const normalizedCourseCodes = unique(courseCodes.map(normalizeCourseCode));
  if (normalizedCourseCodes.length === 0)
  {
    return {} as Record<string, number>;
  }

  const rows = await db
    .select({
      courseCode: classes.courseCode,
      count: sql<number>`count(*)::int`,
    })
    .from(classes)
    .where(and(
      inArray(classes.courseCode, normalizedCourseCodes),
      eq(classes.semesterId, semesterId),
    ))
    .groupBy(classes.courseCode);

  return Object.fromEntries(rows.map((row) => [row.courseCode, row.count]));
}

export async function getClassEvents(classId: number)
{
  const rows = await db
    .select()
    .from(classEvents)
    .where(eq(classEvents.classId, classId))
    .orderBy(asc(classEvents.eventDate), asc(classEvents.startTime));

  return rows.map(mapClassEventRow);
}

export async function getClassEventsWithWeek(classId: number)
{
  const rows = await db
    .select()
    .from(vClassEventsWithWeek)
    .where(eq(vClassEventsWithWeek.classId, classId))
    .orderBy(asc(vClassEventsWithWeek.eventDate), asc(vClassEventsWithWeek.startTime));

  return rows.map(mapClassEventWithWeekRow);
}

export async function getAssessmentComponents(
  courseCode: string,
  scheduleType?: "daytime" | "evening",
)
{
  const predicates = [eq(assessmentComponents.courseCode, normalizeCourseCode(courseCode))];
  if (scheduleType)
  {
    predicates.push(eq(assessmentComponents.scheduleType, scheduleType));
  }

  const rows = await db
    .select()
    .from(assessmentComponents)
    .where(and(...predicates))
    .orderBy(asc(assessmentComponents.scheduleType), asc(assessmentComponents.sortOrder));

  return rows.map((row) => ({
    componentId: row.componentId,
    courseCode: row.courseCode,
    scheduleType: row.scheduleType as AssessmentComponentRecord["scheduleType"],
    componentName: row.componentName,
    componentGroup: row.componentGroup as AssessmentComponentRecord["componentGroup"],
    assessmentMode: row.assessmentMode,
    weightPercentage: row.weightPercentage,
    sortOrder: Number(row.sortOrder),
  } satisfies AssessmentComponentRecord));
}

export async function getCoursesWithAvailableClasses(
  semesterId: number,
  scheduleType?: "daytime" | "evening",
)
{
  return searchCourses({
    q: "",
    semesterIds: [semesterId],
    scheduleTypes: scheduleType ? [scheduleType] : [],
    postgraduateOnly: false,
    availableAsGspOnly: false,
    writtenExamOnly: false,
    ecaOnly: false,
    schoolNames: [],
    courseLevels: [],
    limit: 200,
  });
}

export async function getCourseSearchFacets()
{
  const schoolRows = await db
    .selectDistinct({ schoolName: courses.schoolName })
    .from(courses)
    .where(sql`${courses.schoolName} is not null`)
    .orderBy(asc(courses.schoolName));

  const levelRows = await db
    .selectDistinct({ courseLevel: courses.courseLevel })
    .from(courses)
    .where(sql`${courses.courseLevel} is not null`)
    .orderBy(asc(courses.courseLevel));

  return {
    schools: schoolRows.map((row) => row.schoolName).filter(Boolean) as string[],
    courseLevels: levelRows.map((row) => row.courseLevel).filter(Boolean) as string[],
  };
}

export async function getTimetableDataFromClassIds(classIds: number[])
{
  if (classIds.length === 0)
  {
    return {
      semester: null,
      semesterWeeks: [],
      selections: [],
      events: [],
      clashes: [],
      unresolvedSelections: [],
    } satisfies TimetableData;
  }

  const classRows = await db
    .select({
      classId: classes.classId,
      courseCode: classes.courseCode,
      semesterId: classes.semesterId,
      scheduleType: classes.scheduleType,
      groupCodeType: classes.groupCodeType,
      groupCode: classes.groupCode,
      availableAsGsp: classes.availableAsGsp,
      isRestricted: classes.isRestricted,
      remarks: classes.remarks,
      courseName: courses.courseName,
      schoolName: courses.schoolName,
      creditUnits: courses.creditUnits,
      presentationPattern: courses.presentationPattern,
    })
    .from(classes)
    .innerJoin(courses, eq(classes.courseCode, courses.courseCode))
    .where(inArray(classes.classId, classIds))
    .orderBy(asc(classes.courseCode), asc(classes.groupCode));

  if (classRows.length === 0)
  {
    return {
      semester: null,
      semesterWeeks: [],
      selections: [],
      events: [],
      clashes: [],
      unresolvedSelections: [],
    } satisfies TimetableData;
  }

  const semesterId = classRows[0].semesterId;
  const assessmentRows = await db
    .select({
      courseCode: assessmentComponents.courseCode,
      scheduleType: assessmentComponents.scheduleType,
      componentName: assessmentComponents.componentName,
      assessmentMode: assessmentComponents.assessmentMode,
    })
    .from(assessmentComponents)
    .where(inArray(assessmentComponents.courseCode, unique(classRows.map((row) => row.courseCode))));
  const hasEcaByCourseAndScheduleType = new Map<string, boolean>();
  for (const row of assessmentRows)
  {
    const hasEca = [row.componentName, row.assessmentMode]
      .some((value) => value?.toLowerCase().includes("eca"));
    if (!hasEca)
    {
      continue;
    }
    hasEcaByCourseAndScheduleType.set(`${row.courseCode}:${row.scheduleType}`, true);
  }

  const [semester, weeks, eventRows] = await Promise.all([
    getSemesterById(semesterId),
    getSemesterWeeks(semesterId),
    db
      .select({
        eventId: vClassEventsWithWeek.eventId,
        classId: vClassEventsWithWeek.classId,
        courseCode: vClassEventsWithWeek.courseCode,
        semesterId: vClassEventsWithWeek.semesterId,
        scheduleType: vClassEventsWithWeek.scheduleType,
        groupCodeType: vClassEventsWithWeek.groupCodeType,
        groupCode: vClassEventsWithWeek.groupCode,
        eventKind: vClassEventsWithWeek.eventKind,
        eventDate: vClassEventsWithWeek.eventDate,
        dayOfWeek: vClassEventsWithWeek.dayOfWeek,
        startTime: vClassEventsWithWeek.startTime,
        endTime: vClassEventsWithWeek.endTime,
        eventMode: vClassEventsWithWeek.eventMode,
        venue: vClassEventsWithWeek.venue,
        remarks: vClassEventsWithWeek.remarks,
        weekId: vClassEventsWithWeek.weekId,
        weekNo: vClassEventsWithWeek.weekNo,
        weekType: vClassEventsWithWeek.weekType,
        weekLabel: vClassEventsWithWeek.weekLabel,
        courseName: courses.courseName,
        schoolName: courses.schoolName,
      })
      .from(vClassEventsWithWeek)
      .innerJoin(courses, eq(vClassEventsWithWeek.courseCode, courses.courseCode))
      .where(inArray(vClassEventsWithWeek.classId, classIds))
      .orderBy(asc(vClassEventsWithWeek.eventDate), asc(vClassEventsWithWeek.startTime)),
  ]);

  const events: TimetableEventRecord[] = eventRows.map((row) => {
    const mapped = mapClassEventWithWeekRow(row);
    const shareKey = buildSharedClassIdentifier({
      courseCode: mapped.courseCode,
      scheduleType: mapped.scheduleType,
      groupCodeType: mapped.groupCodeType,
      groupCode: mapped.groupCode,
    });

    return {
      ...mapped,
      courseName: row.courseName,
      schoolName: row.schoolName,
      shareKey,
    } satisfies TimetableEventRecord;
  });

  const eventsByClassId = new Map<number, TimetableEventRecord[]>();
  for (const event of events)
  {
    const existing = eventsByClassId.get(event.classId);
    if (existing)
    {
      existing.push(event);
    }
    else
    {
      eventsByClassId.set(event.classId, [event]);
    }
  }

  const selections: TimetableSelectionRecord[] = classRows.map((row) => {
    const identifier = {
      courseCode: row.courseCode,
      scheduleType: row.scheduleType as TimetableSelectionRecord["scheduleType"],
      groupCodeType: row.groupCodeType as TimetableSelectionRecord["groupCodeType"],
      groupCode: row.groupCode,
    } satisfies SharedClassIdentifier;

    return {
      classId: row.classId,
      courseCode: row.courseCode,
      semesterId: row.semesterId,
      scheduleType: row.scheduleType as TimetableSelectionRecord["scheduleType"],
      groupCodeType: row.groupCodeType as TimetableSelectionRecord["groupCodeType"],
      groupCode: row.groupCode,
      availableAsGsp: row.availableAsGsp,
      isRestricted: row.isRestricted,
      remarks: row.remarks,
      courseName: row.courseName,
      schoolName: row.schoolName,
      creditUnits: row.creditUnits,
      presentationPattern: row.presentationPattern,
      identifier,
      shareKey: buildSharedClassIdentifier(identifier),
      hasEca: hasEcaByCourseAndScheduleType.get(`${row.courseCode}:${row.scheduleType}`) ?? false,
      events: eventsByClassId.get(row.classId) ?? [],
    } satisfies TimetableSelectionRecord;
  });

  return {
    semester,
    semesterWeeks: weeks,
    selections,
    events,
    clashes: detectTimetableClashes(events),
    unresolvedSelections: [],
  } satisfies TimetableData;
}

export async function getTimetableDataFromClassIdentifiers(
  selectedClasses: SharedClassIdentifier[],
  semesterId: number,
)
{
  if (selectedClasses.length === 0)
  {
    const [semester, weeks] = await Promise.all([
      getSemesterById(semesterId),
      getSemesterWeeks(semesterId),
    ]);

    return {
      semester,
      semesterWeeks: weeks,
      selections: [],
      events: [],
      clashes: [],
      unresolvedSelections: [],
    } satisfies TimetableData;
  }

  const predicates = selectedClasses.map((selectedClass) => and(
    eq(classes.courseCode, normalizeCourseCode(selectedClass.courseCode)),
    eq(classes.semesterId, semesterId),
    eq(classes.scheduleType, selectedClass.scheduleType),
    eq(classes.groupCodeType, selectedClass.groupCodeType),
    eq(classes.groupCode, selectedClass.groupCode),
  ));

  const matchingClasses = await db
    .select({
      classId: classes.classId,
      courseCode: classes.courseCode,
      semesterId: classes.semesterId,
      scheduleType: classes.scheduleType,
      groupCodeType: classes.groupCodeType,
      groupCode: classes.groupCode,
    })
    .from(classes)
    .where(or(...predicates));

  const matchedKeys = new Set(
    matchingClasses.map((row) => buildSharedClassIdentifier({
      courseCode: row.courseCode,
      scheduleType: row.scheduleType as SharedClassIdentifier["scheduleType"],
      groupCodeType: row.groupCodeType as SharedClassIdentifier["groupCodeType"],
      groupCode: row.groupCode,
    })),
  );

  const unresolvedSelections = selectedClasses.filter(
    (selectedClass) => !matchedKeys.has(buildSharedClassIdentifier(selectedClass)),
  );

  const timetableData = await getTimetableDataFromClassIds(matchingClasses.map((row) => row.classId));
  return {
    ...timetableData,
    unresolvedSelections,
  } satisfies TimetableData;
}
