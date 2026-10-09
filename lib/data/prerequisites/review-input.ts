import { createHash } from "node:crypto";
import { z } from "zod";
import { courseCodeSchema } from "@/lib/validation/timetable";
import { canonicalizeRule, compareCodeUnits, prerequisiteTextSchema, stableSerialize, validateJsonBudget } from "./rule";
export { stableSerialize } from "./rule";
import type { PlanRecord, RuleRecord, SourceOccurrence } from "./types";

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const sourceHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceUrlSchema = z.string().refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Source URL must be absolute HTTPS without credentials").nullable();
export const occurrenceSchema = z.object({ page: z.number().int().positive(), table: z.number().int().positive().nullable(), row: z.number().int().positive().nullable(), section: z.string().nullable() }).strict();
export function sortedOccurrences(values: SourceOccurrence[]): SourceOccurrence[]
{
  const parsed = values.map(value => occurrenceSchema.parse(value));
  const sorted = parsed.sort((a, b) => a.page - b.page || (a.table ?? 0) - (b.table ?? 0) || (a.row ?? 0) - (b.row ?? 0) || (a.section === null ? b.section === null ? 0 : -1 : b.section === null ? 1 : compareCodeUnits(a.section, b.section)));
  return sorted.filter((value, index) => index === 0 || stableSerialize(value) !== stableSerialize(sorted[index - 1]));
}
export const fingerprint = (prefix: string, value: unknown) => `${prefix}:v1:${createHash("sha256").update(stableSerialize(value), "utf8").digest("hex")}`;
export function publicationInput(plan: Pick<PlanRecord, "planKey" | "sourceHash" | "programmeName" | "studyMode" | "curriculumVersion" | "effectiveFrom" | "sourceLabel" | "sourceUrl">)
{
  const { planKey, sourceHash, programmeName, studyMode, curriculumVersion, effectiveFrom, sourceLabel, sourceUrl } = plan;
  return { contractVersion: 1, planKey, sourceHash, programmeName, studyMode, curriculumVersion, effectiveFrom, sourceLabel, sourceUrl };
}
export const publicationHash = (plan: Parameters<typeof publicationInput>[0]) => fingerprint("publication-input", publicationInput(plan));
export function ruleInput(plan: Parameters<typeof publicationInput>[0], rule: Pick<RuleRecord, "ruleKey" | "planKey" | "courseCode" | "applicabilityKey" | "applicabilityLabel" | "sourceHash" | "sourceOccurrences" | "rawText" | "parseStatus" | "ruleJson" | "parserContractVersion">)
{
  const { ruleKey, planKey, courseCode, applicabilityKey, applicabilityLabel, sourceHash, rawText, parseStatus, parserContractVersion } = rule;
  const { programmeName, studyMode, curriculumVersion, effectiveFrom, sourceLabel, sourceUrl } = plan;
  return { contractVersion: 1, parserContractVersion, ruleKey, planKey, courseCode, applicabilityKey, applicabilityLabel, programmeName, studyMode, curriculumVersion, effectiveFrom, sourceHash, sourceLabel, sourceUrl, sourceOccurrences: sortedOccurrences(rule.sourceOccurrences), rawText, parseStatus, parserRule: rule.ruleJson };
}
export const reviewInputHash = (plan: Parameters<typeof publicationInput>[0], rule: Parameters<typeof ruleInput>[1]) => fingerprint("review-input", ruleInput(plan, rule));
export const approvedRuleHash = (rule: unknown) => fingerprint("approved-rule", { contractVersion: 1, rule: canonicalizeRule(rule) });
export const variantKey = (rule: unknown) => approvedRuleHash(rule).replace(/^approved-rule:/, "variant:");
const reviewer = { reviewerAlias: z.string().trim().min(1), reviewedAt: z.iso.datetime({ offset: true }), notes: z.string().optional(), expectedInputHash: z.string().min(1) };
export const registrySchema = z.object({ formatVersion: z.literal(1), plans: z.array(z.object({
  planKey: slugSchema, programmeName: z.string().trim().min(1), studyMode: z.enum(["full-time", "part-time"]).nullable(), curriculumVersion: z.string().nullable(), effectiveFrom: z.string().nullable(), sourceHash: sourceHashSchema, sourcePath: z.string().min(1), sourceLabel: z.string().trim().min(1), sourceUrl: sourceUrlSchema,
  scopes: z.array(z.object({ applicabilityKey: slugSchema, applicabilityLabel: z.string().trim().min(1) }).strict()).min(1),
  sectionMappings: z.array(z.object({ extractedSection: z.string().nullable(), applicabilityKey: slugSchema }).strict()),
  occurrenceScopeOverrides: z.array(z.object({ page: z.number().int().positive(), table: z.number().int().positive(), row: z.number().int().positive(), applicabilityKey: slugSchema }).strict()).optional(),
  publication: z.object({ ...reviewer, decision: z.enum(["included", "excluded"]) }).strict().nullable(),
}).strict()) }).strict();
const ruleDecision = z.discriminatedUnion("decision", [
  z.object({ ...reviewer, ruleKey: z.string().min(1), archived: z.boolean().optional(), decision: z.literal("approved"), approvedRule: z.unknown().refine(value => value !== undefined, "Approved tree required") }).strict(),
  z.object({ ...reviewer, ruleKey: z.string().min(1), archived: z.boolean().optional(), decision: z.enum(["source_only", "excluded"]) }).strict(),
]);
export const reviewFileSchema = z.object({ formatVersion: z.literal(1), reviews: z.array(ruleDecision), deactivations: z.array(z.object({ ...reviewer, ruleKey: z.string().min(1) }).strict()) }).strict();
export type PlanRegistry = z.infer<typeof registrySchema>;
export type RuleReviewFile = z.infer<typeof reviewFileSchema>;
export function validateReviewTime(value: string, now = new Date())
{
  z.iso.datetime({ offset: true }).parse(value);
  if (/\.\d{7}/.test(value)) throw new Error("Review timestamps support at most PostgreSQL microsecond precision");
  if (Date.parse(value) > now.getTime()) throw new Error("Review time is in the future");
}
export function normalizeTimestamp(value: string)
{
  const iso = new Date(value).toISOString();
  let fraction = (value.match(/\.(\d+)/)?.[1] ?? "0").padEnd(3, "0");
  while (fraction.length > 3 && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return iso.replace(/\.\d{3}Z$/, `.${fraction}Z`);
}
export function validateRegistry(input: unknown): PlanRegistry
{
  const registry = registrySchema.parse(input);
  const keys = new Set<string>();
  const hashes = new Set<string>();
  for (const plan of registry.plans)
  {
    if (keys.has(plan.planKey) || hashes.has(plan.sourceHash)) throw new Error("Duplicate plan identity or source hash");
    keys.add(plan.planKey); hashes.add(plan.sourceHash);
    const scopes = new Set(plan.scopes.map(scope => scope.applicabilityKey));
    if (scopes.size !== plan.scopes.length) throw new Error(`Duplicate scope: ${plan.planKey}`);
    const mappings = new Set<string | null>();
    for (const mapping of plan.sectionMappings)
    {
      if (!scopes.has(mapping.applicabilityKey) || mappings.has(mapping.extractedSection)) throw new Error(`Invalid/duplicate section mapping: ${plan.planKey}`);
      mappings.add(mapping.extractedSection);
    }
    const overrides = new Set<string>();
    for (const override of plan.occurrenceScopeOverrides ?? [])
    {
      const locator = `${override.page}:${override.table}:${override.row}`;
      if (!scopes.has(override.applicabilityKey) || overrides.has(locator)) throw new Error(`Invalid/duplicate occurrence override: ${plan.planKey}`);
      overrides.add(locator);
    }
    if (plan.publication) validateReviewTime(plan.publication.reviewedAt);
  }
  return registry;
}
export function validateRuleEvidence(rule: RuleRecord)
{
  const code = courseCodeSchema.parse(rule.courseCode);
  slugSchema.parse(rule.planKey); slugSchema.parse(rule.applicabilityKey);
  if (code !== rule.courseCode || rule.ruleKey !== `prerequisite:${rule.planKey}:${code}:${rule.applicabilityKey}`) throw new Error(`Invalid rule identity: ${rule.ruleKey}`);
  prerequisiteTextSchema.parse(rule.rawText); prerequisiteTextSchema.parse(rule.applicabilityLabel);
  sourceHashSchema.parse(rule.sourceHash);
  z.enum(["parsed", "review_required", "unparsed"]).parse(rule.parseStatus);
  z.number().int().positive().parse(rule.parserContractVersion);
  if (!rule.sourceOccurrences.length || stableSerialize(sortedOccurrences(rule.sourceOccurrences)) !== stableSerialize(rule.sourceOccurrences)) throw new Error(`Missing/unsorted occurrences: ${rule.ruleKey}`);
  if (rule.ruleJson !== null) validateJsonBudget(rule.ruleJson, true);
}
