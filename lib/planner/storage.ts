import type { CourseRecord, CourseSearchResult } from "@/lib/timetable/types";
import { studyPlanBackupSchema, studyPlanStateSchema } from "@/lib/validation/planner";
import type { StudyPlanCourse, StudyPlanState } from "./types";

export const STUDY_PLAN_STORAGE_KEY = "sussplanner.study-plan.v1";
export const STUDY_PLAN_UPDATED_EVENT = "sussplanner:study-plan-updated";
export const STUDY_PLAN_BACKUP_FORMAT = "sussplanner-study-plan";
export const STUDY_PLAN_BACKUP_VERSION = 1;

const DEFAULT_TOTAL_CREDITS = 130;
const DEFAULT_SEMESTERS = 8;

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toCreditUnits(value: number | null)
{
  return value ?? 0;
}

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

function buildCatalogCourseId(courseCode: string)
{
  return `catalog:${normalizeCourseCode(courseCode)}`;
}

export function inferCatalogSemesterSpan(courseCode: string)
{
  const normalizedCode = normalizeCourseCode(courseCode);

  if (
    normalizedCode === "NIE301"
    || normalizedCode === "NIE351"
    || normalizedCode.endsWith("499")
  )
  {
    return 2;
  }

  return 1;
}

export function createCatalogStudyPlanCourse(
  course: Pick<CourseSearchResult | CourseRecord, "courseCode" | "courseName" | "creditUnits" | "schoolName">,
): StudyPlanCourse
{
  return {
    id: buildCatalogCourseId(course.courseCode),
    courseCode: normalizeCourseCode(course.courseCode),
    courseName: course.courseName?.trim() || normalizeCourseCode(course.courseCode),
    schoolName: course.schoolName?.trim() || null,
    creditUnits: toCreditUnits(course.creditUnits),
    semesterSpan: inferCatalogSemesterSpan(course.courseCode),
    assignedSemester: null,
    source: "catalog",
  };
}

export function createManualStudyPlanCourse(input: {
  courseCode: string;
  courseName: string;
  creditUnits: number;
  semesterSpan: number;
}): StudyPlanCourse
{
  const normalizedCode = normalizeCourseCode(input.courseCode);

  return {
    id: `manual:${normalizedCode}:${Date.now()}`,
    courseCode: normalizedCode,
    courseName: input.courseName.trim(),
    schoolName: null,
    creditUnits: input.creditUnits,
    semesterSpan: input.semesterSpan,
    assignedSemester: null,
    source: "manual",
  };
}

export function defaultStudyPlanState(): StudyPlanState
{
  return {
    totalCreditsGoal: DEFAULT_TOTAL_CREDITS,
    numSemesters: DEFAULT_SEMESTERS,
    courses: [],
  };
}

export function normalizeStudyPlanState(state: StudyPlanState): StudyPlanState
{
  const parsed = studyPlanStateSchema.parse(state);
  const numSemesters = Math.max(1, parsed.numSemesters);

  return {
    totalCreditsGoal: parsed.totalCreditsGoal,
    numSemesters,
    courses: parsed.courses.map((course) => {
      const normalizedCourseCode = normalizeCourseCode(course.courseCode);
      const baseSemesterSpan = course.source === "catalog"
        ? inferCatalogSemesterSpan(normalizedCourseCode)
        : course.semesterSpan;
      const semesterSpan = Math.max(1, Math.min(baseSemesterSpan, numSemesters));
      const maxAssignedSemester = Math.max(0, numSemesters - semesterSpan);
      const assignedSemester = course.assignedSemester === null
        ? null
        : Math.min(course.assignedSemester, maxAssignedSemester);

      return {
        ...course,
        courseCode: normalizedCourseCode,
        semesterSpan,
        assignedSemester,
      };
    }),
  };
}

export function serializeStudyPlanBackup(state: StudyPlanState, exportedAt = new Date())
{
  return JSON.stringify({
    format: STUDY_PLAN_BACKUP_FORMAT,
    version: STUDY_PLAN_BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    plan: normalizeStudyPlanState(state),
  }, null, 2);
}

export function parseStudyPlanBackup(raw: string)
{
  const backup = studyPlanBackupSchema.parse(JSON.parse(raw) as unknown);
  return normalizeStudyPlanState(backup.plan);
}

export function loadStudyPlanState()
{
  if (!canUseLocalStorage())
  {
    return null;
  }

  const raw = window.localStorage.getItem(STUDY_PLAN_STORAGE_KEY);
  if (!raw)
  {
    return null;
  }

  try
  {
    return normalizeStudyPlanState(JSON.parse(raw) as StudyPlanState);
  }
  catch {
    return null;
  }
}

export function saveStudyPlanState(state: StudyPlanState)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  const normalized = normalizeStudyPlanState(state);
  window.localStorage.setItem(STUDY_PLAN_STORAGE_KEY, JSON.stringify(normalized));
}

export function announceStudyPlanUpdated()
{
  if (typeof window === "undefined")
  {
    return;
  }

  window.dispatchEvent(new CustomEvent(STUDY_PLAN_UPDATED_EVENT));
}

export function upsertCatalogCourseInStudyPlan(
  state: StudyPlanState | null,
  course: Pick<CourseSearchResult | CourseRecord, "courseCode" | "courseName" | "creditUnits" | "schoolName">,
)
{
  const nextState = state ?? defaultStudyPlanState();
  const normalized = createCatalogStudyPlanCourse(course);
  const existing = nextState.courses.find((item) => item.courseCode === normalized.courseCode);

  if (existing)
  {
    return normalizeStudyPlanState({
      ...nextState,
      courses: nextState.courses.map((item) => item.courseCode === normalized.courseCode
        ? {
            ...item,
            courseName: normalized.courseName,
            schoolName: normalized.schoolName,
            creditUnits: normalized.creditUnits,
            semesterSpan: normalized.semesterSpan,
          }
        : item),
    });
  }

  return normalizeStudyPlanState({
    ...nextState,
    courses: [...nextState.courses, normalized],
  });
}
