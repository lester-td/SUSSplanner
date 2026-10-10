import { canonicalizeRule, compareCodeUnits, courseLeaves, utf8Length } from "./rule";
import { approvedRuleHash, publicationHash, reviewInputHash, sourceHashSchema, sourceUrlSchema, slugSchema, stableSerialize, validateReviewTime, validateRuleEvidence, variantKey } from "./review-input";
import { validateRequisitesSnapshot } from "./snapshot-validation";
import type { CourseNodeSummary, CourseRequisitesSnapshot, PlanRecord, PrerequisiteVariant, PublicRuleSource, RuleRecord } from "./types";

export function validatePlanRecord(plan: PlanRecord, recompute = true)
{
  slugSchema.parse(plan.planKey); sourceHashSchema.parse(plan.sourceHash); sourceUrlSchema.parse(plan.sourceUrl);
  if (!plan.programmeName.trim() || !plan.sourceLabel.trim() || ![null, "full-time", "part-time"].includes(plan.studyMode)) throw new Error(`Invalid plan metadata: ${plan.planKey}`);
  if (recompute && publicationHash(plan) !== plan.publicationInputHash) throw new Error(`Stale plan fingerprint: ${plan.planKey}`);
  if (plan.publicationStatus === "unreviewed")
  {
    if ([plan.reviewedPublicationInputHash, plan.publicationReviewedBy, plan.publicationReviewedAt, plan.publicationReviewNotes].some(value => value !== null)) throw new Error(`Unreviewed plan has decision fields: ${plan.planKey}`);
  }
  else
  {
    if (!["included", "excluded"].includes(plan.publicationStatus) || plan.reviewedPublicationInputHash !== plan.publicationInputHash || !plan.publicationReviewedBy?.trim() || !plan.publicationReviewedAt) throw new Error(`Invalid plan decision: ${plan.planKey}`);
    validateReviewTime(plan.publicationReviewedAt);
  }
}
export function validateRuleRecord(rule: RuleRecord, plan: PlanRecord, recompute = true)
{
  validateRuleEvidence(rule);
  if (!["active", "inactive"].includes(rule.recordStatus)) throw new Error(`Invalid record status: ${rule.ruleKey}`);
  if (recompute && (rule.sourceHash !== plan.sourceHash || reviewInputHash(plan, rule) !== rule.reviewInputHash)) throw new Error(`Stale rule input/source binding: ${rule.ruleKey}`);
  if (rule.reviewStatus === "pending")
  {
    if ([rule.reviewedInputHash, rule.approvedRuleJson, rule.approvedRuleHash, rule.reviewedBy, rule.reviewedAt, rule.reviewNotes].some(value => value !== null)) throw new Error(`Pending rule has decision fields: ${rule.ruleKey}`);
  }
  else
  {
    if (!["approved", "source_only", "excluded"].includes(rule.reviewStatus) || rule.reviewedInputHash !== rule.reviewInputHash || !rule.reviewedBy?.trim() || !rule.reviewedAt) throw new Error(`Invalid rule decision: ${rule.ruleKey}`);
    validateReviewTime(rule.reviewedAt);
    if (rule.reviewStatus === "approved")
    {
      const canonical = canonicalizeRule(rule.approvedRuleJson);
      if (stableSerialize(canonical) !== stableSerialize(rule.approvedRuleJson) || approvedRuleHash(canonical) !== rule.approvedRuleHash) throw new Error(`Invalid approved structure fingerprint: ${rule.ruleKey}`);
      if (courseLeaves(canonical).includes(rule.courseCode)) throw new Error(`Self-prerequisite: ${rule.ruleKey}`);
      if (/\(cid:\d+\)/i.test(rule.rawText)) throw new Error(`Unresolved prerequisite glyph: ${rule.ruleKey}`);
    }
    else if (rule.approvedRuleJson !== null || rule.approvedRuleHash !== null) throw new Error(`Text decision has approved tree: ${rule.ruleKey}`);
  }
}

