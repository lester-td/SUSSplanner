import type { CourseRequisitesSnapshot } from "./types";

export function getDisplayPrerequisiteVariants({ prerequisiteVariants, sourcesByRuleKey }: CourseRequisitesSnapshot)
{
  const seen = new Set<string>();
  return prerequisiteVariants.filter(variant => {
    const signature = JSON.stringify([variant.reviewStatus, variant.rule ?? [...new Set(variant.ruleKeys.map(key => sourcesByRuleKey[key].rawText))].sort()]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
