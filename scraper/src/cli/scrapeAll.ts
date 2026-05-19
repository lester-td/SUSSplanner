import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, requireString } from "../lib/args.js";
import type { ScheduleParseResult, ScheduleType } from "../lib/types.js";
import { parseScheduleCsv } from "../parsers/scheduleCsv.js";
import { generateSql } from "../sql/generateSql.js";

const execFileAsync = promisify(execFile);

interface ScheduleManifestItem {
  pdf?: string;
  csv?: string;
  scheduleType: ScheduleType;
}

interface ScheduleManifest {
  schedules: ScheduleManifestItem[];
}

function emptyResult(): ScheduleParseResult {
  return { semesters: [], courses: [], classes: [], classEvents: [], warnings: [] };
}

function mergeResults(results: ScheduleParseResult[]): ScheduleParseResult {
  const merged = emptyResult();
  const semesterMap = new Map<string, typeof merged.semesters[number]>();
  const courseMap = new Map<string, typeof merged.courses[number]>();
  const classMap = new Map<string, typeof merged.classes[number]>();

  for (const result of results) {
    for (const semester of result.semesters) {
      semesterMap.set(`${semester.academicYear}#${semester.semesterNo}`, semester);
    }
    for (const course of result.courses) {
      const existing = courseMap.get(course.courseCode);
      courseMap.set(course.courseCode, { ...existing, ...course });
    }
    for (const klass of result.classes) {
      classMap.set(`${klass.courseCode}#${klass.academicYear}#${klass.semesterNo}#${klass.scheduleType}#${klass.groupCodeType}#${klass.groupCode}`, klass);
    }
    merged.classEvents.push(...result.classEvents);
    merged.warnings.push(...result.warnings);
  }

  merged.semesters = [...semesterMap.values()];
  merged.courses = [...courseMap.values()];
  merged.classes = [...classMap.values()];
  return merged;
}

async function extractPdfTableToCsv(pdfPath: string, csvPath: string): Promise<void> {
  try {
    await execFileAsync("python3", ["tools/pdf_table_to_csv.py", pdfPath, "-o", csvPath], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 20
    });
  } catch (error) {
    throw new Error(
      `Failed to extract tables from ${pdfPath}. Make sure Python and pdfplumber are installed. Run: pip install pdfplumber\n` +
        String((error as Error).message)
    );
  }
}

async function getCsvForManifestItem(item: ScheduleManifestItem, csvDir: string): Promise<string> {
  if (item.csv) return item.csv;
  if (!item.pdf) throw new Error("Each manifest item must have either 'pdf' or 'csv'.");

  const csvPath = path.join(csvDir, path.basename(item.pdf).replace(/\.pdf$/i, ".csv"));
  await extractPdfTableToCsv(item.pdf, csvPath);
  return csvPath;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const manifestPath = requireString(args, "manifest");
  const outSql = typeof args.out === "string" ? args.out : "data/output/schedule-batch-import.sql";
  const outJson = typeof args.json === "string" ? args.json : "data/output/schedule-batch-parsed.json";
  const courseCodesOut =
    typeof args["course-codes-out"] === "string" ? args["course-codes-out"] : "data/output/course-codes.txt";
  const csvDir = typeof args["csv-dir"] === "string" ? args["csv-dir"] : "data/output/extracted-csv";

  await fs.mkdir(path.dirname(outSql), { recursive: true });
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.mkdir(path.dirname(courseCodesOut), { recursive: true });
  await fs.mkdir(csvDir, { recursive: true });

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ScheduleManifest;
  const results: ScheduleParseResult[] = [];

  for (const item of manifest.schedules) {
    const source = item.pdf ?? item.csv;
    console.log(`Parsing ${source} (${item.scheduleType})...`);
    const csvPath = await getCsvForManifestItem(item, csvDir);
    const csvText = await fs.readFile(csvPath, "utf8");
    results.push(parseScheduleCsv(csvText, item.scheduleType));
  }

  const merged = mergeResults(results);
  const sql = generateSql({
    semesters: merged.semesters,
    courses: merged.courses,
    classes: merged.classes,
    classEvents: merged.classEvents
  });

  await fs.writeFile(outJson, JSON.stringify(merged, null, 2), "utf8");
  await fs.writeFile(outSql, sql, "utf8");
  await fs.writeFile(courseCodesOut, merged.courses.map(course => course.courseCode).sort().join("\n") + "\n", "utf8");

  console.log(`Parsed semesters: ${merged.semesters.length}`);
  console.log(`Parsed courses: ${merged.courses.length}`);
  console.log(`Parsed classes: ${merged.classes.length}`);
  console.log(`Parsed class events: ${merged.classEvents.length}`);
  console.log(`SQL written to: ${outSql}`);
  console.log(`Course codes written to: ${courseCodesOut}`);
  console.log(`Extracted CSV files written to: ${csvDir}`);

  if (merged.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of merged.warnings) console.log(`- ${warning}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
