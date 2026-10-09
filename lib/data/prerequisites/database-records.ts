import { curriculumPlans, curriculumPrerequisiteRules } from "@/lib/db/schema";
import type { PlanRecord, RuleRecord } from "./types";
import { normalizeTimestamp } from "./review-input";

export function mapPlanRecord(row: typeof curriculumPlans.$inferSelect): PlanRecord
{
  return { ...row, publicationReviewedAt: row.publicationReviewedAt ? normalizeTimestamp(row.publicationReviewedAt) : null, lastUpdated: normalizeTimestamp(row.lastUpdated) };
}
export function mapRuleRecord(row: typeof curriculumPrerequisiteRules.$inferSelect): RuleRecord
{
  return { ...row, ruleJson: row.ruleJson ?? null, reviewedAt: row.reviewedAt ? normalizeTimestamp(row.reviewedAt) : null, lastUpdated: normalizeTimestamp(row.lastUpdated) };
}
