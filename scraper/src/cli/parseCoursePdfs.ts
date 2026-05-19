import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, optionalString } from "../lib/args.js";
import type { CourseDetailParseResult, ScheduleType } from "../lib/types.js";
import { buildCourseDetailPdfUrl, isNoRecordFoundText, isftForScheduleType, parseCourseDetailText } from "../parsers/courseDetailPdf.js";
import { generateSql } from "../sql/generateSql.js";

const execFileAsync = promisify(execFile);
const SCHEDULE_TYPES: ScheduleType[] = ["daytime", "evening"];

interface ParseIssue {
  courseCode: string;
  scheduleType: ScheduleType;
  severity: "warning" | "error";
  issue: string;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function chooseArray(current: unknown[] | null | undefined, candidate: unknown[] | null | undefined): unknown[] | null | undefined {
  if (!hasValue(current)) return candidate;
  if (!hasValue(candidate)) return current;
  return (candidate?.length ?? 0) > (current?.length ?? 0) ? candidate : current;
}

function chooseString(current: string | null | undefined, candidate: string | null | undefined): string | null | undefined {
  if (!hasValue(current)) return candidate;
  if (!hasValue(candidate)) return current;
  // Guard against a known bad extraction where a missing synopsis turns into the Topics section.
  if (current?.trim().startsWith("Topics:") && !candidate?.trim().startsWith("Topics:")) return candidate;
  return current;
}

function enrichCourseFieldsAcrossScheduleVariants(results: CourseDetailParseResult[]): void {
  const bestByCode = new Map<string, CourseDetailParseResult["course"]>();

  for (const result of results) {
    const code = result.course.courseCode.toUpperCase();
    const existing = bestByCode.get(code);
    if (!existing) {
      bestByCode.set(code, { ...result.course });
      continue;
    }

    bestByCode.set(code, {
      ...existing,
      courseName: chooseString(existing.courseName, result.course.courseName) ?? null,
      schoolName: chooseString(existing.schoolName, result.course.schoolName) ?? null,
      courseLevel: chooseString(existing.courseLevel, result.course.courseLevel) ?? null,
      creditUnits: hasValue(existing.creditUnits) ? existing.creditUnits : result.course.creditUnits,
      presentationPattern: chooseString(existing.presentationPattern, result.course.presentationPattern) ?? null,
      courseSynopsis: chooseString(existing.courseSynopsis, result.course.courseSynopsis) ?? null,
      courseTopics: chooseArray(existing.courseTopics, result.course.courseTopics) ?? null,
      learningOutcomes: chooseArray(existing.learningOutcomes, result.course.learningOutcomes) ?? null,
      synopsisUrl: chooseString(existing.synopsisUrl, result.course.synopsisUrl) ?? null,
      lastScrapedAt: chooseString(existing.lastScrapedAt, result.course.lastScrapedAt) ?? null
    });
  }

  for (const result of results) {
    const best = bestByCode.get(result.course.courseCode.toUpperCase());
    if (!best) continue;

    result.course = {
      ...result.course,
      courseName: chooseString(result.course.courseName, best.courseName) ?? null,
      schoolName: chooseString(result.course.schoolName, best.schoolName) ?? null,
      courseLevel: chooseString(result.course.courseLevel, best.courseLevel) ?? null,
      creditUnits: hasValue(result.course.creditUnits) ? result.course.creditUnits : best.creditUnits,
      presentationPattern: chooseString(result.course.presentationPattern, best.presentationPattern) ?? null,
      courseSynopsis: chooseString(result.course.courseSynopsis, best.courseSynopsis) ?? null,
      courseTopics: chooseArray(result.course.courseTopics, best.courseTopics) ?? null,
      learningOutcomes: chooseArray(result.course.learningOutcomes, best.learningOutcomes) ?? null
    };

    result.warnings = result.warnings.filter(w => {
      if (w.includes("Course name not confidently extracted") && hasValue(result.course.courseName)) return false;
      if (w.includes("Course synopsis section not found") && hasValue(result.course.courseSynopsis)) return false;
      if (w.includes("Course topics not found") && hasValue(result.course.courseTopics)) return false;
      if (w.includes("Learning outcomes not found") && hasValue(result.course.learningOutcomes)) return false;
      return true;
    });
  }
}


async function readOptionalCodes(filePath?: string): Promise<Set<string> | null> {
  if (!filePath) return null;
  const content = await fs.readFile(filePath, "utf8");
  return new Set(content.split(/[,\n\r\t ]+/).map(code => code.trim().toUpperCase()).filter(Boolean));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isScheduleType(value: string): value is ScheduleType {
  return value === "daytime" || value === "evening";
}

async function listPdfFilesInDir(
  dir: string,
  scheduleType: ScheduleType,
  allowedCodes: Set<string> | null
): Promise<Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pdfs: Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".pdf")) continue;

    const courseCode = path.basename(entry.name, path.extname(entry.name)).trim().toUpperCase();
    if (!courseCode) continue;
    if (allowedCodes && !allowedCodes.has(courseCode)) continue;

    pdfs.push({ courseCode, scheduleType, pdfPath: path.join(dir, entry.name) });
  }

  return pdfs;
}

