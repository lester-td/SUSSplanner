import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  academicCalendarEvents,
  academicCalendarEventSemesters,
  assessmentComponents,
  classes,
  classEvents,
  courses,
  semesters,
  semesterWeeks,
} from "../lib/db/schema";
import {
  DATA_SNAPSHOT_FORMAT_VERSION,
  getDataSnapshotBucket,
  type AcademicCalendarEventRecord,
  type CourseIndexSnapshotRecord,
  type CourseOfferingSnapshot,
  type CourseSnapshot,
  type CourseSnapshotBucket,
  type DataSnapshotManifest,
  type ScheduleSnapshotBucket,
} from "../lib/data/snapshot-types";
import type {
  AssessmentComponentRecord,
  ClassEventWithWeekRecord,
  CourseClassRecord,
  CourseRecord,
  SemesterRecord,
  SemesterWeekRecord,
} from "../lib/timetable/types";

const projectRoot = process.cwd();
loadEnvConfig(projectRoot);
const snapshotRoot = path.join(projectRoot, "data", "snapshots");
const temporaryRoot = path.join(projectRoot, "data", `.snapshots-${process.pid}-${Date.now()}`);
const queryTimeoutMs = 30_000;

function getDatabaseUrl()
{
  const value = process.env.DATABASE_URL?.trim();
  if (!value)
  {
    throw new Error("DATABASE_URL is required to generate data snapshots.");
  }
  return value;
}

function unique<T>(values: T[])
{
  return [...new Set(values)];
}

function toIsoString(value: Date | string)
{
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
  {
    throw new Error(`Invalid database timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

function mapSemester(row: typeof semesters.$inferSelect): SemesterRecord
{
  return {
    semesterId: row.semesterId,
    academicYear: row.academicYear,
    semesterNo: row.semesterNo as SemesterRecord["semesterNo"],
    semesterName: row.semesterName,
  };
}

function mapWeek(row: typeof semesterWeeks.$inferSelect): SemesterWeekRecord
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

function mapCourse(row: typeof courses.$inferSelect): CourseRecord
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

function mapAssessment(row: typeof assessmentComponents.$inferSelect): AssessmentComponentRecord
{
  return {
    componentId: row.componentId,
    courseCode: row.courseCode,
    scheduleType: row.scheduleType as AssessmentComponentRecord["scheduleType"],
    componentName: row.componentName,
    componentGroup: row.componentGroup as AssessmentComponentRecord["componentGroup"],
    assessmentMode: row.assessmentMode,
    weightPercentage: row.weightPercentage,
    sortOrder: row.sortOrder,
  };
}

async function writeJson(relativePath: string, value: unknown, pretty = false)
{
  const destination = path.join(temporaryRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`, "utf8");
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number)
{
  let nextTaskIndex = 0;
  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextTaskIndex < tasks.length)
    {
      const task = tasks[nextTaskIndex];
      nextTaskIndex += 1;
      await task();
    }
  }));
}

