import { approvedRuleHash, publicationHash, reviewInputHash } from "./review-input";
import { canonicalizeRule } from "./rule";
import type { CourseNodeSummary, PlanRecord, PrerequisiteRuleNode, RuleRecord } from "./types";

export const fixtureTime = "2026-10-01T00:00:00.000Z";
export function fixturePlan(overrides: Partial<PlanRecord> = {}): PlanRecord
{
  const plan: PlanRecord = { planKey: "demo-programme", programmeName: "Demonstration programme", studyMode: "part-time", curriculumVersion: "Sample", effectiveFrom: null, sourceHash: "a".repeat(64), sourcePath: "demo.pdf", sourceLabel: "Synthetic test source", sourceUrl: null, publicationInputHash: "", publicationStatus: "included", reviewedPublicationInputHash: "", publicationReviewedBy: "test-reviewer", publicationReviewedAt: fixtureTime, publicationReviewNotes: null, lastUpdated: fixtureTime, ...overrides };
  plan.publicationInputHash = publicationHash(plan);
  plan.reviewedPublicationInputHash = plan.publicationStatus === "unreviewed" ? null : plan.publicationInputHash;
  if (plan.publicationStatus === "unreviewed") { plan.publicationReviewedBy = null; plan.publicationReviewedAt = null; }
  return plan;
}
export function fixtureRule(plan = fixturePlan(), tree: PrerequisiteRuleNode = { type: "course", courseCode: "PRE100" }, overrides: Partial<RuleRecord> = {}): RuleRecord
{
  const rule: RuleRecord = { ruleKey: `prerequisite:${plan.planKey}:MAIN300:default`, planKey: plan.planKey, courseCode: "MAIN300", applicabilityKey: "default", applicabilityLabel: "Programme-wide", rawText: "PRE100", parseStatus: "parsed", ruleJson: { type: "course", courseCode: "PRE100" }, parserContractVersion: 1, sourceHash: plan.sourceHash, sourceOccurrences: [{ page: 1, table: 1, row: 2, section: "Core" }], recordStatus: "active", reviewStatus: "approved", reviewInputHash: "", reviewedInputHash: "", approvedRuleJson: canonicalizeRule(tree), approvedRuleHash: approvedRuleHash(tree), reviewedBy: "test-reviewer", reviewedAt: fixtureTime, reviewNotes: null, lastUpdated: fixtureTime, ...overrides };
  rule.reviewInputHash = reviewInputHash(plan, rule);
  rule.reviewedInputHash = rule.reviewStatus === "pending" ? null : rule.reviewInputHash;
  if (rule.reviewStatus !== "approved") { rule.approvedRuleJson = null; rule.approvedRuleHash = null; }
  if (rule.reviewStatus === "pending") { rule.reviewedBy = null; rule.reviewedAt = null; rule.reviewNotes = null; }
  return rule;
}
export const fixtureCatalogue: CourseNodeSummary[] = ["MAIN300", "PRE100", "ALT200", "NEXT400"].map(courseCode => ({ courseCode, courseName: `${courseCode} sample course`, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [{ semesterId: 1, semesterName: "July 2026" }] }));
export function fixtureRegistry(plan = fixturePlan())
{
  return { formatVersion: 1, plans: [{ planKey: plan.planKey, programmeName: plan.programmeName, studyMode: plan.studyMode, curriculumVersion: plan.curriculumVersion, effectiveFrom: plan.effectiveFrom, sourceHash: plan.sourceHash, sourcePath: plan.sourcePath, sourceLabel: plan.sourceLabel, sourceUrl: plan.sourceUrl, scopes: [{ applicabilityKey: "default", applicabilityLabel: "Programme-wide" }], sectionMappings: [{ extractedSection: "Core", applicabilityKey: "default" }], publication: null as null | { expectedInputHash: string; decision: "included" | "excluded"; reviewerAlias: string; reviewedAt: string } }] };
}
export function fixtureExtraction()
{
  return { metadata: { parserContractVersion: 1, planCount: 1, entryCount: 1, courseLikeRowCount: 1 }, review: { plans: [{ planKey: "extracted-path-key", sourceHash: "a".repeat(64), sourcePath: "demo.pdf", courseLikeRowCount: 1, entryCount: 1, pageCount: 1 }], sourceEntries: [{ planKey: "extracted-path-key", courseCode: "MAIN300", recordType: "offering", section: "Core", sourcePage: 1, sourceTable: 1, sourceRow: 2, prerequisite: "PRE100", parserContractVersion: 1, parseStatus: "parsed", parserRule: { type: "course", courseCode: "PRE100" }, prerequisiteDiagnostics: [], warnings: [] }], issues: [] as { severity: string; issue: string }[] } };
}
export const emptyReviewFile = () => ({ formatVersion: 1, reviews: [] as Record<string, unknown>[], deactivations: [] as Record<string, unknown>[] });
