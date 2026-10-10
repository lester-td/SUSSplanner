import { z } from "zod";
import { courseCodeSchema } from "@/lib/validation/timetable";
import { canonicalizeRule, compareCodeUnits, courseLeaves, PREREQUISITE_LIMITS, prerequisiteRuleSchema, prerequisiteTextSchema, utf8Length } from "./rule";
import { sourceUrlSchema, slugSchema, validateReviewTime, variantKey } from "./review-input";
import type { CourseRequisitesSnapshot } from "./types";

const sourceBase = {
  planKey: slugSchema, programmeName: z.string().min(1), studyMode: z.enum(["full-time", "part-time"]).nullable(), curriculumVersion: z.string().nullable(), effectiveFrom: z.string().nullable(), applicabilityLabel: prerequisiteTextSchema, rawText: prerequisiteTextSchema, parseStatus: z.enum(["parsed", "review_required", "unparsed"]),
  source: z.object({ label: z.string().min(1), pages: z.array(z.number().int().positive()).min(1), url: sourceUrlSchema }).strict(),
};
const keys = z.array(z.string().min(1)).min(1);
const publicSourceSchema = z.discriminatedUnion("reviewStatus", [
  z.object({ ...sourceBase, reviewStatus: z.literal("pending"), reviewedAt: z.null() }).strict(),
  z.object({ ...sourceBase, reviewStatus: z.enum(["approved", "source_only"]), reviewedAt: z.iso.datetime({ offset: true }) }).strict(),
]);
export const requisitesSnapshotSchema = z.object({
  prerequisiteVariants: z.array(z.discriminatedUnion("reviewStatus", [
    z.object({ key: z.string().min(1), reviewStatus: z.literal("approved"), rule: prerequisiteRuleSchema, ruleKeys: keys }).strict(),
    z.object({ key: z.string().min(1), reviewStatus: z.enum(["pending", "source_only"]), rule: z.null(), ruleKeys: keys.length(1) }).strict(),
  ])),
  dependentCourses: z.array(z.object({ courseCode: courseCodeSchema, ruleKeys: keys }).strict()),
  coursesByCode: z.record(z.string(), z.object({ courseCode: courseCodeSchema, courseName: z.string().nullable(), href: z.string().nullable(), availability: z.enum(["catalogued", "unknown"]), offeredSemesters: z.array(z.object({ semesterId: z.number().int().positive(), semesterName: z.string().min(1) }).strict()) }).strict()),
  sourcesByRuleKey: z.record(z.string(), publicSourceSchema),
}).strict();
function requireSortedUnique(values: Array<string | number>, label: string)
{
  if (values.some((value, index) => index > 0 && (typeof value === "number" ? Number(values[index - 1]) >= value : compareCodeUnits(String(values[index - 1]), value) >= 0))) throw new Error(`Unsorted/duplicate ${label}`);
}
export function validateRequisitesSnapshot(input: unknown, courseCode: string): CourseRequisitesSnapshot
{
  // Check tree budgets before recursive Zod parsing; serialized files already have
  // a byte bound in the artifact reader. This also prevents deep input traversal.
  if (input && typeof input === "object" && "prerequisiteVariants" in input && Array.isArray(input.prerequisiteVariants))
    for (const variant of input.prerequisiteVariants) if (variant && variant.rule !== null) canonicalizeRule(variant.rule);
  const payload = requisitesSnapshotSchema.parse(input) as CourseRequisitesSnapshot;
  if (utf8Length(JSON.stringify(payload)) > PREREQUISITE_LIMITS.payloadBytes) throw new Error(`Requisite payload exceeds byte budget: ${courseCode}`);
  requireSortedUnique(payload.prerequisiteVariants.map(variant => variant.key), "variants");
  requireSortedUnique(payload.dependentCourses.map(dependent => dependent.courseCode), "dependents");
  const displayCodes = new Set([courseCode]);
  const referencedSources = new Set<string>();
  for (const item of [...payload.prerequisiteVariants, ...payload.dependentCourses])
  {
    requireSortedUnique(item.ruleKeys, "rule keys");
    for (const key of item.ruleKeys)
    {
      const source = payload.sourcesByRuleKey[key];
      if (!source || source.reviewStatus !== ("reviewStatus" in item ? item.reviewStatus : "approved")) throw new Error(`Missing/incompatible source: ${key}`);
      referencedSources.add(key);
    }
    if ("rule" in item && item.rule)
    {
      if (item.key !== variantKey(item.rule)) throw new Error("Approved variant identity differs from its structure");
      courseLeaves(item.rule).forEach(code => displayCodes.add(code));
    }
    if ("courseCode" in item) displayCodes.add(item.courseCode);
    if ("rule" in item && !item.rule && item.key !== item.ruleKeys[0]) throw new Error("Fallback identity differs from source identity");
  }
  for (const [key, source] of Object.entries(payload.sourcesByRuleKey))
  {
    if (!referencedSources.has(key)) throw new Error(`Unreferenced public source: ${key}`);
    requireSortedUnique(source.source.pages, "source pages");
    if (source.reviewedAt !== null) validateReviewTime(source.reviewedAt);
  }
  if (displayCodes.size !== Object.keys(payload.coursesByCode).length) throw new Error(`Course map does not match display references: ${courseCode}`);
  for (const code of displayCodes)
  {
    const node = payload.coursesByCode[code];
    if (!node || node.courseCode !== code) throw new Error(`Missing course metadata: ${code}`);
    if (node.availability === "unknown" && (node.courseName !== null || node.href !== null || node.offeredSemesters.length)) throw new Error(`Invalid unknown course: ${code}`);
    if (node.availability === "catalogued" && node.href !== `/courses/${encodeURIComponent(code)}`) throw new Error(`Invalid course href: ${code}`);
    if (new Set(node.offeredSemesters.map(semester => semester.semesterId)).size !== node.offeredSemesters.length) throw new Error(`Duplicate offerings: ${code}`);
  }
  return payload;
}