async function loadRows<T>(label: string, query: PromiseLike<T[]>): Promise<T[]>
{
  const startedAt = Date.now();
  console.log(`[snapshot] Loading ${label}...`);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const rows = await Promise.race([
    Promise.resolve(query),
    new Promise<T[]>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Timed out loading ${label} after ${queryTimeoutMs}ms.`)),
        queryTimeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  console.log(`[snapshot] Loaded ${label}: ${rows.length} rows in ${Date.now() - startedAt}ms.`);
  return rows;
}

async function main()
{
  const generatedAt = new Date();
  const client = postgres(getDatabaseUrl(), {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  const db = drizzle(client);

  try
  {
    const courseRows = await loadRows("courses", db.select().from(courses));
    const semesterRows = await loadRows("semesters", db.select().from(semesters));
    const weekRows = await loadRows("semester_weeks", db.select().from(semesterWeeks));
    const calendarRows = await loadRows("academic_calendar_events", db.select().from(academicCalendarEvents));
    const calendarSemesterRows = await loadRows(
      "academic_calendar_event_semesters",
      db.select().from(academicCalendarEventSemesters),
    );
    const classRows = await loadRows("classes", db.select().from(classes));
    const eventRows = await loadRows("class_events", db.select().from(classEvents));
    const assessmentRows = await loadRows("assessment_components", db.select().from(assessmentComponents));

    if (courseRows.length === 0 || semesterRows.length === 0)
    {
      throw new Error("Refusing to publish an empty snapshot: courses and semesters must contain data.");
    }

    const semestersById = new Map(semesterRows.map((row) => [row.semesterId, mapSemester(row)]));
    const weeksBySemesterId = new Map<number, SemesterWeekRecord[]>();
    for (const row of weekRows)
    {
      const mapped = mapWeek(row);
      const existing = weeksBySemesterId.get(mapped.semesterId);
      if (existing) existing.push(mapped);
      else weeksBySemesterId.set(mapped.semesterId, [mapped]);
    }
    for (const weeks of weeksBySemesterId.values())
    {
      weeks.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.weekId - right.weekId);
    }

    const semesterTree = semesterRows
      .map(mapSemester)
      .sort((left, right) => (
        left.academicYear.localeCompare(right.academicYear)
        || left.semesterNo - right.semesterNo
        || left.semesterId - right.semesterId
      ))
      .map((semester) => ({
        ...semester,
        weeks: weeksBySemesterId.get(semester.semesterId) ?? [],
      }));

    const courseRowsByCode = new Map(courseRows.map((row) => [row.courseCode, row]));
    const assessmentsByCourseCode = new Map<string, AssessmentComponentRecord[]>();
    for (const row of assessmentRows)
    {
      const mapped = mapAssessment(row);
      const existing = assessmentsByCourseCode.get(mapped.courseCode);
      if (existing) existing.push(mapped);
      else assessmentsByCourseCode.set(mapped.courseCode, [mapped]);
    }
    for (const assessments of assessmentsByCourseCode.values())
    {
      assessments.sort((left, right) => (
        left.scheduleType.localeCompare(right.scheduleType)
        || left.sortOrder - right.sortOrder
      ));
    }

    const classRowsById = new Map<number, typeof classRows[number]>();
    const classRowsByCourseCode = new Map<string, typeof classRows>();
    for (const row of classRows)
    {
      classRowsById.set(row.classId, row);
      const existing = classRowsByCourseCode.get(row.courseCode);
      if (existing) existing.push(row);
      else classRowsByCourseCode.set(row.courseCode, [row]);
    }
    const eventsByClassId = new Map<number, ClassEventWithWeekRecord[]>();
    for (const row of eventRows)
    {
      const classRow = classRowsById.get(row.classId);
      if (!classRow)
      {
        throw new Error(`Class event ${row.eventId} references missing class ${row.classId}.`);
      }
      const week = (weeksBySemesterId.get(classRow.semesterId) ?? []).find(
        (item) => row.eventDate >= item.startDate && row.eventDate <= item.endDate,
      );
      const mapped: ClassEventWithWeekRecord = {
        eventId: row.eventId,
        classId: row.classId,
        courseCode: classRow.courseCode,
        semesterId: classRow.semesterId,
        scheduleType: classRow.scheduleType as ClassEventWithWeekRecord["scheduleType"],
        groupCodeType: classRow.groupCodeType as ClassEventWithWeekRecord["groupCodeType"],
        groupCode: classRow.groupCode,
        eventKind: row.eventKind as ClassEventWithWeekRecord["eventKind"],
        eventDate: row.eventDate,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        eventMode: row.eventMode,
        venue: row.venue,
        remarks: row.remarks,
        weekId: week?.weekId ?? null,
        weekNo: week?.weekNo ?? null,
        weekType: week?.weekType ?? null,
        weekLabel: week?.label ?? null,
      };
      const existing = eventsByClassId.get(row.classId);
      if (existing) existing.push(mapped);
      else eventsByClassId.set(row.classId, [mapped]);
    }
    for (const events of eventsByClassId.values())
    {
      events.sort((left, right) => (
        left.eventDate.localeCompare(right.eventDate)
        || left.startTime.localeCompare(right.startTime)
        || left.eventId - right.eventId
      ));
    }

    const classesBySemesterAndCourse = new Map<string, CourseClassRecord[]>();
    for (const row of classRows)
    {
      const courseRow = courseRowsByCode.get(row.courseCode);
      if (!courseRow)
      {
        throw new Error(`Class ${row.classId} references missing course ${row.courseCode}.`);
      }
      if (!semestersById.has(row.semesterId))
      {
        throw new Error(`Class ${row.classId} references missing semester ${row.semesterId}.`);
      }
      const mapped: CourseClassRecord = {
        classId: row.classId,
        courseCode: row.courseCode,
        semesterId: row.semesterId,
        scheduleType: row.scheduleType as CourseClassRecord["scheduleType"],
        groupCodeType: row.groupCodeType as CourseClassRecord["groupCodeType"],
        groupCode: row.groupCode,
        availableAsGsp: row.availableAsGsp,
        isRestricted: row.isRestricted,
        remarks: row.remarks,
        courseName: courseRow.courseName,
        schoolName: courseRow.schoolName,
        creditUnits: courseRow.creditUnits,
        presentationPattern: courseRow.presentationPattern,
        events: eventsByClassId.get(row.classId) ?? [],
      };
      const key = `${row.semesterId}:${row.courseCode}`;
      const existing = classesBySemesterAndCourse.get(key);
      if (existing) existing.push(mapped);
      else classesBySemesterAndCourse.set(key, [mapped]);
    }
    for (const courseClasses of classesBySemesterAndCourse.values())
    {
      courseClasses.sort((left, right) => (
        left.scheduleType.localeCompare(right.scheduleType)
        || left.groupCodeType.localeCompare(right.groupCodeType)
        || left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true })
      ));
    }

    const semesterIdsByCalendarEventId = new Map<number, number[]>();
    for (const row of calendarSemesterRows)
    {
      const existing = semesterIdsByCalendarEventId.get(row.eventId);
      if (existing) existing.push(row.semesterId);
      else semesterIdsByCalendarEventId.set(row.eventId, [row.semesterId]);
    }
    const calendarEvents: AcademicCalendarEventRecord[] = calendarRows
      .map((row) => ({
        eventId: row.eventId,
        calendarYear: row.calendarYear,
        audience: row.audience as AcademicCalendarEventRecord["audience"],
        eventTitle: row.eventTitle,
        eventCategory: row.eventCategory,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status as AcademicCalendarEventRecord["status"],
        sourceUrl: row.sourceUrl,
        remarks: row.remarks,
        sortOrder: row.sortOrder,
        semesters: (semesterIdsByCalendarEventId.get(row.eventId) ?? [])
          .map((semesterId) => semestersById.get(semesterId))
          .filter((semester): semester is SemesterRecord => Boolean(semester))
          .sort((left, right) => left.semesterId - right.semesterId),
      }))
      .sort((left, right) => (
        left.startDate.localeCompare(right.startDate)
        || left.sortOrder - right.sortOrder
        || left.eventTitle.localeCompare(right.eventTitle)
        || left.audience.localeCompare(right.audience)
      ));

    const courseBuckets: Record<string, CourseSnapshotBucket> = {};
    const scheduleBuckets: Record<string, Record<string, ScheduleSnapshotBucket>> = {};
    const courseIndex: CourseIndexSnapshotRecord[] = [];
    const snapshotWrites: Array<() => Promise<void>> = [];

    for (const courseRow of [...courseRows].sort((left, right) => left.courseCode.localeCompare(right.courseCode)))
    {
      const relevantClasses = classRowsByCourseCode.get(courseRow.courseCode) ?? [];
      const offeredSemesterIds = unique(relevantClasses.map((row) => row.semesterId));
      const offeredSemesters = offeredSemesterIds
        .map((semesterId) => semestersById.get(semesterId))
        .filter((semester): semester is SemesterRecord => Boolean(semester))
        .sort((left, right) => (
          right.academicYear.localeCompare(left.academicYear)
          || right.semesterNo - left.semesterNo
          || right.semesterId - left.semesterId
        ));
      const courseAssessments = assessmentsByCourseCode.get(courseRow.courseCode) ?? [];
      const offeringsByKey = new Map<string, CourseOfferingSnapshot>();
      for (const classRow of relevantClasses)
      {
        const key = `${classRow.semesterId}:${classRow.scheduleType}`;
        const existing = offeringsByKey.get(key);
        if (existing)
        {
          existing.classCount += 1;
          existing.availableAsGsp ||= classRow.availableAsGsp === true;
        }
        else
        {
          offeringsByKey.set(key, {
            semesterId: classRow.semesterId,
            scheduleType: classRow.scheduleType as CourseOfferingSnapshot["scheduleType"],
            availableAsGsp: classRow.availableAsGsp === true,
            classCount: 1,
          });
        }
      }
      const offerings = [...offeringsByKey.values()].sort((left, right) => (
        left.semesterId - right.semesterId || left.scheduleType.localeCompare(right.scheduleType)
      ));

      const bucket = getDataSnapshotBucket(courseRow.courseCode);
      const courseSnapshot: CourseSnapshot = {
        course: mapCourse(courseRow),
        assessments: courseAssessments,
        offeredSemesters,
      };
      courseBuckets[bucket] ??= {};
      courseBuckets[bucket][courseRow.courseCode] = courseSnapshot;

      for (const semesterId of offeredSemesterIds)
      {
        const semesterKey = String(semesterId);
        scheduleBuckets[semesterKey] ??= {};
        scheduleBuckets[semesterKey][bucket] ??= { semesterId, courses: {} };
        scheduleBuckets[semesterKey][bucket].courses[courseRow.courseCode] = (
          classesBySemesterAndCourse.get(`${semesterId}:${courseRow.courseCode}`) ?? []
        );
      }

      courseIndex.push({
        courseCode: courseRow.courseCode,
        courseName: courseRow.courseName,
        schoolName: courseRow.schoolName,
        isPostgraduate: courseRow.isPostgraduate,
        courseLevel: courseRow.courseLevel,
        creditUnits: courseRow.creditUnits,
        presentationPattern: courseRow.presentationPattern,
        courseSynopsis: courseRow.courseSynopsis,
        hasAvailableClasses: relevantClasses.length > 0,
        availableClassCount: relevantClasses.length,
        offeredSemesters,
        scheduleTypes: unique(relevantClasses.map((row) => row.scheduleType)) as CourseIndexSnapshotRecord["scheduleTypes"],
        availableAsGsp: relevantClasses.some((row) => row.availableAsGsp === true),
        assessmentModes: unique(courseAssessments.map((assessment) => assessment.assessmentMode?.trim()).filter((value): value is string => Boolean(value))).sort(),
        offerings,
      });
    }

    const courseBucketFiles: Record<string, string> = {};
    for (const [bucket, snapshots] of Object.entries(courseBuckets).sort(([left], [right]) => left.localeCompare(right)))
    {
      const relativePath = `courses/${bucket}.json`;
      courseBucketFiles[bucket] = relativePath;
      snapshotWrites.push(() => writeJson(relativePath, snapshots));
    }

    const scheduleBucketFiles: Record<string, Record<string, string>> = {};
    for (const [semesterId, buckets] of Object.entries(scheduleBuckets).sort(([left], [right]) => Number(left) - Number(right)))
    {
      scheduleBucketFiles[semesterId] = {};
      for (const [bucket, snapshot] of Object.entries(buckets).sort(([left], [right]) => left.localeCompare(right)))
      {
        const relativePath = `schedules/${semesterId}-${bucket}.json`;
        scheduleBucketFiles[semesterId][bucket] = relativePath;
        snapshotWrites.push(() => writeJson(relativePath, snapshot));
      }
    }

    const generatedAtIso = generatedAt.toISOString();
    let dataUpdatedAt: string | null = null;
    const updatedRowGroups = [
      courseRows,
      semesterRows,
      weekRows,
      calendarRows,
      classRows,
      eventRows,
      assessmentRows,
    ];
    for (const rows of updatedRowGroups)
    {
      for (const row of rows)
      {
        const value = toIsoString(row.lastUpdated);
        if (value <= generatedAtIso && (!dataUpdatedAt || value > dataUpdatedAt))
        {
          dataUpdatedAt = value;
        }
      }
    }

    const manifest: DataSnapshotManifest = {
      formatVersion: DATA_SNAPSHOT_FORMAT_VERSION,
      generatedAt: generatedAtIso,
      dataUpdatedAt,
      coverage: {
        courseCount: courseRows.length,
        classCount: classRows.length,
        semesterCount: semesterRows.length,
        assessmentCount: assessmentRows.length,
      },
      semesters: semesterTree,
      academicCalendarEvents: calendarEvents,
      courseBucketFiles,
      scheduleBucketFiles,
    };

    snapshotWrites.push(
      () => writeJson("course-index.json", courseIndex),
      () => writeJson("manifest.json", manifest, true),
    );
    const writeStartedAt = Date.now();
    console.log(`[snapshot] Writing ${snapshotWrites.length} files...`);
    await runWithConcurrency(snapshotWrites, 32);
    console.log(`[snapshot] Wrote ${snapshotWrites.length} files in ${Date.now() - writeStartedAt}ms.`);

    await rm(snapshotRoot, { recursive: true, force: true });
    await rename(temporaryRoot, snapshotRoot);

    const scheduleBucketCount = Object.values(scheduleBucketFiles).reduce(
      (count, files) => count + Object.keys(files).length,
      0,
    );
    console.log(
      `Generated snapshot ${generatedAt.toISOString()}: ${courseRows.length} courses, ${classRows.length} classes, ${eventRows.length} events, ${Object.keys(courseBucketFiles).length} course buckets, ${scheduleBucketCount} schedule buckets.`,
    );
  }
  catch (error)
  {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  finally
  {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
