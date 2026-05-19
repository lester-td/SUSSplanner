import type {
  AssessmentComponentRecord,
  ClassEventRecord,
  ClassRecord,
  CourseRecord,
  SemesterKey,
  SemesterWeekRecord
} from "../lib/types.js";
import { sqlBool, sqlDate, sqlJson, sqlNumber, sqlString, sqlTime } from "./escape.js";

export interface GenerateSqlInput {
  semesters?: SemesterKey[];
  weeks?: SemesterWeekRecord[];
  courses?: CourseRecord[];
  classes?: ClassRecord[];
  classEvents?: ClassEventRecord[];
  assessments?: AssessmentComponentRecord[];
  includeTransaction?: boolean;
}


function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function chooseString(current: string | null | undefined, candidate: string | null | undefined): string | null | undefined {
  if (!hasValue(current)) return candidate;
  if (!hasValue(candidate)) return current;
  if (current?.trim().startsWith("Topics:") && !candidate?.trim().startsWith("Topics:")) return candidate;
  return current;
}

function chooseArray(current: unknown[] | null | undefined, candidate: unknown[] | null | undefined): unknown[] | null | undefined {
  if (!hasValue(current)) return candidate;
  if (!hasValue(candidate)) return current;
  return (candidate?.length ?? 0) > (current?.length ?? 0) ? candidate : current;
}

function mergeCourses(items: CourseRecord[]): CourseRecord[] {
  const map = new Map<string, CourseRecord>();

  for (const course of items) {
    const key = course.courseCode.toUpperCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...course, courseCode: key });
      continue;
    }

    map.set(key, {
      ...existing,
      courseName: chooseString(existing.courseName, course.courseName) ?? null,
      schoolName: chooseString(existing.schoolName, course.schoolName) ?? null,
      isPostgraduate: hasValue(existing.isPostgraduate) ? existing.isPostgraduate : course.isPostgraduate,
      courseLevel: chooseString(existing.courseLevel, course.courseLevel) ?? null,
      creditUnits: hasValue(existing.creditUnits) ? existing.creditUnits : course.creditUnits,
      presentationPattern: chooseString(existing.presentationPattern, course.presentationPattern) ?? null,
      courseSynopsis: chooseString(existing.courseSynopsis, course.courseSynopsis) ?? null,
      courseTopics: chooseArray(existing.courseTopics, course.courseTopics) ?? null,
      learningOutcomes: chooseArray(existing.learningOutcomes, course.learningOutcomes) ?? null,
      synopsisUrl: chooseString(existing.synopsisUrl, course.synopsisUrl) ?? null,
      lastScrapedAt: chooseString(existing.lastScrapedAt, course.lastScrapedAt) ?? null
    });
  }

  return [...map.values()];
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

export function generateSql(input: GenerateSqlInput): string {
  const statements: string[] = [];

  if (input.includeTransaction !== false) statements.push("BEGIN;");

  for (const semester of uniqueBy(input.semesters ?? [], s => `${s.academicYear}#${s.semesterNo}`)) {
    statements.push(generateSemesterUpsert(semester));
  }

  for (const week of uniqueBy(input.weeks ?? [], w => `${w.academicYear}#${w.semesterNo}#${w.label}`)) {
    statements.push(generateSemesterWeekUpsert(week));
  }

  for (const course of mergeCourses(input.courses ?? [])) {
    statements.push(generateCourseUpsert(course));
  }

  for (const klass of uniqueBy(
    input.classes ?? [],
    c => `${c.courseCode}#${c.academicYear}#${c.semesterNo}#${c.scheduleType}#${c.groupCodeType}#${c.groupCode}`
  )) {
    statements.push(generateClassUpsert(klass));
  }

  for (const event of uniqueBy(
    input.classEvents ?? [],
    e => `${e.courseCode}#${e.academicYear}#${e.semesterNo}#${e.scheduleType}#${e.groupCodeType}#${e.groupCode}#${e.eventKind}#${e.eventDate}#${e.startTime}#${e.endTime}`
  )) {
    statements.push(generateClassEventUpsert(event));
  }

  // Latest-only course assessments:
  // Delete/reinsert only for courses where at least one assessment was successfully parsed.
  // This avoids wiping existing assessment data when the parser fails to find components.
  const assessmentKeys = new Map<string, { courseCode: string; scheduleType: string }>();
  for (const assessment of input.assessments ?? []) {
    const courseCode = assessment.courseCode.toUpperCase();
    const scheduleType = assessment.scheduleType;
    assessmentKeys.set(`${courseCode}#${scheduleType}`, { courseCode, scheduleType });
  }

  for (const key of [...assessmentKeys.keys()].sort()) {
    const item = assessmentKeys.get(key)!;
    statements.push(generateAssessmentDelete(item.courseCode, item.scheduleType));
  }

  for (const assessment of uniqueBy(
    input.assessments ?? [],
    a => `${a.courseCode}#${a.scheduleType}#${a.sortOrder}#${a.componentName}#${a.weightPercentage}`
  )) {
    statements.push(generateAssessmentInsert(assessment));
  }

  if (input.includeTransaction !== false) statements.push("COMMIT;");

  return statements.join("\n\n") + "\n";
}