async function listCoursePdfFiles(
  pdfDir: string,
  allowedCodes: Set<string> | null,
  fallbackScheduleType: ScheduleType
): Promise<Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }>> {
  const pdfs: Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }> = [];

  for (const scheduleType of SCHEDULE_TYPES) {
    const subdir = path.join(pdfDir, scheduleType);
    if (await pathExists(subdir)) {
      pdfs.push(...await listPdfFilesInDir(subdir, scheduleType, allowedCodes));
    }
  }

  // Backwards compatibility for older flat data/input/course-pdfs/CODE.pdf layout.
  // Use --schedule-type to tell the parser what those flat PDFs represent.
  const flatEntries = await fs.readdir(pdfDir, { withFileTypes: true }).catch(() => []);
  for (const entry of flatEntries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    const courseCode = path.basename(entry.name, path.extname(entry.name)).trim().toUpperCase();
    if (!courseCode) continue;
    if (allowedCodes && !allowedCodes.has(courseCode)) continue;
    pdfs.push({ courseCode, scheduleType: fallbackScheduleType, pdfPath: path.join(pdfDir, entry.name) });
  }

  return pdfs.sort((a, b) =>
    a.courseCode.localeCompare(b.courseCode) || a.scheduleType.localeCompare(b.scheduleType)
  );
}

