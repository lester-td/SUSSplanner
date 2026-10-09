import { describe, expect, it } from "vitest";
import { buildRequisites } from "./build-requisites";
import { validateRequisitesSnapshot } from "./snapshot-validation";
import { fixtureCatalogue, fixturePlan, fixtureRule } from "./fixtures";

describe("review-gated per-course projection", () => {
  it.each(["pending", "source_only", "excluded"] as const)("never makes reverse edges for %s", reviewStatus => {
    const plan = fixturePlan(); const rule = fixtureRule(plan, undefined, { reviewStatus });
    const { byCourse, report } = buildRequisites([plan], [rule], fixtureCatalogue);
    expect(byCourse.PRE100.dependentCourses).toEqual([]);
    expect(byCourse.MAIN300.prerequisiteVariants).toHaveLength(reviewStatus === "excluded" ? 0 : 1);
    if (reviewStatus !== "excluded") expect(byCourse.MAIN300.prerequisiteVariants[0].rule).toBeNull();
    expect(report.activeIncludedRules[reviewStatus]).toBe(1);
  });
  it("groups identical approved structures while retaining every scoped source", () => {
    const first = fixturePlan(); const second = fixturePlan({ planKey: "other-programme", programmeName: "Other programme", sourceHash: "b".repeat(64) });
    const result = buildRequisites([first, second], [fixtureRule(first), fixtureRule(second)], fixtureCatalogue);
    expect(result.byCourse.MAIN300.prerequisiteVariants).toHaveLength(1);
    expect(result.byCourse.MAIN300.prerequisiteVariants[0].ruleKeys).toHaveLength(2);
    expect(result.byCourse.PRE100.prerequisiteVariants).toEqual([]);
    expect(result.byCourse.PRE100.dependentCourses).toEqual([{ courseCode: "MAIN300", ruleKeys: result.byCourse.MAIN300.prerequisiteVariants[0].ruleKeys }]);
    expect(result.report.reversePairs).toBe(1);
    expect(result.report.reverseContributions).toBe(2);
  });
  it("keeps programme variants separate and conditions never become edges", () => {
    const plan = fixturePlan();
    const rule = fixtureRule(plan, { type: "all", children: [{ type: "course", courseCode: "PRE100" }, { type: "condition", text: "30 CU including ALT200; concurrent NEXT400" }] });
    const result = buildRequisites([plan], [rule], fixtureCatalogue);
    expect(result.byCourse.ALT200.dependentCourses).toEqual([]);
    expect(result.byCourse.NEXT400.dependentCourses).toEqual([]);
  });
  it("allows unknown leaf and downstream codes without generating pages", () => {
    const plan = fixturePlan();
    const unknownLeaf = fixtureRule(plan, { type: "course", courseCode: "OLD999" });
    const unknownTarget = fixtureRule(plan, undefined, { courseCode: "OLD300", ruleKey: `prerequisite:${plan.planKey}:OLD300:default` });
    const result = buildRequisites([plan], [unknownLeaf, unknownTarget], fixtureCatalogue);
    expect(result.byCourse.MAIN300.coursesByCode.OLD999).toEqual({ courseCode: "OLD999", courseName: null, href: null, availability: "unknown", offeredSemesters: [] });
    expect(result.byCourse.PRE100.dependentCourses[0].courseCode).toBe("OLD300");
    expect(result.byCourse.OLD300).toBeUndefined();
  });
  it("omits inactive records and unselected plans, including historical hashes", () => {
    const plan = fixturePlan({ publicationStatus: "excluded" });
    const rule = fixtureRule(plan); rule.reviewInputHash = "historical";
    expect(buildRequisites([plan], [rule], fixtureCatalogue).byCourse.MAIN300.prerequisiteVariants).toEqual([]);
    expect(buildRequisites([fixturePlan()], [fixtureRule(undefined, undefined, { recordStatus: "inactive" })], fixtureCatalogue).byCourse.MAIN300.prerequisiteVariants).toEqual([]);
  });
  it("fails stale decisions/structures and self-prerequisites", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    expect(() => buildRequisites([plan], [{ ...rule, reviewedInputHash: "stale" }], fixtureCatalogue)).toThrow(/decision/);
    expect(() => buildRequisites([plan], [{ ...rule, rawText: "changed" }], fixtureCatalogue)).toThrow(/Stale/);
    expect(() => buildRequisites([plan], [{ ...rule, approvedRuleHash: "tampered" }], fixtureCatalogue)).toThrow(/fingerprint/);
    expect(() => buildRequisites([plan], [fixtureRule(plan, { type: "course", courseCode: "MAIN300" })], fixtureCatalogue)).toThrow(/Self/);
  });
  it("reports union-graph cycles without rejecting bounded expressions", () => {
    const plan = fixturePlan();
    const reverse = fixtureRule(plan, { type: "course", courseCode: "MAIN300" }, { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default` });
    expect(buildRequisites([plan], [fixtureRule(plan), reverse], fixtureCatalogue).report.cycles).toEqual([["MAIN300", "PRE100", "MAIN300"]]);
  });
  it("is deterministic under shuffled rows and removes private provenance", () => {
    const plans = [fixturePlan(), fixturePlan({ planKey: "other", sourceHash: "b".repeat(64) })];
    const rules = plans.map(plan => fixtureRule(plan));
    const a = buildRequisites(plans, rules, fixtureCatalogue);
    const b = buildRequisites([...plans].reverse(), [...rules].reverse(), [...fixtureCatalogue].reverse());
    expect(a).toEqual(b);
    const serialized = JSON.stringify(a.byCourse);
    for (const privateValue of ["test-reviewer", "demo.pdf", "approvedRuleHash", "ruleJson", "sourceHash"]) expect(serialized).not.toContain(privateValue);
  });
  it("rejects missing map entries, unsafe URLs and unwanted public fields", () => {
    const plan = fixturePlan();
    const payload = buildRequisites([plan], [fixtureRule(plan)], fixtureCatalogue).byCourse.MAIN300;
    delete payload.coursesByCode.PRE100;
    expect(() => validateRequisitesSnapshot(payload, "MAIN300")).toThrow();
    expect(() => buildRequisites([{ ...plan, sourceUrl: "file:///tmp/private.pdf" }], [], fixtureCatalogue)).toThrow();
    const clean = buildRequisites([plan], [fixtureRule(plan)], fixtureCatalogue).byCourse.MAIN300;
    (Object.values(clean.sourcesByRuleKey)[0] as unknown as Record<string, unknown>).reviewerAlias = "private";
    expect(() => validateRequisitesSnapshot(clean, "MAIN300")).toThrow();
  });
});

it("rejects unresolved evidence even with matching persisted approval fingerprints", () => {
  const plan = fixturePlan();
  const rule = fixtureRule(plan, undefined, { evidenceDiagnostics: ["Unresolved prerequisite OCR affects interpretation"] });
  expect(() => buildRequisites([plan], [rule], fixtureCatalogue)).toThrow(/Unresolved source interpretation/);
});
