import fs from "node:fs/promises";
import { optionalString } from "./args.js";
import type { ScheduleParseResult } from "./types.js";

type CliArgs = Record<string, string | boolean>;

export interface CourseCodeFilter {
  exactCodes: Set<string>;
  prefixes: string[];
  active: boolean;
}

export function parseCourseCodes(value: string): string[] {
  return value
    .split(/[,\n\r\t ]+/)
    .map(code => code.trim().toUpperCase())
    .filter(Boolean);
}

export function parseCourseCodePrefixes(value: string): string[] {
  return parseCourseCodes(value);
}

export async function readCourseCodesFile(filePath: string): Promise<string[]> {
  return parseCourseCodes(await fs.readFile(filePath, "utf8"));
}

export async function loadCourseCodeFilter(
  args: CliArgs,
  options: { includeCodesFile?: boolean } = {}
): Promise<CourseCodeFilter> {
  const exactCodes = new Set(parseCourseCodes(optionalString(args, "codes") ?? ""));
  const prefixes = [...new Set(parseCourseCodePrefixes(optionalString(args, "code-prefix") ?? ""))];
  const codesFile = optionalString(args, "codes-file");

  if (options.includeCodesFile !== false && codesFile) {
    for (const code of await readCourseCodesFile(codesFile)) exactCodes.add(code);
  }

  return {
    exactCodes,
    prefixes,
    active: exactCodes.size > 0 || prefixes.length > 0
  };
}

export function matchesCourseCode(courseCode: string, filter: CourseCodeFilter): boolean {
  if (!filter.active) return true;
  const normalized = courseCode.trim().toUpperCase();
  return filter.exactCodes.has(normalized) || filter.prefixes.some(prefix => normalized.startsWith(prefix));
}

export function filterCourseCodes(courseCodes: string[], filter: CourseCodeFilter): string[] {
  return [...new Set(courseCodes.map(code => code.trim().toUpperCase()).filter(Boolean))]
    .filter(code => matchesCourseCode(code, filter))
    .sort();
}

export async function resolveInputCourseCodes(args: CliArgs, defaultCodesFile: string): Promise<string[]> {
  const inlineCodes = parseCourseCodes(optionalString(args, "codes") ?? "");
  const prefixes = parseCourseCodePrefixes(optionalString(args, "code-prefix") ?? "");

  // Preserve the existing behavior where --codes is self-contained and does not
  // require the default codes file to exist.
  if (inlineCodes.length > 0 && prefixes.length === 0) {
    return [...new Set(inlineCodes)].sort();
  }

  const codesFile = optionalString(args, "codes-file") ?? defaultCodesFile;
  const candidates = [...await readCourseCodesFile(codesFile), ...inlineCodes];
  const filter = await loadCourseCodeFilter(args, { includeCodesFile: false });
  return filterCourseCodes(candidates, filter);
}

export function filterScheduleResult(
  result: ScheduleParseResult,
  filter: CourseCodeFilter
): ScheduleParseResult {
  if (!filter.active) return result;

  const courses = result.courses.filter(course => matchesCourseCode(course.courseCode, filter));
  const classes = result.classes.filter(klass => matchesCourseCode(klass.courseCode, filter));
  const classEvents = result.classEvents.filter(event => matchesCourseCode(event.courseCode, filter));
  const usedSemesters = new Set([
    ...classes.map(klass => `${klass.academicYear}#${klass.semesterNo}`),
    ...classEvents.map(event => `${event.academicYear}#${event.semesterNo}`)
  ]);
  const semesters = result.semesters.filter(semester =>
    usedSemesters.has(`${semester.academicYear}#${semester.semesterNo}`)
  );

  return { ...result, semesters, courses, classes, classEvents };
}
