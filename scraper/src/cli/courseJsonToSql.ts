import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, optionalString, requireString } from "../lib/args.js";
import type { AssessmentComponentRecord, CourseDetailParseResult, CourseRecord, ScheduleType } from "../lib/types.js";
import { generateSql } from "../sql/generateSql.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseScheduleType(value: unknown): ScheduleType | null {
  if (value === "daytime" || value === "evening") return value;
  return null;
}

function asCourseDetailResults(json: unknown): CourseDetailParseResult[] {
  if (Array.isArray(json)) {
    return json as CourseDetailParseResult[];
  }

  if (isObject(json)) {
    if (Array.isArray(json.results)) return json.results as CourseDetailParseResult[];
    if (Array.isArray(json.courses)) return json.courses as CourseDetailParseResult[];
    if (Array.isArray(json.items)) return json.items as CourseDetailParseResult[];
  }

  throw new Error(
    "Unsupported course detail JSON format. Expected an array, or an object with results/courses/items array."
  );
}

function hasUsableCourse(course: CourseRecord | null | undefined): course is CourseRecord {
  return Boolean(course?.courseCode && course.courseCode.trim().length > 0);
}

function assessmentKey(assessment: AssessmentComponentRecord): string {
  return `${assessment.courseCode.toUpperCase()}#${assessment.scheduleType}`;
}

function validateAndFilterAssessments(
  assessments: AssessmentComponentRecord[]
): {
  assessments: AssessmentComponentRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const grouped = new Map<string, AssessmentComponentRecord[]>();

  for (const assessment of assessments) {
    const scheduleType = normaliseScheduleType(assessment.scheduleType);

    if (!assessment.courseCode || !scheduleType) {
      warnings.push(
        `Skipping assessment with missing course_code or invalid schedule_type: ${JSON.stringify(assessment)}`
      );
      continue;
    }

    const normalised: AssessmentComponentRecord = {
      ...assessment,
      courseCode: assessment.courseCode.toUpperCase(),
      scheduleType
    };

    const key = assessmentKey(normalised);
    const list = grouped.get(key) ?? [];
    list.push(normalised);
    grouped.set(key, list);
  }

  const valid: AssessmentComponentRecord[] = [];

  for (const [key, list] of grouped.entries()) {
    const total = list.reduce((sum, item) => sum + Number(item.weightPercentage ?? 0), 0);

    // Assessment rows are only safe to import when the full strategy totals 100.
    // If not, skip the whole course/schedule assessment block so good existing rows are not wiped.
    if (Math.abs(total - 100) > 0.001) {
      warnings.push(`Skipping assessment import for ${key}; parsed total is ${total}, not 100.`);
      continue;
    }

    valid.push(...list.sort((a, b) => a.sortOrder - b.sortOrder));
  }

  return { assessments: valid, warnings };
}

async function main(): Promise<void> {
  const args = parseArgs();

  const jsonPath = requireString(args, "json");
  const outPath = optionalString(args, "out") ?? "data/output/course-details-import.sql";
  const issuesOut = optionalString(args, "issues-out");

  const raw = await fs.readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const results = asCourseDetailResults(parsed);

  const courses: CourseRecord[] = [];
  const assessments: AssessmentComponentRecord[] = [];
  const issues: string[] = ["course_code\tschedule_type\tseverity\tissue_type\tdetails"];

  for (const result of results) {
    const course = result.course;
    const scheduleType = normaliseScheduleType(result.scheduleType);

    if (!hasUsableCourse(course)) {
      issues.push(
        `UNKNOWN\t${scheduleType ?? "UNKNOWN"}\terror\tmissing_course_code\tResult has no usable course.courseCode`
      );
      continue;
    }

    courses.push({
      ...course,
      courseCode: course.courseCode.toUpperCase()
    });

    for (const warning of result.warnings ?? []) {
      issues.push(
        `${course.courseCode.toUpperCase()}\t${scheduleType ?? "UNKNOWN"}\twarning\tparser_warning\t${String(warning).replace(/\t/g, " ")}`
      );
    }

    for (const assessment of result.assessments ?? []) {
      assessments.push({
        ...assessment,
        courseCode: assessment.courseCode.toUpperCase()
      });
    }
  }

  const filtered = validateAndFilterAssessments(assessments);
  for (const warning of filtered.warnings) {
    issues.push(`UNKNOWN\tUNKNOWN\twarning\tassessment_validation\t${warning.replace(/\t/g, " ")}`);
  }

  const sql = generateSql({
    courses,
    assessments: filtered.assessments,
    includeTransaction: true
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, sql, "utf8");

  if (issuesOut) {
    await fs.mkdir(path.dirname(issuesOut), { recursive: true });
    await fs.writeFile(issuesOut, issues.join("\n") + "\n", "utf8");
  }

  console.log(`Read course detail JSON entries: ${results.length}`);
  console.log(`Courses prepared for SQL: ${courses.length}`);
  console.log(`Assessment rows prepared for SQL: ${filtered.assessments.length}`);
  console.log(`SQL written to: ${outPath}`);
  if (issuesOut) console.log(`Issues written to: ${issuesOut}`);

  if (filtered.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of filtered.warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
