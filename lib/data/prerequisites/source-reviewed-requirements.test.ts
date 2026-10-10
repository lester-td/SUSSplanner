import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PrerequisiteTree } from "@/components/courses/prerequisite-tree/prerequisite-tree";
import fixtures from "./source-reviewed-requirement-fixtures.json";
import { emptyReviewFile, fixtureExtraction, fixtureTime } from "./fixtures";
import { materializeBatch, prepareReviewBatch } from "./batch-review";
import { buildRequisites } from "./build-requisites";
import { canonicalizeRule, courseLeaves } from "./rule";
import type { CourseNodeSummary } from "./types";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ prefetch: _prefetch, ...props }: { prefetch: boolean }) => createElement("a", props) };
});

it.each(fixtures)("retains scope, credit routes and concurrent conditions for source-reviewed $courseCode", fixture => {
  const base = fixtureExtraction();
  const evidence = [fixture.prerequisite, `Remarks: ${fixture.remarks}`].filter(Boolean).join("\n");
  const source = { ...base, metadata: { ...base.metadata, parserContractVersion: 2 }, review: { ...base.review,
    plans: base.review.plans.map(plan => ({ ...plan, programmeName: "Source review fixture", studyMode: "part-time" })),
    sourceEntries: [{ ...base.review.sourceEntries[0], courseCode: fixture.courseCode, prerequisite: fixture.prerequisite, remarks: fixture.remarks,
      prerequisiteSourceFields: fixture.prerequisite ? ["prerequisite", "remarks"] : ["remarks"], prerequisiteEvidenceText: evidence,
      parserContractVersion: 2, parseStatus: "review_required", parserRule: null,
    }],
  } };
  const catalogue: CourseNodeSummary[] = [fixture.courseCode, ...fixture.completedCourseCodes, ...fixture.concurrentCourseCodes].map(courseCode => ({ courseCode, courseName: courseCode, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const stored = { plans: [], rules: [] };
  const now = new Date(fixtureTime);
  const batch = prepareReviewBatch(source, "1".repeat(64), { formatVersion: 1, plans: [] }, emptyReviewFile(), stored, catalogue, now);
  const proposal = batch.rules[0];
  expect(proposal.decision).toBe("source_only");
  const triage = { formatVersion: 1, batchId: batch.batchId, plans: [], rules: [{ ruleKey: proposal.ruleKey, expectedInputHash: proposal.expectedInputHash, decision: "approved", approvedRule: fixture.rule }] };
  const accepted = materializeBatch(batch, triage, source, "1".repeat(64), stored, catalogue, "test-reviewer", now);
  const projected = buildRequisites(accepted.next.plans, accepted.next.rules, catalogue);
  const payload = projected.byCourse[fixture.courseCode];
  const tree = payload.prerequisiteVariants[0].rule!;
  expect(tree).toEqual(canonicalizeRule(fixture.rule));
  expect(courseLeaves(tree)).toEqual(fixture.completedCourseCodes);
  expect(projected.report.reversePairs).toBe(fixture.completedCourseCodes.length);
  for (const code of fixture.concurrentCourseCodes) expect(projected.byCourse[code].dependentCourses).toEqual([]);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: fixture.courseCode, requisites: payload }));
  expect(html).toContain("<summary>Remarks</summary>");
  expect(html).toContain(fixture.rule.displayRemarks[0].replaceAll("&", "&amp;"));
  if (fixture.courseCode === "ECE499") {
    expect(html).toContain("Completed 50 cu of ECE courses");
    expect(html).toContain("Completed 40 cu of ECE courses");
    expect(html).toContain("Enrolled in ECE490 at the same time as ECE499");
    expect(html).not.toContain('href="/courses/ECE490"');
  }
  expect(Object.values(payload.sourcesByRuleKey)[0].rawText).toBe(evidence);
  expect(html).not.toContain("Needs verification");
});
