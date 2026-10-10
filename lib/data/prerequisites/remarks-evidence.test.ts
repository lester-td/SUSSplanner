import { describe, expect, it } from "vitest";
import { buildRequisites } from "./build-requisites";
import { emptyTriage, materializeBatch, prepareReviewBatch } from "./batch-review";
import { prerequisiteEvidence, reconcileReviews, validateExtraction } from "./import-review";
import { emptyReviewFile, fixtureCatalogue, fixtureExtraction, fixtureRegistry, fixtureTime } from "./fixtures";

const sha = "1".repeat(64);
const now = new Date(fixtureTime);
const empty = { plans: [], rules: [] };
function source(prerequisite: string | null, remarks: string, structured = true)
{
  const base = fixtureExtraction();
  const fields = prerequisite ? ["prerequisite", "remarks"] as const : ["remarks"] as const;
  const evidence = [prerequisite, `Remarks: ${remarks}`].filter(Boolean).join("\n");
  return { ...base, metadata: { ...base.metadata, parserContractVersion: 2 }, review: { ...base.review,
    plans: base.review.plans.map(plan => ({ ...plan, programmeName: "Remarks fixture programme", studyMode: "part-time" })),
    sourceEntries: [{ ...base.review.sourceEntries[0], prerequisite, remarks, parserContractVersion: 2,
      prerequisiteSourceFields: [...fields], prerequisiteRemarksCategories: ["course_order"], prerequisiteEvidenceText: evidence,
      parseStatus: structured ? "parsed" : "review_required", parserRule: structured ? { type: "course", courseCode: "PRE100", ...(prerequisite ? { displayRemarks: [remarks] } : {}) } : null,
    }],
  } };
}
describe("remarks evidence in parser contract 2", () => {
  it("includes remarks-only rows in mappings, publication proposals, snapshots and reverse relationships", () => {
    const extraction = source(null, "To take after completing PRE100.");
    const batch = prepareReviewBatch(extraction, sha, { formatVersion: 1, plans: [] }, emptyReviewFile(), empty, fixtureCatalogue, now);
    expect(batch.rules).toHaveLength(1);
    expect(batch.rules[0]).toMatchObject({ decision: "approved", rawText: "Remarks: To take after completing PRE100." });
    const accepted = materializeBatch(batch, emptyTriage(batch), extraction, sha, empty, fixtureCatalogue, "test-reviewer", now);
    const projected = buildRequisites(accepted.next.plans, accepted.next.rules, fixtureCatalogue);
    expect(projected.byCourse.MAIN300.prerequisiteVariants[0].rule).toEqual({ type: "course", courseCode: "PRE100" });
    expect(projected.byCourse.PRE100.dependentCourses.map(course => course.courseCode)).toEqual(["MAIN300"]);
    expect(accepted.next.rules[0].parserContractVersion).toBe(2);
  });
  it("keeps mandatory concurrent requirements as remarks without completion edges", () => {
    const extraction = source(null, "Students must take PRE100 concurrently with this course.", false);
    const batch = prepareReviewBatch(extraction, sha, { formatVersion: 1, plans: [] }, emptyReviewFile(), empty, fixtureCatalogue, now);
    expect(batch.rules[0].decision).toBe("source_only");
    const accepted = materializeBatch(batch, emptyTriage(batch), extraction, sha, empty, fixtureCatalogue, "test-reviewer", now);
    expect(accepted.coverage.reversePairs).toBe(0);
    expect(accepted.next.rules[0].rawText).toContain("concurrently");
  });
  it("binds non-pointer remarks and displayed qualifications to the review fingerprint", () => {
    const extraction = source("PRE100", "The prerequisite only applies to full-time students.");
    const batch = prepareReviewBatch(extraction, sha, { formatVersion: 1, plans: [] }, emptyReviewFile(), empty, fixtureCatalogue, now);
    const accepted = materializeBatch(batch, emptyTriage(batch), extraction, sha, empty, fixtureCatalogue, "test-reviewer", now);
    expect(accepted.next.rules[0].approvedRuleJson).toMatchObject({ displayRemarks: [extraction.review.sourceEntries[0].remarks] });
    const changed = source("PRE100", "The prerequisite only applies to part-time students.");
    const refreshed = prepareReviewBatch(changed, "2".repeat(64), accepted.registry, accepted.reviews, accepted.next, fixtureCatalogue, now);
    expect(refreshed.rules[0].expectedInputHash).not.toBe(batch.rules[0].expectedInputHash);
    expect(refreshed.baseReviews.reviews[0].archived).toBe(true);
    expect(() => materializeBatch(refreshed, { ...emptyTriage(refreshed), rules: [{ ruleKey: refreshed.rules[0].ruleKey, expectedInputHash: batch.rules[0].expectedInputHash, decision: "approved", approvedRule: batch.rules[0].approvedRule }] }, changed, "2".repeat(64), accepted.next, fixtureCatalogue, "test-reviewer", now)).toThrow(/stale triage/);
  });
  it("rejects omitted, fabricated, changed and unscanned source cells", () => {
    const extraction = source("PRE100", "Programme qualification.");
    const entry = extraction.review.sourceEntries[0];
    expect(() => prerequisiteEvidence({ ...entry, prerequisiteSourceFields: ["prerequisite"] })).toThrow(/source cells/);
    expect(() => prerequisiteEvidence({ ...entry, prerequisiteEvidenceText: "PRE100" })).toThrow(/source cells/);
    expect(() => prerequisiteEvidence({ ...entry, remarks: "Changed qualification" })).toThrow(/source cells/);
    expect(() => prerequisiteEvidence({ ...entry, prerequisiteSourceFields: undefined })).toThrow(/remarks scan/);
    const unchecked = { ...extraction, review: { ...extraction.review, sourceEntries: [{ ...entry, parserContractVersion: undefined }] } };
    expect(() => validateExtraction(unchecked)).toThrow(/remarks scan/);
    expect(() => prerequisiteEvidence({ ...entry, prerequisite: null, remarks: null, prerequisiteSourceFields: ["remarks"] })).toThrow(/source cells/);
  });
  it.each(["Labs run on weekends.", "Students are recommended to complete PRE100 first.", "Must obtain a GPA of 3.0 for credit recognition.", "PRE100 is a prerequisite for OTHER400."])("does not propose informational or recommended remarks: %s", remarks => {
    const base = source(null, remarks);
    const extraction = { ...base, review: { ...base.review, sourceEntries: [{ ...base.review.sourceEntries[0], prerequisiteSourceFields: [], prerequisiteEvidenceText: undefined, parserRule: undefined, parseStatus: undefined,
      prerequisiteRemarksAnalysis: [{ text: remarks, disposition: "information", reason: "No entry precondition for this course" }],
    }] } };
    const next = reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), empty, now);
    expect(next.rules).toHaveLength(0);
    expect(next.report.unmappedScopes).toEqual([]);
    const batch = prepareReviewBatch(extraction, sha, { formatVersion: 1, plans: [] }, emptyReviewFile(), empty, fixtureCatalogue, now);
    expect(batch.rules).toHaveLength(0);
  });
});
