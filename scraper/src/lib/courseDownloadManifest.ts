import fs from "node:fs/promises";
import path from "node:path";
import { matchesCourseCode, type CourseCodeFilter } from "./courseCodeFilter.js";
import type { ScheduleType } from "./types.js";

export interface VariantDownloadResult {
  courseCode: string;
  scheduleType: ScheduleType;
  url: string;
  pdfPath: string;
  status: "downloaded" | "skipped" | "not_found" | "failed";
  inputState: "fresh" | "cached" | "stale" | "missing" | "failed";
  error?: string;
}

export const COURSE_DOWNLOAD_MANIFEST = "data/output/courses/downloads.json";

export async function loadCourseDownloadManifest(filePath: string, filter: CourseCodeFilter): Promise<{
  accepted: VariantDownloadResult[];
  excluded: VariantDownloadResult[];
}> {
  const data: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(data)) throw new Error(`Invalid course download manifest: ${filePath}`);

  const accepted: VariantDownloadResult[] = [];
  const excluded: VariantDownloadResult[] = [];
  const variants = new Set<string>();
  for (const row of data) {
    if (!row || typeof row.courseCode !== "string" || !row.courseCode.trim()
      || !["daytime", "evening"].includes(row.scheduleType)
      || typeof row.pdfPath !== "string" || !row.pdfPath.trim()
      || !["downloaded", "skipped", "not_found", "failed"].includes(row.status)) {
      throw new Error(`Invalid course download manifest entry in ${filePath}`);
    }
    // Older manifests lack inputState; status still controls acceptance.
    const inputState = row.inputState ?? ({
      downloaded: "fresh", skipped: "cached", not_found: "missing", failed: "failed"
    } as Record<string, string>)[row.status];
    const allowedStates: Record<string, string[]> = {
      downloaded: ["fresh"], skipped: ["cached"], not_found: ["missing"], failed: ["stale", "failed"]
    };
    if (!allowedStates[row.status].includes(inputState)) {
      throw new Error(`Inconsistent input state in course download manifest: ${filePath}`);
    }
    const item: VariantDownloadResult = {
      ...row, courseCode: row.courseCode.trim().toUpperCase(), inputState, pdfPath: path.resolve(row.pdfPath)
    };
    const key = `${item.courseCode}:${item.scheduleType}`;
    if (variants.has(key)) throw new Error(`Duplicate course variant ${key} in ${filePath}`);
    variants.add(key);
    if (!matchesCourseCode(item.courseCode, filter)) continue;
    if (item.status === "downloaded" || item.status === "skipped") accepted.push(item);
    else excluded.push(item);
  }

  // Fail before extraction if an accepted input has disappeared; never scan for a replacement.
  for (const item of accepted) await fs.access(item.pdfPath);
  return { accepted, excluded };
}
