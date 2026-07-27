import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, optionalBool, optionalString } from "../lib/args.js";
import { loadCourseCodeFilter, matchesCourseCode, type CourseCodeFilter } from "../lib/courseCodeFilter.js";
import { parseOutputFormat, writesJson, writesSql } from "../lib/outputFormat.js";
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
  courseCodeFilter: CourseCodeFilter
): Promise<Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pdfs: Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".pdf")) continue;

    const courseCode = path.basename(entry.name, path.extname(entry.name)).trim().toUpperCase();
    if (!courseCode) continue;
    if (!matchesCourseCode(courseCode, courseCodeFilter)) continue;

    pdfs.push({ courseCode, scheduleType, pdfPath: path.join(dir, entry.name) });
  }

  return pdfs;
}

async function listCoursePdfFiles(
  pdfDir: string,
  courseCodeFilter: CourseCodeFilter,
  fallbackScheduleType: ScheduleType
): Promise<Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }>> {
  const pdfs: Array<{ courseCode: string; scheduleType: ScheduleType; pdfPath: string }> = [];

  for (const scheduleType of SCHEDULE_TYPES) {
    const subdir = path.join(pdfDir, scheduleType);
    if (await pathExists(subdir)) {
      pdfs.push(...await listPdfFilesInDir(subdir, scheduleType, courseCodeFilter));
    }
  }

  // Backwards compatibility for a flat data/input/courses/CODE.pdf layout.
  // Use --schedule-type to tell the parser what those flat PDFs represent.
  const flatEntries = await fs.readdir(pdfDir, { withFileTypes: true }).catch(() => []);
  for (const entry of flatEntries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    const courseCode = path.basename(entry.name, path.extname(entry.name)).trim().toUpperCase();
    if (!courseCode) continue;
    if (!matchesCourseCode(courseCode, courseCodeFilter)) continue;
    pdfs.push({ courseCode, scheduleType: fallbackScheduleType, pdfPath: path.join(pdfDir, entry.name) });
  }

  return pdfs.sort((a, b) =>
    a.courseCode.localeCompare(b.courseCode) || a.scheduleType.localeCompare(b.scheduleType)
  );
}

interface PdfExtractionOptions {
  jsonPath?: string;
  ocrOnCid: boolean;
  ocrOutputPath?: string;
  ocrLanguages: string;
}

interface PdfExtractionResult {
  text: string;
  warnings: string[];
  ocrUsed: boolean;
  expectedTopicCount?: number;
}

async function extractPdfWithPdfplumber(
  pdfPath: string,
  textPath: string,
  options: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  await fs.mkdir(path.dirname(textPath), { recursive: true });
  if (options.jsonPath) await fs.mkdir(path.dirname(options.jsonPath), { recursive: true });
  if (options.ocrOutputPath) await fs.mkdir(path.dirname(options.ocrOutputPath), { recursive: true });

  const args = ["tools/course_pdf_to_text.py", pdfPath, "-o", textPath];
  if (options.jsonPath) args.push("--json", options.jsonPath);
  if (options.ocrOnCid) {
    args.push("--ocr-on-cid", "--ocr-languages", options.ocrLanguages);
    if (options.ocrOutputPath) args.push("--ocr-output", options.ocrOutputPath);
  }

  try {
    const { stderr } = await execFileAsync("python3", args, { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 });
    if (stderr.trim().length > 0) {
      const extractionWarnings = stderr
        .split(/\r?\n/)
        .filter(line => !line.includes("unresolved CID glyphs remain after font repair"));
      if (extractionWarnings.length > 0) console.warn(extractionWarnings.join("\n"));
    }
  } catch (error) {
    const err = error as Error & { stderr?: string };
    const details = err.stderr?.trim() || err.message;
    throw new Error(`PDF extraction failed for ${pdfPath}: ${details}`);
  }

  const text = await fs.readFile(textPath, "utf8");
  let warnings: string[] = [];
  let ocrUsed = false;
  let expectedTopicCount: number | undefined;
  if (options.jsonPath) {
    const extractionJson = JSON.parse(await fs.readFile(options.jsonPath, "utf8")) as {
      warnings?: unknown;
      ocr?: { expectedTopicCount?: unknown };
    };
    if (Array.isArray(extractionJson.warnings)) {
      warnings = extractionJson.warnings.filter((warning): warning is string => typeof warning === "string");
    }
    ocrUsed = extractionJson.ocr !== undefined;
    if (typeof extractionJson.ocr?.expectedTopicCount === "number") {
      expectedTopicCount = extractionJson.ocr.expectedTopicCount;
    }
  }

  return { text, warnings, ocrUsed, expectedTopicCount };
}

