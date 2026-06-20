import type { CourseRecord, CourseSearchResult } from "@/lib/timetable/types";
import { semesterPlannerBackupSchema, semesterPlannerStateSchema } from "@/lib/validation/planner";
import type { SemesterPlannerCourse, SemesterPlannerState } from "./types";

export const SEMESTER_PLANNER_STORAGE_KEY = "sussplanner.semester-planner.v1";
export const SEMESTER_PLANNER_UPDATED_EVENT = "sussplanner:semester-planner-updated";
export const SEMESTER_PLANNER_BACKUP_FORMAT = "sussplanner-semester-planner";
export const SEMESTER_PLANNER_BACKUP_VERSION = 1;

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

export function createCatalogSemesterPlannerCourse(
  course: Pick<CourseSearchResult | CourseRecord, "courseCode" | "courseName" | "creditUnits" | "schoolName">,
): SemesterPlannerCourse
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

export function createManualSemesterPlannerCourse(input: {
  courseCode: string;
  courseName: string;
  creditUnits: number;
  semesterSpan: number;
}): SemesterPlannerCourse
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

export function defaultSemesterPlannerState(): SemesterPlannerState
{
  return {
    totalCreditsGoal: DEFAULT_TOTAL_CREDITS,
    numSemesters: DEFAULT_SEMESTERS,
    courses: [],
  };
}

export function normalizeSemesterPlannerState(state: SemesterPlannerState): SemesterPlannerState
{
  const parsed = semesterPlannerStateSchema.parse(state);
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

export function serializeSemesterPlannerBackup(state: SemesterPlannerState, exportedAt = new Date())
{
  return JSON.stringify({
    format: SEMESTER_PLANNER_BACKUP_FORMAT,
    version: SEMESTER_PLANNER_BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    plan: normalizeSemesterPlannerState(state),
  }, null, 2);
}

export function parseSemesterPlannerBackup(raw: string)
{
  const backup = semesterPlannerBackupSchema.parse(JSON.parse(raw) as unknown);
  return normalizeSemesterPlannerState(backup.plan);
}

export function loadSemesterPlannerState()
{
  if (!canUseLocalStorage())
  {
    return null;
  }

  const raw = window.localStorage.getItem(SEMESTER_PLANNER_STORAGE_KEY);
  if (!raw)
  {
    return null;
  }

  try
  {
    return normalizeSemesterPlannerState(JSON.parse(raw) as SemesterPlannerState);
  }
  catch (error)
  {
    console.error("Failed to load saved semester planner state.", error);
    return null;
  }
}

export function saveSemesterPlannerState(state: SemesterPlannerState)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  const normalized = normalizeSemesterPlannerState(state);
  window.localStorage.setItem(SEMESTER_PLANNER_STORAGE_KEY, JSON.stringify(normalized));
}

export function announceSemesterPlannerUpdated()
{
  if (typeof window === "undefined")
  {
    return;
  }

  window.dispatchEvent(new CustomEvent(SEMESTER_PLANNER_UPDATED_EVENT));
}

export function upsertCatalogCourseInSemesterPlanner(
  state: SemesterPlannerState | null,
  course: Pick<CourseSearchResult | CourseRecord, "courseCode" | "courseName" | "creditUnits" | "schoolName">,
)
{
  const nextState = state ?? defaultSemesterPlannerState();
  const normalized = createCatalogSemesterPlannerCourse(course);
  const existing = nextState.courses.find((item) => item.courseCode === normalized.courseCode);

  if (existing)
  {
    return normalizeSemesterPlannerState({
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

  return normalizeSemesterPlannerState({
    ...nextState,
    courses: [...nextState.courses, normalized],
  });
}
