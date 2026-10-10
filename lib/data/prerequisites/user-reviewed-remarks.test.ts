import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PrerequisiteTree } from "@/components/courses/prerequisite-tree/prerequisite-tree";
import examples from "./user-reviewed-remarks-fixtures.json";
import { emptyReviewFile, fixtureExtraction, fixtureTime } from "./fixtures";
import { emptyTriage, materializeBatch, prepareReviewBatch } from "./batch-review";
import { buildRequisites } from "./build-requisites";
import { canonicalizeRule, courseLeaves } from "./rule";
import type { CourseNodeSummary, PrerequisiteRuleNode } from "./types";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ prefetch: _prefetch, ...props }: { prefetch: boolean }) => createElement("a", props) };
});

function matchesCourseRoute(rule: PrerequisiteRuleNode, completed: Set<string>): boolean
{
  if (rule.type === "course") return completed.has(rule.courseCode);
  if (rule.type === "all") return rule.children.every(child => matchesCourseRoute(child, completed));
  if (rule.type === "any") return rule.children.some(child => matchesCourseRoute(child, completed));
  throw new Error("Expected a course route");
}

function reviewedProjection()
{
  const base = fixtureExtraction();
  const entries = examples.map((example, index) => ({ ...base.review.sourceEntries[0], courseCode: example.courseCode, sourceRow: index + 1,
    prerequisite: example.prerequisite, remarks: example.remarks, parserContractVersion: 2,
    prerequisiteSourceFields: [...(example.prerequisite ? ["prerequisite"] : []), ...(example.remarks ? ["remarks"] : [])],
    prerequisiteEvidenceText: [example.prerequisite, example.remarks ? `Remarks: ${example.remarks}` : null].filter(Boolean).join("\n"),
    parseStatus: "review_required", parserRule: null,
  }));
  const source = { ...base, metadata: { ...base.metadata, parserContractVersion: 2, entryCount: entries.length, courseLikeRowCount: entries.length }, review: { ...base.review,
    plans: base.review.plans.map(plan => ({ ...plan, programmeName: "User reviewed remarks fixture", studyMode: "part-time", entryCount: entries.length, courseLikeRowCount: entries.length })),
    sourceEntries: entries,
  } };
  const codes = [...new Set([...examples.map(e => e.courseCode), ...examples.flatMap(e => e.rule ? courseLeaves(canonicalizeRule(e.rule)) : [])])];
  const catalogue: CourseNodeSummary[] = codes.map(courseCode => ({ courseCode, courseName: courseCode, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const now = new Date(fixtureTime);
  const stored = { plans: [], rules: [] };
  const batch = prepareReviewBatch(source, "1".repeat(64), { formatVersion: 1, plans: [] }, emptyReviewFile(), stored, catalogue, now);
  const triage = emptyTriage(batch);
  for (const proposal of batch.rules) {
    const example = examples.find(e => e.courseCode === proposal.courseCode)!;
    triage.rules.push({ ruleKey: proposal.ruleKey, expectedInputHash: proposal.expectedInputHash, decision: example.decision === "approved" ? "approved" : "source_only", ...(example.rule ? { approvedRule: example.rule } : {}), notes: "User-confirmed course route and displayed remarks" });
  }
  const accepted = materializeBatch(batch, triage, source, "1".repeat(64), stored, catalogue, "test-reviewer", now);
  return { projection: buildRequisites(accepted.next.plans, accepted.next.rules, catalogue), entries };
}

it("preserves both CET315 course routes and its separate law-degree eligibility wording", () => {
  const { projection } = reviewedProjection();
  const payload = projection.byCourse.CET315;
  const tree = payload.prerequisiteVariants[0].rule!;
  const leaves = courseLeaves(tree);
  for (let mask = 0; mask < 2 ** leaves.length; mask++) {
    const completed = new Set(leaves.filter((_, index) => mask & (1 << index)));
    const law = ["LAW201", "LAW203", "LAW305", "LAW307"].every(c => completed.has(c));
    const business = ["BUS201", "BUS205"].every(c => completed.has(c));
    expect(matchesCourseRoute(tree, completed)).toBe(law || business);
  }
  expect(tree.displayRemarks).toEqual(["Open to those who already have a law degree."]);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "CET315", requisites: payload }));
  expect(html).toContain("one of");
  expect(html).toContain("Open to those who already have a law degree.");
  expect(html.indexOf('href="/courses/LAW201"')).toBeLessThan(html.indexOf('id="prerequisite-remarks"'));
});

it("keeps the OGP course chain direct and preserves placement-test alternatives and exemptions beneath both trees", () => {
  const { projection } = reviewedProjection();
  expect(courseLeaves(projection.byCourse.OGP281.prerequisiteVariants[0].rule!)).toEqual(["OGP181"]);
  expect(courseLeaves(projection.byCourse.OGP381.prerequisiteVariants[0].rule!)).toEqual(["OGP281"]);
  expect(projection.byCourse.OGP181.dependentCourses.map(c => c.courseCode)).toEqual(["OGP281"]);
  expect(projection.byCourse.OGP281.dependentCourses.map(c => c.courseCode)).toEqual(["OGP381"]);
  for (const code of ["OGP281", "OGP381"]) {
    const payload = projection.byCourse[code];
    const remarks = payload.prerequisiteVariants[0].rule!.displayRemarks!;
    expect(remarks[0]).toContain("Placement Chinese Test or have taken");
    expect(remarks.join(" ")).toContain("CET students are exempted");
    const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: code, requisites: payload }));
    for (const text of remarks) expect(html).toContain(text);
  }
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "OGP381", requisites: projection.byCourse.OGP381 }));
  expect(html).not.toContain('href="/courses/OGP181"');
});

it("keeps HBC213 in full as remarks and binds every original source cell", () => {
  const { projection, entries } = reviewedProjection();
  const payload = projection.byCourse.HBC213;
  expect(payload.prerequisiteVariants[0]).toMatchObject({ reviewStatus: "source_only", rule: null });
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "HBC213", requisites: payload }));
  expect(html).toContain("<summary>Remarks</summary>");
  expect(html).toContain("BACLS students have the option");
  expect(html).not.toContain("Needs verification");
  for (const entry of entries) expect(Object.values(projection.byCourse[entry.courseCode].sourcesByRuleKey)[0].rawText).toBe(entry.prerequisiteEvidenceText);
});