export function generateSemesterUpsert(semester: SemesterKey): string {
  return `INSERT INTO semesters (academic_year, semester_no, semester_name)\nVALUES (${sqlString(semester.academicYear)}, ${semester.semesterNo}, ${sqlString(semester.semesterName)})\nON CONFLICT (academic_year, semester_no) DO UPDATE SET\n    semester_name = EXCLUDED.semester_name;`;
}

export function generateSemesterWeekUpsert(week: SemesterWeekRecord): string {
  return `INSERT INTO semester_weeks (semester_id, week_no, week_type, label, start_date, end_date)\nSELECT\n    s.semester_id,\n    ${sqlNumber(week.weekNo)},\n    ${sqlString(week.weekType)},\n    ${sqlString(week.label)},\n    ${sqlDate(week.startDate)},\n    ${sqlDate(week.endDate)}\nFROM semesters s\nWHERE s.academic_year = ${sqlString(week.academicYear)}\n  AND s.semester_no = ${week.semesterNo}\nON CONFLICT (semester_id, label) DO UPDATE SET\n    week_no = EXCLUDED.week_no,\n    week_type = EXCLUDED.week_type,\n    start_date = EXCLUDED.start_date,\n    end_date = EXCLUDED.end_date;`;
}

export function generateCourseUpsert(course: CourseRecord): string {
  return `INSERT INTO courses (
    course_code, course_name, school_name, is_postgraduate,
    course_level, credit_units, presentation_pattern, course_synopsis,
    course_topics, learning_outcomes, synopsis_url, last_scraped_at
)
VALUES (
    ${sqlString(course.courseCode)},
    ${sqlString(course.courseName)},
    ${sqlString(course.schoolName)},
    ${sqlBool(course.isPostgraduate)},
    ${sqlString(course.courseLevel)},
    ${sqlNumber(course.creditUnits)},
    ${sqlString(course.presentationPattern)},
    ${sqlString(course.courseSynopsis)},
    ${sqlJson(course.courseTopics)},
    ${sqlJson(course.learningOutcomes)},
    ${sqlString(course.synopsisUrl)},
    ${course.lastScrapedAt ? sqlString(course.lastScrapedAt) : "NULL"}
)
ON CONFLICT (course_code) DO UPDATE SET
    course_name = COALESCE(EXCLUDED.course_name, courses.course_name),
    school_name = COALESCE(EXCLUDED.school_name, courses.school_name),
    is_postgraduate = COALESCE(EXCLUDED.is_postgraduate, courses.is_postgraduate),
    course_level = COALESCE(EXCLUDED.course_level, courses.course_level),
    credit_units = COALESCE(EXCLUDED.credit_units, courses.credit_units),
    presentation_pattern = COALESCE(EXCLUDED.presentation_pattern, courses.presentation_pattern),
    course_synopsis = COALESCE(EXCLUDED.course_synopsis, courses.course_synopsis),
    course_topics = COALESCE(EXCLUDED.course_topics, courses.course_topics),
    learning_outcomes = COALESCE(EXCLUDED.learning_outcomes, courses.learning_outcomes),
    synopsis_url = COALESCE(EXCLUDED.synopsis_url, courses.synopsis_url),
    last_scraped_at = COALESCE(EXCLUDED.last_scraped_at, courses.last_scraped_at);`;
}

