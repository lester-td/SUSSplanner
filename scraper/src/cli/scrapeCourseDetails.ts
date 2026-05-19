import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs, optionalBool, optionalString } from "../lib/args.js";
import { downloadPdf } from "../lib/pdf.js";
import type { CourseDetailParseResult } from "../lib/types.js";
import { buildCourseDetailPdfUrl, parseCourseDetailText } from "../parsers/courseDetailPdf.js";
import { generateSql } from "../sql/generateSql.js";

const execFileAsync = promisify(execFile);

async function readCodes(args: Record<string, string | boolean>): Promise<string[]> {
  const codesInline = optionalString(args, "codes");
  const codesFile = optionalString(args, "codes-file") ?? "data/output/course-codes.txt";

  if (codesInline) {
    return codesInline.split(",").map(code => code.trim().toUpperCase()).filter(Boolean);
  }

  const content = await fs.readFile(codesFile, "utf8");
  return content.split(/[,\n\r\t ]+/).map(code => code.trim().toUpperCase()).filter(Boolean);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractPdfWithPdfplumber(pdfPath: string, textPath: string, jsonPath: string): Promise<string> {
  await fs.mkdir(path.dirname(textPath), { recursive: true });
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });

  await execFileAsync("python3", ["tools/course_pdf_to_text.py", pdfPath, "-o", textPath, "--json", jsonPath], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20
  });

  return fs.readFile(textPath, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const outSql = optionalString(args, "out") ?? "data/output/course-details-import.sql";
  const outJson = optionalString(args, "json") ?? "data/output/course-details-parsed.json";
  const pdfDir = optionalString(args, "pdf-dir") ?? "data/input/course-pdfs";
  const rawTextDir = optionalString(args, "raw-text-dir") ?? "data/output/course-raw-text";
  const rawJsonDir = optionalString(args, "raw-json-dir") ?? "data/output/course-pdf-json";
  const force = optionalBool(args, "force");
  const delayMs = Number(optionalString(args, "delay-ms") ?? "250");

  await fs.mkdir(path.dirname(outSql), { recursive: true });
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.mkdir(pdfDir, { recursive: true });

  const courseCodes = [...new Set(await readCodes(args))].sort();
  const results: CourseDetailParseResult[] = [];

  for (const courseCode of courseCodes) {
    const url = buildCourseDetailPdfUrl(courseCode);
    const pdfPath = path.join(pdfDir, `${courseCode}.pdf`);
    const textPath = path.join(rawTextDir, `${courseCode}.txt`);
    const jsonDumpPath = path.join(rawJsonDir, `${courseCode}.json`);

    try {
      if (force || !(await fileExists(pdfPath))) {
        console.log(`Downloading ${courseCode} from ${url}`);
        const buffer = await downloadPdf(url);
        await fs.writeFile(pdfPath, buffer);
        if (delayMs > 0) await sleep(delayMs);
      } else {
        console.log(`Using existing PDF for ${courseCode}: ${pdfPath}`);
      }

      const text = await extractPdfWithPdfplumber(pdfPath, textPath, jsonDumpPath);
      const parsed = parseCourseDetailText(text, { courseCode, sourceUrl: url });
      results.push(parsed);

      if (parsed.warnings.length > 0) {
        console.log(`Warnings for ${courseCode}:`);
        for (const warning of parsed.warnings) console.log(`- ${warning}`);
      }
    } catch (error) {
      const message = (error as Error).message;
      console.error(`Failed to scrape ${courseCode}: ${message}`);
      results.push({
        course: { courseCode, synopsisUrl: url, lastScrapedAt: new Date().toISOString() },
        assessments: [],
        warnings: [`Failed to scrape: ${message}`]
      });
    }
  }

  const sql = generateSql({
    courses: results.map(result => result.course),
    assessments: results.flatMap(result => result.assessments)
  });

  await fs.writeFile(outJson, JSON.stringify(results, null, 2), "utf8");
  await fs.writeFile(outSql, sql, "utf8");

  console.log(`Scraped course details: ${results.length}`);
  console.log(`Parsed assessment components: ${results.flatMap(result => result.assessments).length}`);
  console.log(`SQL written to: ${outSql}`);
  console.log(`JSON written to: ${outJson}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
