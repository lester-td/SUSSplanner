import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, requireString, optionalString } from "../lib/args.js";
import type { ClassEventRecord, ClassRecord, CourseRecord, ScheduleParseResult, SemesterKey } from "../lib/types.js";
import { generateSql } from "../sql/generateSql.js";

function asArray<T>(value: unknown, fieldName: string): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Expected '${fieldName}' to be an array.`);
  }
  return value as T[];
}

function normalizeCourse(course: any): CourseRecord {
  return {
    courseCode: String(course.courseCode ?? course.course_code ?? "").trim().toUpperCase(),
    courseName: course.courseName ?? course.course_name ?? null,
    schoolName: course.schoolName ?? course.school_name ?? null,
    isPostgraduate: course.isPostgraduate ?? course.is_postgraduate ?? null,
    courseLevel: course.courseLevel ?? course.course_level ?? null,
    creditUnits: course.creditUnits ?? course.credit_units ?? null,
    presentationPattern: course.presentationPattern ?? course.presentation_pattern ?? null,
    courseSynopsis: course.courseSynopsis ?? course.course_synopsis ?? null,
    courseTopics: course.courseTopics ?? course.course_topics ?? null,
    learningOutcomes: course.learningOutcomes ?? course.learning_outcomes ?? null,
    synopsisUrl: course.synopsisUrl ?? course.synopsis_url ?? null,
    lastScrapedAt: course.lastScrapedAt ?? course.last_scraped_at ?? null
  };
}

function normalizeSemester(semester: any): SemesterKey {
  return {
    academicYear: String(semester.academicYear ?? semester.academic_year ?? "").trim(),
    semesterNo: Number(semester.semesterNo ?? semester.semester_no),
    semesterName: String(semester.semesterName ?? semester.semester_name ?? "").trim()
  } as SemesterKey;
}

function normalizeClass(klass: any): ClassRecord {
  return {
    courseCode: String(klass.courseCode ?? klass.course_code ?? "").trim().toUpperCase(),
    academicYear: String(klass.academicYear ?? klass.academic_year ?? "").trim(),
    semesterNo: Number(klass.semesterNo ?? klass.semester_no),
    scheduleType: klass.scheduleType ?? klass.schedule_type,
    groupCodeType: klass.groupCodeType ?? klass.group_code_type,
    groupCode: String(klass.groupCode ?? klass.group_code ?? "").trim(),
    availableAsGsp: klass.availableAsGsp ?? klass.available_as_gsp ?? null,
    isRestricted: klass.isRestricted ?? klass.is_restricted ?? null,
    remarks: klass.remarks ?? null
  } as ClassRecord;
}

function normalizeClassEvent(event: any): ClassEventRecord {
  return {
    courseCode: String(event.courseCode ?? event.course_code ?? "").trim().toUpperCase(),
    academicYear: String(event.academicYear ?? event.academic_year ?? "").trim(),
    semesterNo: Number(event.semesterNo ?? event.semester_no),
    scheduleType: event.scheduleType ?? event.schedule_type,
    groupCodeType: event.groupCodeType ?? event.group_code_type,
    groupCode: String(event.groupCode ?? event.group_code ?? "").trim(),
    eventKind: event.eventKind ?? event.event_kind,
    eventDate: event.eventDate ?? event.event_date,
    startTime: event.startTime ?? event.start_time,
    endTime: event.endTime ?? event.end_time,
    eventMode: event.eventMode ?? event.event_mode ?? null,
    venue: event.venue ?? null,
    remarks: event.remarks ?? null
  } as ClassEventRecord;
}

function assertRequired(value: unknown, label: string): void {
  if (value === null || value === undefined || value === "" || Number.isNaN(value)) {
    throw new Error(`Invalid parsed schedule JSON: missing ${label}.`);
  }
}

function validateScheduleData(data: ScheduleParseResult): void {
  for (const semester of data.semesters) {
    assertRequired(semester.academicYear, "semester.academicYear");
    assertRequired(semester.semesterNo, "semester.semesterNo");
    assertRequired(semester.semesterName, "semester.semesterName");
  }

  for (const course of data.courses) {
    assertRequired(course.courseCode, "course.courseCode");
  }

  for (const klass of data.classes) {
    assertRequired(klass.courseCode, "class.courseCode");
    assertRequired(klass.academicYear, "class.academicYear");
    assertRequired(klass.semesterNo, "class.semesterNo");
    assertRequired(klass.scheduleType, "class.scheduleType");
    assertRequired(klass.groupCodeType, "class.groupCodeType");
    assertRequired(klass.groupCode, "class.groupCode");
  }

  for (const event of data.classEvents) {
    assertRequired(event.courseCode, "classEvent.courseCode");
    assertRequired(event.academicYear, "classEvent.academicYear");
    assertRequired(event.semesterNo, "classEvent.semesterNo");
    assertRequired(event.scheduleType, "classEvent.scheduleType");
    assertRequired(event.groupCodeType, "classEvent.groupCodeType");
    assertRequired(event.groupCode, "classEvent.groupCode");
    assertRequired(event.eventKind, "classEvent.eventKind");
    assertRequired(event.eventDate, "classEvent.eventDate");
    assertRequired(event.startTime, "classEvent.startTime");
    assertRequired(event.endTime, "classEvent.endTime");
  }
}

function normalizeScheduleJson(raw: any): ScheduleParseResult {
  const data: ScheduleParseResult = {
    semesters: asArray<any>(raw.semesters, "semesters").map(normalizeSemester),
    courses: asArray<any>(raw.courses, "courses").map(normalizeCourse),
    classes: asArray<any>(raw.classes, "classes").map(normalizeClass),
    classEvents: asArray<any>(raw.classEvents ?? raw.class_events, "classEvents").map(normalizeClassEvent),
    warnings: asArray<string>(raw.warnings, "warnings")
  };

  validateScheduleData(data);
  return data;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const jsonPath = requireString(args, "json");
  const outPath = optionalString(args, "out") ?? "data/output/schedules-import.sql";
  const courseCodesOut = optionalString(args, "course-codes-out");

  const raw = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const parsed = normalizeScheduleJson(raw);

  const sql = generateSql({
    semesters: parsed.semesters,
    courses: parsed.courses,
    classes: parsed.classes,
    classEvents: parsed.classEvents
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, sql, "utf8");

  if (courseCodesOut) {
    await fs.mkdir(path.dirname(courseCodesOut), { recursive: true });
    const courseCodes = [...new Set(parsed.courses.map(course => course.courseCode.toUpperCase()))].sort();
    await fs.writeFile(courseCodesOut, courseCodes.join("\n") + "\n", "utf8");
  }

  console.log(`Read schedule JSON from: ${jsonPath}`);
  console.log(`Semesters: ${parsed.semesters.length}`);
  console.log(`Courses: ${parsed.courses.length}`);
  console.log(`Classes: ${parsed.classes.length}`);
  console.log(`Class events: ${parsed.classEvents.length}`);
  console.log(`SQL written to: ${outPath}`);
  if (courseCodesOut) console.log(`Course codes written to: ${courseCodesOut}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