export function generateClassUpsert(klass: ClassRecord): string {
  return `INSERT INTO classes (\n    course_code, semester_id, schedule_type, group_code_type, group_code,\n    available_as_gsp, is_restricted, remarks\n)\nSELECT\n    ${sqlString(klass.courseCode)},\n    s.semester_id,\n    ${sqlString(klass.scheduleType)},\n    ${sqlString(klass.groupCodeType)},\n    ${sqlString(klass.groupCode)},\n    ${sqlBool(klass.availableAsGsp)},\n    ${sqlBool(klass.isRestricted)},\n    ${sqlString(klass.remarks)}\nFROM semesters s\nWHERE s.academic_year = ${sqlString(klass.academicYear)}\n  AND s.semester_no = ${klass.semesterNo}\nON CONFLICT (course_code, semester_id, schedule_type, group_code_type, group_code) DO UPDATE SET\n    available_as_gsp = COALESCE(EXCLUDED.available_as_gsp, classes.available_as_gsp),\n    is_restricted = COALESCE(EXCLUDED.is_restricted, classes.is_restricted),\n    remarks = COALESCE(EXCLUDED.remarks, classes.remarks);`;
}

export function generateClassEventUpsert(event: ClassEventRecord): string {
  return `INSERT INTO class_events (\n    class_id, event_kind, event_date, start_time, end_time, event_mode, venue, remarks\n)\nSELECT\n    c.class_id,\n    ${sqlString(event.eventKind)},\n    ${sqlDate(event.eventDate)},\n    ${sqlTime(event.startTime)},\n    ${sqlTime(event.endTime)},\n    ${sqlString(event.eventMode)},\n    ${sqlString(event.venue)},\n    ${sqlString(event.remarks)}\nFROM classes c\nJOIN semesters s ON s.semester_id = c.semester_id\nWHERE c.course_code = ${sqlString(event.courseCode)}\n  AND s.academic_year = ${sqlString(event.academicYear)}\n  AND s.semester_no = ${event.semesterNo}\n  AND c.schedule_type = ${sqlString(event.scheduleType)}\n  AND c.group_code_type = ${sqlString(event.groupCodeType)}\n  AND c.group_code = ${sqlString(event.groupCode)}\nON CONFLICT (class_id, event_kind, event_date, start_time, end_time) DO UPDATE SET\n    event_mode = COALESCE(EXCLUDED.event_mode, class_events.event_mode),\n    venue = COALESCE(EXCLUDED.venue, class_events.venue),\n    remarks = COALESCE(EXCLUDED.remarks, class_events.remarks);`;
}

export function generateAssessmentDelete(courseCode: string, scheduleType: string): string {
  return `DELETE FROM assessment_components\nWHERE course_code = ${sqlString(courseCode)}\n  AND schedule_type = ${sqlString(scheduleType)};`;
}

export function generateAssessmentInsert(assessment: AssessmentComponentRecord): string {
  return `INSERT INTO assessment_components (\n    course_code, schedule_type, component_name, component_group, assessment_mode, weight_percentage, sort_order\n)\nVALUES (\n    ${sqlString(assessment.courseCode)},\n    ${sqlString(assessment.scheduleType)},\n    ${sqlString(assessment.componentName)},\n    ${sqlString(assessment.componentGroup)},\n    ${sqlString(assessment.assessmentMode)},\n    ${assessment.weightPercentage},\n    ${assessment.sortOrder}\n)\nON CONFLICT (course_code, schedule_type, sort_order) DO UPDATE SET\n    component_name = EXCLUDED.component_name,\n    component_group = EXCLUDED.component_group,\n    assessment_mode = EXCLUDED.assessment_mode,\n    weight_percentage = EXCLUDED.weight_percentage;`;
}
