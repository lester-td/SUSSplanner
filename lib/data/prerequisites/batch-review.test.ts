import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import { emptyTriage, materializeBatch, prepareReviewBatch, reviewBatch, validateBatch } from "./batch-review";
import { renderBatchReport } from "./batch-report";
import { emptyReviewFile, fixtureCatalogue, fixtureExtraction, fixtureTime } from "./fixtures";
import { publicationHash } from "./review-input";
import { generateReviewSql } from "./import-review";

const now = new Date(fixtureTime);
const sha = "1".repeat(64);
const emptyRegistry = { formatVersion: 1, plans: [] };
const emptyStored = () => ({ plans: [], rules: [] });
function extraction()
{
  const value = fixtureExtraction();
  return { ...value, review: { ...value.review, plans: value.review.plans.map(plan => ({ ...plan, programmeName: "Demonstration programme", studyMode: "part-time" })) } };
}
const prepare = (source = extraction()) => prepareReviewBatch(source, sha, emptyRegistry, emptyReviewFile(), emptyStored(), fixtureCatalogue, now);
describe("automated preparation followed by explicit batch review", () => {
  it("creates proposals and source-section mappings without inventing approvals or versions", () => {
    const batch = prepare();
    expect(batch.registry.plans[0]).toMatchObject({ planKey: "demonstration-programme-part-time", publication: null, curriculumVersion: null, effectiveFrom: null });
    expect(batch.registry.plans[0].scopes[0].applicabilityLabel).toBe("Source section: Core");
    expect(batch.baseReviews.reviews).toEqual([]);
    expect(batch.rules[0]).toMatchObject({ decision: "approved", approvedRule: { type: "course", courseCode: "PRE100" }, reasons: [], sourceOccurrences: [{ page: 1, table: 1, row: 2, section: "Core" }] });
    expect(validateBatch(batch)).toEqual(batch);
  });
  it("keeps unsupported grammar and unknown catalogue references in the exception queue", () => {
    const source = extraction();
    source.review.sourceEntries[0].parseStatus = "review_required";
    source.review.sourceEntries[0].parserRule = null as never;
    source.review.sourceEntries[0].prerequisite = "PRE100, ALT200";
    expect(prepare(source).rules[0]).toMatchObject({ decision: "source_only", approvedRule: null });
    const unknown = extraction(); unknown.review.sourceEntries[0].parserRule.courseCode = "OLD999";
    const proposal = prepare(unknown).rules[0];
    expect(proposal.decision).toBe("source_only");
    expect(proposal.reasons.join(" ")).toContain("OLD999");
  });
  it("records one explicit approval across the exact source and rule inputs", () => {
    const source = extraction(); const batch = prepare(source);
    const accepted = materializeBatch(batch, emptyTriage(batch), source, sha, emptyStored(), fixtureCatalogue, "lester", now);
    expect(accepted.registry.plans[0].publication).toMatchObject({ reviewerAlias: "lester", reviewedAt: fixtureTime, expectedInputHash: publicationHash(accepted.registry.plans[0]) });
    expect(accepted.reviews.reviews[0]).toMatchObject({ reviewerAlias: "lester", reviewedAt: fixtureTime, decision: "approved", expectedInputHash: batch.rules[0].expectedInputHash });
    expect(accepted.coverage.reversePairs).toBe(1);
    expect(generateReviewSql(emptyStored(), accepted.next)).toContain("BEGIN;");
  });
  it("publishes same-row remarks as evidence and changed remarks require a new decision", () => {
    const base = extraction();
    const source = { ...base, review: { ...base.review, sourceEntries: [{ ...base.review.sourceEntries[0], prerequisite: "See Remarks.", remarks: "Complete Levels 1 and 2 compulsory literature courses.", prerequisiteNormalizedText: "Complete Levels 1 and 2 compulsory literature courses.", parseStatus: "unparsed", parserRule: null }] } };
    const batch = prepareReviewBatch(source, sha, emptyRegistry, emptyReviewFile(), emptyStored(), fixtureCatalogue, now);
    expect(batch.rules[0]).toMatchObject({ decision: "source_only", rawText: "See Remarks.\nRemarks: Complete Levels 1 and 2 compulsory literature courses.", normalizedText: source.review.sourceEntries[0].remarks });
    const accepted = materializeBatch(batch, emptyTriage(batch), source, sha, emptyStored(), fixtureCatalogue, "test-reviewer", now);
    expect(accepted.coverage.reversePairs).toBe(0);
    const changed = { ...source, review: { ...source.review, sourceEntries: [{ ...source.review.sourceEntries[0], remarks: "Complete Levels 1, 2 and 3 literature courses." }] } };
    const refreshed = prepareReviewBatch(changed, "2".repeat(64), accepted.registry, accepted.reviews, accepted.next, fixtureCatalogue, now);
    expect(refreshed.rules[0].expectedInputHash).not.toBe(batch.rules[0].expectedInputHash);
    expect(refreshed.baseReviews.reviews[0].archived).toBe(true);
    expect(() => prepareReviewBatch({ ...source, review: { ...source.review, sourceEntries: [{ ...source.review.sourceEntries[0], prerequisiteEvidenceText: "Unrelated text" }] } }, sha, emptyRegistry, emptyReviewFile(), emptyStored(), fixtureCatalogue, now)).toThrow(/source cells/);
    expect(renderBatchReport(batch)).toContain("Complete Levels 1 and 2 compulsory literature courses.");
  });
  it("keeps different remarks cells as separate source occurrences for triage", () => {
    const base = extraction();
    const entries = ["First scoped requirement", "Second scoped requirement"].map((remarks, index) => ({ ...base.review.sourceEntries[0], prerequisite: "See Remarks.", remarks, sourceRow: index + 2, parseStatus: "unparsed", parserRule: null }));
    const source = { ...base, metadata: { ...base.metadata, entryCount: 2, courseLikeRowCount: 2 }, review: { ...base.review, plans: base.review.plans.map(plan => ({ ...plan, entryCount: 2, courseLikeRowCount: 2 })), sourceEntries: entries } };
    const batch = prepareReviewBatch(source, sha, emptyRegistry, emptyReviewFile(), emptyStored(), fixtureCatalogue, now);
    expect(batch.rules).toHaveLength(2);
    expect(batch.rules.every(rule => rule.reasons.includes("Applicability requires triage before a structured approval"))).toBe(true);
  });
  it("binds approval to triage choices and rejects other batches, duplicate and stale entries", () => {
    const batch = prepare(); const triage = emptyTriage(batch);
    const original = reviewBatch(batch).approvalId;
    triage.rules.push({ ruleKey: batch.rules[0].ruleKey, expectedInputHash: batch.rules[0].expectedInputHash, decision: "source_only" });
    expect(reviewBatch(batch, triage).approvalId).not.toBe(original);
    expect(() => reviewBatch(batch, { ...triage, batchId: "other" })).toThrow(/different batch/);
    expect(() => reviewBatch(batch, { ...triage, rules: [...triage.rules, ...triage.rules] })).toThrow(/Duplicate/);
    expect(() => reviewBatch(batch, { ...triage, rules: [{ ...triage.rules[0], expectedInputHash: "stale" }] })).toThrow(/stale/);
  });
  it("refuses changed batch contents, extraction, catalogue and newer database decisions", () => {
    const source = extraction(); const batch = prepare(source); const triage = emptyTriage(batch);
    expect(() => validateBatch({ ...batch, rules: [{ ...batch.rules[0], rawText: "modified" }] })).toThrow(/contents changed/);
    expect(() => materializeBatch(batch, triage, source, "2".repeat(64), emptyStored(), fixtureCatalogue, "lester", now)).toThrow(/Extraction changed/);
    expect(() => materializeBatch(batch, triage, source, sha, emptyStored(), fixtureCatalogue.slice(1), "lester", now)).toThrow(/Catalogue changed/);
    const accepted = materializeBatch(batch, triage, source, sha, emptyStored(), fixtureCatalogue, "lester", now);
    expect(() => materializeBatch(batch, triage, source, sha, accepted.next, fixtureCatalogue, "lester", now)).toThrow(/Database decisions/);
  });
  it("keeps same-input decision corrections unique and repeat imports preserve timestamps", () => {
    const source = extraction(); const batch = prepare(source);
    const first = materializeBatch(batch, emptyTriage(batch), source, sha, emptyStored(), fixtureCatalogue, "lester", now);
    const second = prepareReviewBatch(source, sha, first.registry, first.reviews, first.next, fixtureCatalogue, new Date("2026-10-02T00:00:00Z"));
    const repeat = materializeBatch(second, emptyTriage(second), source, sha, first.next, fixtureCatalogue, "second-reviewer", new Date("2026-10-03T00:00:00Z"));
    expect(repeat.next.rules).toEqual(first.next.rules);
    expect(repeat.next.plans).toEqual(first.next.plans);
    const triage = emptyTriage(second);
    triage.rules.push({ ruleKey: second.rules[0].ruleKey, expectedInputHash: second.rules[0].expectedInputHash, decision: "source_only" });
    const changed = materializeBatch(second, triage, source, sha, first.next, fixtureCatalogue, "lester", new Date("2026-10-03T00:00:00Z"));
    expect(changed.reviews.reviews).toHaveLength(1);
    expect(changed.next.rules[0].reviewStatus).toBe("source_only");
  });
  it("retains stable programme keys when a registered document changes", () => {
    const source = extraction(); const batch = prepare(source);
    const changed = extraction(); changed.review.plans[0].sourceHash = "b".repeat(64);
    const result = prepareReviewBatch(changed, "2".repeat(64), batch.registry, emptyReviewFile(), emptyStored(), fixtureCatalogue, now);
    expect(result.registry.plans[0].planKey).toBe(batch.registry.plans[0].planKey);
    expect(result.registry.plans[0].publication).toBeNull();
    expect(result.batchId).not.toBe(batch.batchId);
  });
  it("separates conflicting occurrences and prevents structuring unresolved applicability", () => {
    const source = extraction();
    source.review.sourceEntries.push({ ...source.review.sourceEntries[0], sourceRow: 3, prerequisite: "ALT200", parserRule: { type: "course", courseCode: "ALT200" } });
    source.metadata.entryCount = source.metadata.courseLikeRowCount = 2;
    source.review.plans[0].entryCount = source.review.plans[0].courseLikeRowCount = 2;
    const batch = prepare(source);
    expect(batch.rules).toHaveLength(2);
    expect(batch.rules.every(rule => rule.decision === "source_only")).toBe(true);
    const triage = emptyTriage(batch);
    triage.rules.push({ ruleKey: batch.rules[0].ruleKey, expectedInputHash: batch.rules[0].expectedInputHash, decision: "approved" });
    expect(() => reviewBatch(batch, triage)).toThrow(/Resolve applicability/);
  });
  it("rejects self-reference corrections and incomplete extraction", () => {
    const batch = prepare(); const triage = emptyTriage(batch);
    triage.rules.push({ ruleKey: batch.rules[0].ruleKey, expectedInputHash: batch.rules[0].expectedInputHash, decision: "approved", approvedRule: { type: "course", courseCode: "MAIN300" } });
    expect(() => reviewBatch(batch, triage)).toThrow(/Self-reference/);
    const source = extraction(); source.metadata.entryCount = 0;
    expect(() => prepare(source)).toThrow(/incomplete/);
  });
  it("escapes source text and embedded report JSON rather than executing source markup", () => {
    const source = extraction(); source.review.sourceEntries[0].prerequisite = '</script><script>alert("unsafe")</script>';
    source.review.sourceEntries[0].parseStatus = "unparsed";
    source.review.sourceEntries[0].parserRule = null as never;
    const html = renderBatchReport(prepare(source));
    expect(html).not.toContain('</script><script>alert("unsafe")');
    expect(html).toContain("&lt;/script&gt;");
    expect(html).toContain("\\u003c/script>");
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    expect(() => new Script(scripts.at(-1)![1])).not.toThrow();
  });
});
