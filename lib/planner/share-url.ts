import { z } from "zod";

import { semesterPlannerCourseSchema, semesterPlannerStateSchema } from "@/lib/validation/planner";
import type { SemesterPlannerState } from "./types";

const MAX_PAYLOAD_BYTES = 256_000;
const MAX_ENCODED_LENGTH = 32_768;
const course = semesterPlannerCourseSchema.shape;
const sharedPlanSchema = z.object({
  v: z.literal(1),
  g: semesterPlannerStateSchema.shape.totalCreditsGoal,
  s: semesterPlannerStateSchema.shape.numSemesters,
  c: z.array(z.tuple([
    course.courseCode,
    course.courseName,
    course.creditUnits,
    course.semesterSpan,
    course.assignedSemester,
    z.union([z.literal(0), z.literal(1)]),
    course.schoolName.optional(),
  ])).max(300),
});

function validatePlan(state: SemesterPlannerState)
{
  const parsed = semesterPlannerStateSchema.parse(state);
  if (parsed.courses.some((item) => item.semesterSpan > parsed.numSemesters
    || (item.assignedSemester !== null && item.assignedSemester + item.semesterSpan > parsed.numSemesters)))
  {
    throw new Error("A course extends beyond the semesters in this plan.");
  }
  return parsed;
}

async function readLimitedStream(stream: ReadableStream<Uint8Array>, maxBytes: number)
{
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try
  {
    while (true)
    {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("This plan is too large to share using a link. Use Backup instead.");
      chunks.push(value);
    }
  }
  catch (error)
  {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  finally
  {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks)
  {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function encodeSemesterPlannerShareUrl(state: SemesterPlannerState)
{
  if (typeof CompressionStream === "undefined")
  {
    throw new Error("Your browser does not support share links. Update it or use Backup instead.");
  }
  const parsed = validatePlan(state);
  const payload = JSON.stringify({
    v: 1,
    g: parsed.totalCreditsGoal,
    s: parsed.numSemesters,
    c: parsed.courses.map((item) => [
      item.courseCode, item.courseName, item.creditUnits, item.semesterSpan,
      item.assignedSemester, item.source === "manual" ? 1 : 0,
      ...(item.schoolName === null ? [] : [item.schoolName]),
    ]),
  });
  const blob = new Blob([payload]);
  if (blob.size > MAX_PAYLOAD_BYTES) throw new Error("This plan is too large to share using a link. Use Backup instead.");
  const bytes = await readLimitedStream(blob.stream().pipeThrough(new CompressionStream("deflate")), MAX_ENCODED_LENGTH * 3 / 4);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `/planner#plan=${encoded}`;
}

export async function decodeSemesterPlannerShareUrl(encoded: string)
{
  if (typeof DecompressionStream === "undefined")
  {
    throw new Error("Your browser does not support share links. Update it or use Backup instead.");
  }
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded))
  {
    throw new Error("Invalid shared plan link.");
  }
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoded = await readLimitedStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")), MAX_PAYLOAD_BYTES);
  const parsed = sharedPlanSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)));
  return validatePlan({
    totalCreditsGoal: parsed.g,
    numSemesters: parsed.s,
    courses: parsed.c.map(([courseCode, courseName, creditUnits, semesterSpan, assignedSemester, source, schoolName], index) => ({
      id: `shared:${index}:${courseCode}`,
      courseCode, courseName, creditUnits, semesterSpan, assignedSemester,
      source: source === 1 ? "manual" : "catalog",
      schoolName: schoolName ?? null,
    })),
  });
}
