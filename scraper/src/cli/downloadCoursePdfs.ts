import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, optionalBool, optionalString } from "../lib/args.js";
import type { ScheduleType } from "../lib/types.js";
import { buildCourseDetailPdfUrl, isftForScheduleType } from "../parsers/courseDetailPdf.js";

interface VariantDownloadResult {
  courseCode: string;
  scheduleType: ScheduleType;
  url: string;
  pdfPath: string;
  status: "downloaded" | "skipped" | "not_found" | "failed";
  error?: string;
}

interface CourseDownloadReportRow {
  courseCode: string;
  daytime: boolean;
  evening: boolean;
  daytimeStatus: string;
  eveningStatus: string;
}

const VARIANTS: Array<{ scheduleType: ScheduleType; isft: 0 | 1 }> = [
  { scheduleType: "daytime", isft: 1 },
  { scheduleType: "evening", isft: 0 }
];

async function readCodes(args: Record<string, string | boolean>): Promise<string[]> {
  const codesInline = optionalString(args, "codes");
  const codesFile = optionalString(args, "codes-file") ?? "data/output/course-codes.txt";

  if (codesInline) {
    return codesInline.split(",").map(code => code.trim().toUpperCase()).filter(Boolean);
  }

  const content = await fs.readFile(codesFile, "utf8");
  return content.split(/[,\n\r\t ]+/).map(code => code.trim().toUpperCase()).filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

async function readExistingPdfStatus(filePath: string): Promise<"missing" | "valid" | "invalid"> {
  try {
    const buffer = await fs.readFile(filePath);
    return looksLikePdf(buffer) ? "valid" : "invalid";
  } catch {
    return "missing";
  }
}

async function fetchPdf(url: string): Promise<{ status: "ok" | "not_found" | "failed"; buffer?: Buffer; reason?: string }> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SUSS timetable planner scraper; +local-dev)",
        "Accept": "application/pdf,text/html;q=0.9,*/*;q=0.8"
      }
    });
  } catch (error) {
    return { status: "failed", reason: (error as Error).message };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    return { status: "failed", reason: `HTTP ${response.status} ${response.statusText}` };
  }

  if (!looksLikePdf(buffer)) {
    const reason = contentType.toLowerCase().includes("html")
      ? `HTML response (${contentType || "unknown content-type"})`
      : `Non-PDF response (${contentType || "unknown content-type"})`;
    return { status: "not_found", reason };
  }

  // The SUSS endpoint can return a tiny valid PDF containing only "No Record Found".
  // Real course PDFs are much larger; do not save these placeholder PDFs as course data.
  if (buffer.length < 5_000) {
    return { status: "not_found", reason: `PDF is only ${buffer.length} bytes; likely No Record Found placeholder` };
  }

  return { status: "ok", buffer };
}

async function downloadVariant(
  courseCode: string,
  scheduleType: ScheduleType,
  outDir: string,
  force: boolean
): Promise<VariantDownloadResult> {
  const isft = isftForScheduleType(scheduleType);
  const url = buildCourseDetailPdfUrl(courseCode, isft);
  const pdfDir = path.join(outDir, scheduleType);
  const pdfPath = path.join(pdfDir, `${courseCode}.pdf`);

  await fs.mkdir(pdfDir, { recursive: true });

  const existingStatus = await readExistingPdfStatus(pdfPath);
  if (!force && existingStatus === "valid") {
    return { courseCode, scheduleType, url, pdfPath, status: "skipped" };
  }

  if (existingStatus === "invalid") {
    console.warn(`Existing file is not a valid PDF, replacing if download succeeds: ${pdfPath}`);
  }

  const fetched = await fetchPdf(url);

  if (fetched.status === "ok" && fetched.buffer) {
    await fs.writeFile(pdfPath, fetched.buffer);
    return { courseCode, scheduleType, url, pdfPath, status: "downloaded" };
  }

  return {
    courseCode,
    scheduleType,
    url,
    pdfPath,
    status: fetched.status === "failed" ? "failed" : "not_found",
    error: fetched.reason
  };
}

function buildReportRows(courseCodes: string[], results: VariantDownloadResult[]): CourseDownloadReportRow[] {
  const byCourse = new Map<string, VariantDownloadResult[]>();
  for (const result of results) {
    const existing = byCourse.get(result.courseCode) ?? [];
    existing.push(result);
    byCourse.set(result.courseCode, existing);
  }

  return courseCodes.map(courseCode => {
    const items = byCourse.get(courseCode) ?? [];
    const daytime = items.find(item => item.scheduleType === "daytime");
    const evening = items.find(item => item.scheduleType === "evening");
    const isAvailable = (item: VariantDownloadResult | undefined): boolean =>
      item?.status === "downloaded" || item?.status === "skipped";

    return {
      courseCode,
      daytime: isAvailable(daytime),
      evening: isAvailable(evening),
      daytimeStatus: daytime?.status ?? "not_run",
      eveningStatus: evening?.status ?? "not_run"
    };
  });
}

function formatReport(rows: CourseDownloadReportRow[]): string {
  const header = ["course_code", "daytime", "evening"].join("\t");
  const body = rows.map(row => [row.courseCode, row.daytime ? "✓" : "", row.evening ? "✓" : ""].join("\t"));
  return [header, ...body].join("\n") + "\n";
}

async function main(): Promise<void> {
  const args = parseArgs();
  const outDir = optionalString(args, "out-dir") ?? "data/input/course-pdfs";
  const manifestOut = optionalString(args, "manifest-out") ?? "data/output/course-pdf-downloads.json";
  const reportOut = optionalString(args, "report-out") ?? "data/output/course-pdf-download-report.tsv";
  const force = optionalBool(args, "force");
  const delayMs = Number(optionalString(args, "delay-ms") ?? "250");

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(manifestOut), { recursive: true });
  await fs.mkdir(path.dirname(reportOut), { recursive: true });

  const courseCodes = [...new Set(await readCodes(args))].sort();
  const results: VariantDownloadResult[] = [];

  for (const courseCode of courseCodes) {
    for (const variant of VARIANTS) {
      const url = buildCourseDetailPdfUrl(courseCode, variant.isft);
      console.log(`Downloading ${courseCode} (${variant.scheduleType}) from ${url}`);

      const result = await downloadVariant(courseCode, variant.scheduleType, outDir, force);
      results.push(result);

      if (result.status === "downloaded") {
        console.log(`Saved ${courseCode} (${variant.scheduleType}) to ${result.pdfPath}`);
      } else if (result.status === "skipped") {
        console.log(`Skipping ${courseCode} (${variant.scheduleType}); valid PDF already exists at ${result.pdfPath}`);
      } else {
        console.warn(`No valid PDF for ${courseCode} (${variant.scheduleType}): ${result.error ?? result.status}`);
      }

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const reportRows = buildReportRows(courseCodes, results);
  const reportText = formatReport(reportRows);

  await fs.writeFile(manifestOut, JSON.stringify(results, null, 2), "utf8");
  await fs.writeFile(reportOut, reportText, "utf8");

  const counts = results.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\nDownload availability report:");
  console.log(reportText.trimEnd());
  console.log("\nSummary:");
  console.log(`Course codes processed: ${courseCodes.length}`);
  console.log(`Downloaded: ${counts.downloaded ?? 0}`);
  console.log(`Skipped existing valid PDFs: ${counts.skipped ?? 0}`);
  console.log(`No PDF / HTML response: ${counts.not_found ?? 0}`);
  console.log(`Failed: ${counts.failed ?? 0}`);
  console.log(`Download JSON written to: ${manifestOut}`);
  console.log(`Download report written to: ${reportOut}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
