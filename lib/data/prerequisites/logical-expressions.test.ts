import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import logicalFixtures from "../../../scraper/tools/fixtures/curriculum_logical_expressions.json";
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
  throw new Error("Expected a course-only logical fixture");
}

it.each(logicalFixtures)("preserves every combination for $courseCode through batch review and display", fixture => {
  const rule = canonicalizeRule(fixture.rule);
  const leaves = courseLeaves(rule);
  const base = fixtureExtraction();
  const source = { ...base, review: { ...base.review,
    plans: base.review.plans.map(plan => ({ ...plan, programmeName: "Logical expression fixture", studyMode: "part-time" })),
    sourceEntries: [{ ...base.review.sourceEntries[0], courseCode: fixture.courseCode, prerequisite: fixture.rawText, parserRule: fixture.rule }],
  } };
  const catalogue: CourseNodeSummary[] = [fixture.courseCode, ...leaves].map(courseCode => ({ courseCode, courseName: `${courseCode} fixture`, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const stored = { plans: [], rules: [] };
  const now = new Date(fixtureTime);
  const batch = prepareReviewBatch(source, "1".repeat(64), { formatVersion: 1, plans: [] }, emptyReviewFile(), stored, catalogue, now);
  expect(batch.rules[0]).toMatchObject({ decision: "approved", approvedRule: rule, reasons: [] });
  const accepted = materializeBatch(batch, emptyTriage(batch), source, "1".repeat(64), stored, catalogue, "test-reviewer", now);
  const projection = buildRequisites(accepted.next.plans, accepted.next.rules, catalogue);
  const payload = projection.byCourse[fixture.courseCode];
  validateRequisitesSnapshot(payload, fixture.courseCode);
  const published = payload.prerequisiteVariants[0].rule!;
  expect(published).toEqual(rule);
  expect(projection.report.reversePairs).toBe(leaves.length);
  expect(projection.report.reverseContributions).toBe(leaves.length);
  expect(Object.values(payload.sourcesByRuleKey)[0].rawText).toBe(fixture.rawText);
  for (let mask = 0; mask < 2 ** leaves.length; mask++)
  {
    const completed = new Set(leaves.filter((_, index) => mask & (1 << index)));
    const has = (code: string) => completed.has(code);
    const expected = {
      ENG308: completed.size >= 2,
      ENG209: has("ENG101") && has("ENG103") && (has("ICT133") || has("ICT162")),
      ACC351: has("ACC201") && has("ACC305") && has("BUS201") && has("BUS205"),
      ACC353: has("ANL303") && (has("ACC202") || has("ACC201") && has("ACC203")),
      BME313: has("BME207") || has("BME107") && has("BME108") || has("BME209") && has("BME210"),
    }[fixture.courseCode];
    expect(matches(published, completed), `completed ${[...completed].join(", ")}`).toBe(expected);
  }
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: fixture.courseCode, requisites: payload }));
  expect(html).toContain(fixture.courseCode === "ENG308" ? "at least 2 of" : "all of");
  expect(html.includes("one of")).toBe(!["ACC351", "ENG308"].includes(fixture.courseCode));
  expect(html).toContain(fixture.rawText);
  expect(html).not.toContain("<summary>Remarks</summary>");
  expect(html).not.toContain("No published remarks.");
  expect(html).not.toContain("Needs verification");
});