export function buildRequisites(plans: PlanRecord[], rules: RuleRecord[], catalogue: CourseNodeSummary[])
{
  const plansByKey = new Map(plans.map(plan => [plan.planKey, plan]));
  if (plansByKey.size !== plans.length || new Set(rules.map(rule => rule.ruleKey)).size !== rules.length) throw new Error("Duplicate academic record identity");
  const catalogued = new Map(catalogue.map(course => [course.courseCode, course]));
  const visible: RuleRecord[] = [];
  const includedSources = new Set<string>();
  const report = {
    plans: { unreviewed: 0, included: 0, excluded: 0 },
    activeIncludedRules: { pending: 0, approved: 0, source_only: 0, excluded: 0 },
    omittedRules: 0, approvedVariants: 0, reversePairs: 0, reverseContributions: 0,
    unknownLeaves: [] as string[], unknownTargets: [] as string[], cycles: [] as string[][],
    largestRuleBytes: 0, largestPayloadBytes: 0,
  };
  for (const plan of plans)
  {
    validatePlanRecord(plan, plan.publicationStatus === "included");
    if (plan.publicationStatus === "included")
    {
      if (includedSources.has(plan.sourceHash)) throw new Error("One source hash is assigned to different included plans");
      includedSources.add(plan.sourceHash);
    }
    report.plans[plan.publicationStatus]++;
  }
  for (const rule of [...rules].sort((a, b) => compareCodeUnits(a.ruleKey, b.ruleKey)))
  {
    const plan = plansByKey.get(rule.planKey);
    if (!plan) throw new Error(`Missing plan: ${rule.ruleKey}`);
    if (plan.publicationStatus !== "included" || rule.recordStatus !== "active") { report.omittedRules++; continue; }
    validateRuleRecord(rule, plan);
    report.activeIncludedRules[rule.reviewStatus]++;
    if (rule.reviewStatus !== "excluded") visible.push(rule);
  }
  const sourceByKey = new Map<string, PublicRuleSource>();
  const direct = new Map<string, PrerequisiteVariant[]>();
  const reverse = new Map<string, Map<string, Set<string>>>();
  const unknownLeaves = new Set<string>();
  const unknownTargets = new Set<string>();
  const graph = new Map<string, Set<string>>();
  for (const rule of visible)
  {
    const plan = plansByKey.get(rule.planKey)!;
    const sourceBase = {
      planKey: plan.planKey, programmeName: plan.programmeName, studyMode: plan.studyMode,
      curriculumVersion: plan.curriculumVersion, effectiveFrom: plan.effectiveFrom,
      applicabilityLabel: rule.applicabilityLabel, rawText: rule.rawText, parseStatus: rule.parseStatus,
      source: { label: plan.sourceLabel, pages: [...new Set(rule.sourceOccurrences.map(occurrence => occurrence.page))].sort((a, b) => a - b), url: plan.sourceUrl },
    };
    sourceByKey.set(rule.ruleKey, rule.reviewStatus === "pending" ? { ...sourceBase, reviewStatus: "pending", reviewedAt: null } : { ...sourceBase, reviewStatus: rule.reviewStatus as "approved" | "source_only", reviewedAt: rule.reviewedAt! });
    if (!catalogued.has(rule.courseCode)) unknownTargets.add(rule.courseCode);
    const variants = direct.get(rule.courseCode) ?? [];
    if (rule.reviewStatus === "approved")
    {
      const tree = canonicalizeRule(rule.approvedRuleJson);
      const key = variantKey(tree);
      const existing = variants.find(variant => variant.key === key);
      if (existing) existing.ruleKeys.push(rule.ruleKey);
      else { variants.push({ key, reviewStatus: "approved", rule: tree, ruleKeys: [rule.ruleKey] }); report.approvedVariants++; }
      report.largestRuleBytes = Math.max(report.largestRuleBytes, utf8Length(JSON.stringify(tree)));
      for (const leaf of courseLeaves(tree))
      {
        if (!catalogued.has(leaf)) unknownLeaves.add(leaf);
        const targets = reverse.get(leaf) ?? new Map<string, Set<string>>();
        const contributions = targets.get(rule.courseCode) ?? new Set<string>();
        contributions.add(rule.ruleKey); targets.set(rule.courseCode, contributions); reverse.set(leaf, targets);
        const adjacent = graph.get(leaf) ?? new Set<string>(); adjacent.add(rule.courseCode); graph.set(leaf, adjacent);
        report.reverseContributions++;
      }
    }
    else variants.push({ key: rule.ruleKey, reviewStatus: rule.reviewStatus as "source_only" | "pending", rule: null, ruleKeys: [rule.ruleKey] });
    direct.set(rule.courseCode, variants);
  }
  const summary = (code: string): CourseNodeSummary => catalogued.get(code) ?? { courseCode: code, courseName: null, href: null, availability: "unknown", offeredSemesters: [] };
  const byCourse: Record<string, CourseRequisitesSnapshot> = {};
  for (const code of [...catalogued.keys()].sort(compareCodeUnits))
  {
    const prerequisiteVariants = (direct.get(code) ?? []).sort((a, b) => compareCodeUnits(a.key, b.key));
    const dependentCourses = [...(reverse.get(code) ?? [])].sort(([a], [b]) => compareCodeUnits(a, b)).map(([courseCode, keys]) => ({ courseCode, ruleKeys: [...keys].sort(compareCodeUnits) }));
    const displayCodes = new Set([code, ...prerequisiteVariants.flatMap(variant => variant.rule ? courseLeaves(variant.rule) : []), ...dependentCourses.map(dependent => dependent.courseCode)]);
    const ruleKeys = [...new Set([...prerequisiteVariants, ...dependentCourses].flatMap(item => item.ruleKeys))].sort(compareCodeUnits);
    const payload = { prerequisiteVariants, dependentCourses, coursesByCode: Object.fromEntries([...displayCodes].sort(compareCodeUnits).map(code => [code, summary(code)])), sourcesByRuleKey: Object.fromEntries(ruleKeys.map(key => [key, sourceByKey.get(key)!])) };
    byCourse[code] = validateRequisitesSnapshot(payload, code);
    report.largestPayloadBytes = Math.max(report.largestPayloadBytes, utf8Length(JSON.stringify(payload)));
  }
  report.reversePairs = [...reverse.values()].reduce((total, targets) => total + targets.size, 0);
  report.unknownLeaves = [...unknownLeaves].sort(compareCodeUnits); report.unknownTargets = [...unknownTargets].sort(compareCodeUnits);
  // Iterative DFS reports union-graph back edges, without interpreting them as
  // contradictory requirements across alternative branches or programmes.
  const complete = new Set<string>();
  for (const start of [...graph.keys()].sort(compareCodeUnits))
  {
    if (complete.has(start)) continue;
    const path: string[] = [];
    const active = new Map<string, number>();
    const stack = [{ code: start, exit: false }];
    while (stack.length)
    {
      const step = stack.pop()!;
      if (step.exit) { active.delete(step.code); path.pop(); complete.add(step.code); continue; }
      if (active.has(step.code)) { report.cycles.push([...path.slice(active.get(step.code)!), step.code]); continue; }
      if (complete.has(step.code)) continue;
      active.set(step.code, path.length); path.push(step.code); stack.push({ code: step.code, exit: true });
      for (const next of [...(graph.get(step.code) ?? [])].sort(compareCodeUnits).reverse()) stack.push({ code: next, exit: false });
    }
  }
  return { byCourse, report };
}