async function validateOcrEnvironment(languages: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["tools/pdf_ocr.py", "--languages", languages],
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 }
    );
    if (stdout.trim()) console.log(stdout.trim());
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(err.stderr?.trim() || err.message);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const pdfDir = optionalString(args, "pdf-dir") ?? "data/input/courses";
  const outSql = optionalString(args, "out") ?? "data/output/courses/course-details.sql";
  const outJson = optionalString(args, "json") ?? "data/output/courses/course-details.json";
  const rawTextDir = optionalString(args, "raw-text-dir") ?? "data/output/courses/raw-text";
  const rawJsonDir = optionalString(args, "raw-json-dir") ?? "data/output/courses/pdf-json";
  const ocrOnCid = optionalBool(args, "ocr-on-cid");
  const ocrPdfDir = optionalString(args, "ocr-pdf-dir") ?? "data/output/courses/ocr-pdfs";
  const ocrLanguages = optionalString(args, "ocr-languages") ?? "eng,tam";
  const issuesOut = optionalString(args, "issues-out") ?? "data/output/courses/parse-issues.tsv";
  const format = parseOutputFormat(args);
  const fallbackScheduleTypeRaw = optionalString(args, "schedule-type") ?? "evening";
  const fallbackScheduleType: ScheduleType = isScheduleType(fallbackScheduleTypeRaw)
    ? fallbackScheduleTypeRaw
    : "evening";

  if (ocrOnCid) await validateOcrEnvironment(ocrLanguages);

  if (writesSql(format)) await fs.mkdir(path.dirname(outSql), { recursive: true });
  if (writesJson(format)) await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.mkdir(path.dirname(issuesOut), { recursive: true });

  const courseCodeFilter = await loadCourseCodeFilter(args);
  const pdfs = await listCoursePdfFiles(pdfDir, courseCodeFilter, fallbackScheduleType);

  if (pdfs.length === 0) {
    throw new Error(`No course PDFs found in ${pdfDir}${courseCodeFilter.active ? " matching the course-code filters" : ""}.`);
  }

  const results: CourseDetailParseResult[] = [];
  const skippedIssues: ParseIssue[] = [];

  for (const { courseCode, scheduleType, pdfPath } of pdfs) {
    const sourceUrl = buildCourseDetailPdfUrl(courseCode, isftForScheduleType(scheduleType));
    const textPath = path.join(rawTextDir, scheduleType, `${courseCode}.txt`);
    const jsonDumpPath = path.join(rawJsonDir, scheduleType, `${courseCode}.json`);
    const ocrOutputPath = ocrOnCid ? path.join(ocrPdfDir, scheduleType, `${courseCode}.pdf`) : undefined;

    console.log(`Parsing ${courseCode} (${scheduleType}) from ${pdfPath}`);

    try {
      const extraction = await extractPdfWithPdfplumber(pdfPath, textPath, {
        jsonPath: jsonDumpPath,
        ocrOnCid,
        ocrOutputPath,
        ocrLanguages
      });
      const extractedText = extraction.text;

      if (isNoRecordFoundText(extractedText)) {
        const issue = `No record found in course PDF for ${courseCode} (${scheduleType}); skipped.`;
        console.warn(issue);
        skippedIssues.push({ courseCode, scheduleType, severity: "warning", issue });
        continue;
      }

      const parsed = parseCourseDetailText(extractedText, {
        courseCode,
        sourceUrl,
        scheduleType,
        recoverUnbulletedTopics: extraction.ocrUsed,
        expectedTopicCount: extraction.expectedTopicCount
      });
      parsed.sourcePath = pdfPath;
      parsed.warnings.push(...extraction.warnings.filter(warning => !parsed.warnings.includes(warning)));
      results.push(parsed);

      if (parsed.warnings.length > 0) {
        console.log(`Warnings for ${courseCode} (${scheduleType}):`);
        for (const warning of parsed.warnings) console.log(`- ${warning}`);
      }
    } catch (error) {
      const message = (error as Error).message;
      if (ocrOnCid && message.includes("OCR validation error:")) {
        throw new Error(`${courseCode} (${scheduleType}): ${message}`);
      }
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

  if (writesJson(format)) await fs.writeFile(outJson, JSON.stringify(results, null, 2) + "\n", "utf8");
  if (writesSql(format)) {
    const sql = generateSql({
      courses: results.map(result => result.course),
      assessments: results.flatMap(result => result.assessments)
    });
    await fs.writeFile(outSql, sql, "utf8");
  }

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
  if (ocrOnCid) console.log(`OCR-corrected PDF copies written to: ${ocrPdfDir}`);
  if (writesSql(format)) console.log(`SQL written to: ${outSql}`);
  if (writesJson(format)) console.log(`JSON written to: ${outJson}`);
  console.log(`Issue report written to: ${issuesOut}`);
}

main().catch(error => {
  console.error((error as Error).message);
  process.exit(1);
});
