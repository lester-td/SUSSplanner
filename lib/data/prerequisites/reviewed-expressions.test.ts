import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import examples from "./reviewed-expression-fixtures.json";
import { PrerequisiteTree } from "@/components/courses/prerequisite-tree/prerequisite-tree";
import { emptyReviewFile, fixtureExtraction, fixtureTime } from "./fixtures";
import { emptyTriage, materializeBatch, prepareReviewBatch } from "./batch-review";
import { buildRequisites } from "./build-requisites";
import { canonicalizeRule, courseLeaves } from "./rule";
import { validateRequisitesSnapshot } from "./snapshot-validation";
import type { CourseNodeSummary, PrerequisiteRuleNode } from "./types";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ prefetch: _prefetch, ...props }: { prefetch: boolean }) => createElement("a", props) };
});
function matches(rule: PrerequisiteRuleNode, completed: Set<string>): boolean
{
  if (rule.type === "course") return completed.has(rule.courseCode);
  if (rule.type === "all") return rule.children.every(child => matches(child, completed));
  if (rule.type === "any") return rule.children.some(child => matches(child, completed));
  throw new Error("Expected a course-only reviewed tree");
}
it.each(examples)("preserves the confirmed grouping for $courseCodes through review and display", example => {
  const courseCode = example.courseCodes[0];
  const tree = canonicalizeRule(example.tree);
  const leaves = courseLeaves(tree);
  const base = fixtureExtraction();
  const source = { ...base, review: { ...base.review,
    plans: base.review.plans.map(plan => ({ ...plan, programmeName: "Reviewed expression fixture", studyMode: "part-time" })),
    sourceEntries: [{ ...base.review.sourceEntries[0], courseCode, prerequisite: example.rawText, parseStatus: "review_required", parserRule: null, prerequisiteDiagnostics: ["Logical grouping needs triage; complete source wording retained"] }],
  } };
  const catalogue: CourseNodeSummary[] = [courseCode, ...leaves].map(code => ({ courseCode: code, courseName: `${code} fixture`, href: `/courses/${code}`, availability: "catalogued", offeredSemesters: [] }));
  const stored = { plans: [], rules: [] };
  const now = new Date(fixtureTime);
  const batch = prepareReviewBatch(source, "1".repeat(64), { formatVersion: 1, plans: [] }, emptyReviewFile(), stored, catalogue, now);
  expect(batch.rules[0].decision).toBe("source_only");
  const triage = emptyTriage(batch);
  triage.rules.push({ ruleKey: batch.rules[0].ruleKey, expectedInputHash: batch.rules[0].expectedInputHash, decision: "approved", approvedRule: example.tree, notes: "Confirmed grouping fixture" });
  const accepted = materializeBatch(batch, triage, source, "1".repeat(64), stored, catalogue, "test-reviewer", now);
  const projected = buildRequisites(accepted.next.plans, accepted.next.rules, catalogue);
  const payload = projected.byCourse[courseCode];
  validateRequisitesSnapshot(payload, courseCode);
  expect(payload.prerequisiteVariants[0].rule).toEqual(tree);
  expect(Object.values(payload.sourcesByRuleKey)[0].rawText).toBe(example.rawText);
  expect(projected.report.reversePairs).toBe(leaves.length);
  expect(projected.report.reverseContributions).toBe(leaves.length);
  for (let mask = 0; mask < 2 ** leaves.length; mask++)
  {
    const completed = new Set(leaves.filter((_, index) => mask & (1 << index)));
    const has = (code: string) => completed.has(code);
    const expected: Record<string, boolean> = {
      BME352: has("BME205") && (has("BME107") && has("BME108") || has("BME209") && has("BME210") || has("BME207")),
      COU252: has("COU204") && (has("COU201") || has("COU202")),
      OST363: has("OST165") && (has("OST361") || has("OST362")),
      PSY405: has("PSY107") && has("PSY108") && has("PSY205") && (has("PSY390") || has("PSY391")),
      RSS699: has("RSS501") && (has("RSS503") || has("HDS501")),
      MTD365: has("MTD301"),
    };
    expect(matches(tree, completed), `completed ${[...completed].join(", ")}`).toBe(expected[courseCode]);
  }
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode, requisites: payload }));
  expect(html).not.toContain("Needs verification");
  if (courseCode === "MTD365")
  {
    expect(tree).toEqual({ type: "course", courseCode: "MTD301", displayRemarks: ["Video production experience is required."] });
    expect(html).toContain("<summary>Remarks</summary>");
    expect(html).toContain("Video production experience is required.");
    expect(html.indexOf('href="/courses/MTD301"')).toBeLessThan(html.indexOf('id="prerequisite-remarks"'));
  }
  else expect(html).toContain("one of");
});
