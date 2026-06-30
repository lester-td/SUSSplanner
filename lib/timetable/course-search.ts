import type { ScheduleType } from "./types";

export type CourseSearchFilters = {
  q: string;
  semesterIds: number[];
  scheduleTypes: ScheduleType[];
  undergraduateOnly: boolean;
  postgraduateOnly: boolean;
  availableAsGspOnly: boolean;
  assessmentModes: string[];
  schoolNames: string[];
  courseLevels: string[];
};

type SearchInput = URLSearchParams | Record<string, string | string[] | undefined>;

function unique<T>(values: T[])
{
  return [...new Set(values)];
}

function readAll(input: SearchInput, key: string)
{
  if (input instanceof URLSearchParams)
  {
    return input.getAll(key);
  }

  const value = input[key];
  if (Array.isArray(value))
  {
    return value;
  }

  return typeof value === "string" ? [value] : [];
}

function readFirst(input: SearchInput, key: string)
{
  return readAll(input, key)[0];
}

function parsePositiveInt(value: string)
{
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTextList(values: string[])
{
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

function normalizeScheduleTypes(values: string[])
{
  return unique(values.filter((value): value is ScheduleType => value === "daytime" || value === "evening"));
}

export function parseCourseSearchFilters(input: SearchInput): CourseSearchFilters
{
  const q = (readFirst(input, "q") ?? "").trim().slice(0, 120);

  return {
    q,
    semesterIds: unique(readAll(input, "semesterIds").map(parsePositiveInt).filter((value): value is number => value !== null)),
    scheduleTypes: normalizeScheduleTypes(readAll(input, "scheduleTypes")),
    undergraduateOnly: readAll(input, "undergraduateOnly").length > 0,
    postgraduateOnly: readAll(input, "postgraduateOnly").length > 0,
    availableAsGspOnly: readAll(input, "availableAsGspOnly").length > 0,
    assessmentModes: normalizeTextList(readAll(input, "assessmentModes")),
    schoolNames: normalizeTextList(readAll(input, "schools")),
    courseLevels: normalizeTextList(readAll(input, "courseLevels")),
  };
}

export function buildCourseSearchParams(filters: Partial<CourseSearchFilters>)
{
  const params = new URLSearchParams();

  if (filters.q?.trim())
  {
    params.set("q", filters.q.trim());
  }

  for (const semesterId of filters.semesterIds ?? [])
  {
    params.append("semesterIds", String(semesterId));
  }

  for (const scheduleType of filters.scheduleTypes ?? [])
  {
    params.append("scheduleTypes", scheduleType);
  }

  if (filters.undergraduateOnly)
  {
    params.set("undergraduateOnly", "1");
  }

  if (filters.postgraduateOnly)
  {
    params.set("postgraduateOnly", "1");
  }

  if (filters.availableAsGspOnly)
  {
    params.set("availableAsGspOnly", "1");
  }

  for (const assessmentMode of filters.assessmentModes ?? [])
  {
    params.append("assessmentModes", assessmentMode);
  }

  for (const schoolName of filters.schoolNames ?? [])
  {
    params.append("schools", schoolName);
  }

  for (const courseLevel of filters.courseLevels ?? [])
  {
    params.append("courseLevels", courseLevel);
  }

  return params;
}

export function extractCourseLevelNumber(courseLevel: string | null)
{
  const match = courseLevel?.match(/([1-6])/);
  return match ? Number(match[1]) : null;
}
