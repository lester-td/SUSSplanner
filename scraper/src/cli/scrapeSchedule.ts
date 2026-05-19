import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, requireString } from "../lib/args.js";
import type { ScheduleType } from "../lib/types.js";
import { parseScheduleCsv } from "../parsers/scheduleCsv.js";
import { generateSql } from "../sql/generateSql.js";

const execFileAsync = promisify(execFile);

function validateScheduleType(value: string): ScheduleType {
  if (value === "daytime" || value === "evening") return value;
  throw new Error("--schedule-type must be either 'daytime' or 'evening'");
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

async function main(): Promise<void> {
  const args = parseArgs();
  const scheduleType = validateScheduleType(requireString(args, "schedule-type"));
  const outSql = typeof args.out === "string" ? args.out : "data/output/schedule-import.sql";
  const outJson = typeof args.json === "string" ? args.json : "data/output/schedule-parsed.json";
  const csvPath = typeof args.csv === "string" ? args.csv : null;
  const pdfPath = typeof args.pdf === "string" ? args.pdf : null;

  if (!csvPath && !pdfPath) {
    throw new Error("Provide either --pdf path/to/schedule.pdf or --csv path/to/extracted.csv");
  }

  await fs.mkdir(path.dirname(outSql), { recursive: true });
  await fs.mkdir(path.dirname(outJson), { recursive: true });

  const finalCsvPath = csvPath ?? path.join("data/output/extracted-csv", path.basename(pdfPath!).replace(/\.pdf$/i, ".csv"));
  await fs.mkdir(path.dirname(finalCsvPath), { recursive: true });

  if (!csvPath && pdfPath) {
    await extractPdfTableToCsv(pdfPath, finalCsvPath);
  }

  const csvText = await fs.readFile(finalCsvPath, "utf8");
  const result = parseScheduleCsv(csvText, scheduleType);
  const sql = generateSql({
    semesters: result.semesters,
    courses: result.courses,
    classes: result.classes,
    classEvents: result.classEvents
  });

  await fs.writeFile(outJson, JSON.stringify(result, null, 2), "utf8");
  await fs.writeFile(outSql, sql, "utf8");

  console.log(`Parsed semesters: ${result.semesters.length}`);
  console.log(`Parsed courses: ${result.courses.length}`);
  console.log(`Parsed classes: ${result.classes.length}`);
  console.log(`Parsed class events: ${result.classEvents.length}`);
  console.log(`Extracted/used CSV: ${finalCsvPath}`);
  console.log(`SQL written to: ${outSql}`);
  console.log(`JSON written to: ${outJson}`);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