async function extractPdfWithPdfplumber(pdfPath: string, textPath: string, jsonPath?: string): Promise<string> {
  await fs.mkdir(path.dirname(textPath), { recursive: true });
  if (jsonPath) await fs.mkdir(path.dirname(jsonPath), { recursive: true });

  const args = ["tools/course_pdf_to_text.py", pdfPath, "-o", textPath];
  if (jsonPath) args.push("--json", jsonPath);

  try {
    await execFileAsync("python3", args, { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 });
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(
      `pdfplumber extraction failed for ${pdfPath}. Run 'pip install -r requirements.txt'. ${err.stderr ?? err.message}`
    );
  }

  return fs.readFile(textPath, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const pdfDir = optionalString(args, "pdf-dir") ?? "data/input/course-pdfs";
  const codesFile = optionalString(args, "codes-file");
  const outSql = optionalString(args, "out") ?? "data/output/course-details-import.sql";
  const outJson = optionalString(args, "json") ?? "data/output/course-details-parsed.json";
  const rawTextDir = optionalString(args, "raw-text-dir") ?? "data/output/course-raw-text";
  const rawJsonDir = optionalString(args, "raw-json-dir") ?? "data/output/course-pdf-json";
  const issuesOut = optionalString(args, "issues-out") ?? "data/output/course-parse-issues.tsv";
  const fallbackScheduleTypeRaw = optionalString(args, "schedule-type") ?? "evening";
  const fallbackScheduleType: ScheduleType = isScheduleType(fallbackScheduleTypeRaw)
    ? fallbackScheduleTypeRaw
    : "evening";

  await fs.mkdir(path.dirname(outSql), { recursive: true });
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.mkdir(path.dirname(issuesOut), { recursive: true });

  const allowedCodes = await readOptionalCodes(codesFile);
  const pdfs = await listCoursePdfFiles(pdfDir, allowedCodes, fallbackScheduleType);

  if (pdfs.length === 0) {
    throw new Error(`No course PDFs found in ${pdfDir}${codesFile ? ` matching ${codesFile}` : ""}.`);
  }

  const results: CourseDetailParseResult[] = [];
  const skippedIssues: ParseIssue[] = [];

  for (const { courseCode, scheduleType, pdfPath } of pdfs) {
    const sourceUrl = buildCourseDetailPdfUrl(courseCode, isftForScheduleType(scheduleType));
    const textPath = path.join(rawTextDir, scheduleType, `${courseCode}.txt`);
    const jsonDumpPath = path.join(rawJsonDir, scheduleType, `${courseCode}.json`);

    console.log(`Parsing ${courseCode} (${scheduleType}) from ${pdfPath}`);

    try {
      const extractedText = await extractPdfWithPdfplumber(pdfPath, textPath, jsonDumpPath);

      if (isNoRecordFoundText(extractedText)) {
        const issue = `No record found in course PDF for ${courseCode} (${scheduleType}); skipped.`;
        console.warn(issue);
        skippedIssues.push({ courseCode, scheduleType, severity: "warning", issue });
        continue;
      }

      const parsed = parseCourseDetailText(extractedText, { courseCode, sourceUrl, scheduleType });
      parsed.sourcePath = pdfPath;
      results.push(parsed);

      if (parsed.warnings.length > 0) {
        console.log(`Warnings for ${courseCode} (${scheduleType}):`);
        for (const warning of parsed.warnings) console.log(`- ${warning}`);
      }
    } catch (error) {
      const message = (error as Error).message;
      console.error(`Failed to parse ${courseCode} (${scheduleType}): ${message}`);
      results.push({
        course: { courseCode, synopsisUrl: sourceUrl, lastScrapedAt: new Date().toISOString() },
        scheduleType,
        sourcePath: pdfPath,
        sourceUrl,
        assessments: [],
        warnings: [`Failed to parse: ${message}`]
      });
    }
  }

  enrichCourseFieldsAcrossScheduleVariants(results);

  const sql = generateSql({
    courses: results.map(result => result.course),
    assessments: results.flatMap(result => result.assessments)
  });

  await fs.writeFile(outJson, JSON.stringify(results, null, 2), "utf8");
  await fs.writeFile(outSql, sql, "utf8");

  const issueLines = ["course_code\tschedule_type\tseverity\tissue"];
  for (const result of results) {
    for (const warning of result.warnings) {
      const severity = warning.includes("skipped") || warning.startsWith("Failed to parse") ? "error" : "warning";
      issueLines.push([
        result.course.courseCode,
        result.scheduleType ?? "",
        severity,
        warning.replace(/\s+/g, " ").trim()
      ].join("\t"));
    }
  }
  await fs.writeFile(issuesOut, issueLines.join("\n") + "\n", "utf8");

  const assessmentCount = results.flatMap(result => result.assessments).length;
  const failedCount = results.filter(result => result.warnings.some(w => w.startsWith("Failed to parse"))).length;
  const daytimeCount = results.filter(result => result.scheduleType === "daytime").length;
  const eveningCount = results.filter(result => result.scheduleType === "evening").length;

  console.log(`Parsed course PDFs: ${results.length}`);
  console.log(`Daytime PDFs parsed: ${daytimeCount}`);
  console.log(`Evening PDFs parsed: ${eveningCount}`);
  console.log(`Failed parses: ${failedCount}`);
  console.log(`Parsed assessment components: ${assessmentCount}`);
  console.log(`SQL written to: ${outSql}`);
  console.log(`JSON written to: ${outJson}`);
  console.log(`Issue report written to: ${issuesOut}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
