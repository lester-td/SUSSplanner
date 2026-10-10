import { describe, expect, it } from "vitest";
import { reconcileReviews, generateReviewSql } from "./import-review";
import { emptyReviewFile, fixtureExtraction, fixturePlan, fixtureRegistry, fixtureRule, fixtureTime } from "./fixtures";
import { publicationHash } from "./review-input";

const empty = () => ({ plans: [], rules: [] });
describe("stable identity and review reconciliation", () => {
  it("creates pending records and reports exact review inputs without granting parser authority", () => {
    const next = reconcileReviews(fixtureExtraction(), fixtureRegistry(), emptyReviewFile(), empty());
    expect(next.plans[0].publicationStatus).toBe("unreviewed");
    expect(next.rules[0].reviewStatus).toBe("pending");
    expect(next.rules[0].ruleKey).toBe("prerequisite:demo-programme:MAIN300:default");
    expect(next.report.inputs[0].expectedInputHash).toBe(next.rules[0].reviewInputHash);
  });
  it("preserves approvals and update times on a no-op and path/extraction ordering changes", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const extraction = fixtureExtraction(); extraction.review.plans[0].planKey = "moved-path-key"; extraction.review.sourceEntries[0].planKey = "moved-path-key";
    const registry = fixtureRegistry(plan); registry.plans[0].sourcePath = "moved.pdf";
    const next = reconcileReviews(extraction, registry, emptyReviewFile(), { plans: [plan], rules: [rule] });
    expect(next.rules[0]).toEqual(rule);
    expect(next.plans[0].publicationStatus).toBe("included");
    expect(next.plans[0].publicationInputHash).toBe(plan.publicationInputHash);
    const unchanged = reconcileReviews(fixtureExtraction(), fixtureRegistry(plan), emptyReviewFile(), { plans: [plan], rules: [rule] });
    expect(unchanged.plans[0]).toEqual(plan);
    expect(generateReviewSql({ plans: [plan], rules: [rule] }, unchanged)).not.toMatch(/INSERT INTO|UPDATE curriculum/);
  });
  it("resets changed input to pending, preserving original parser results separately", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const extraction = fixtureExtraction(); extraction.review.sourceEntries[0].prerequisite = "PRE100 with grade B"; extraction.review.sourceEntries[0].parseStatus = "review_required"; extraction.review.sourceEntries[0].parserRule = null as never;
    const next = reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), { plans: [plan], rules: [rule] });
    expect(next.rules[0].reviewStatus).toBe("pending");
    expect(next.rules[0].approvedRuleJson).toBeNull();
    const reviews = emptyReviewFile();
    reviews.reviews.push({ ruleKey: next.rules[0].ruleKey, expectedInputHash: next.rules[0].reviewInputHash, reviewerAlias: "reviewer", reviewedAt: fixtureTime, decision: "approved", approvedRule: { type: "all", children: [{ type: "course", courseCode: "PRE100" }, { type: "condition", text: "Minimum grade B in PRE100" }] } });
    const approved = reconcileReviews(extraction, fixtureRegistry(), reviews, next);
    expect(approved.rules[0].approvedRuleJson?.type).toBe("all");
    expect(approved.rules[0].ruleJson).toBeNull();
    expect(approved.rules[0].parseStatus).toBe("review_required");
  });
  it("collapses identical occurrences but rejects conflicting text in one scope", () => {
    const extraction = fixtureExtraction();
    extraction.review.sourceEntries.push({ ...extraction.review.sourceEntries[0], sourceRow: 3 });
    extraction.metadata.entryCount = extraction.metadata.courseLikeRowCount = 2;
    extraction.review.plans[0].entryCount = extraction.review.plans[0].courseLikeRowCount = 2;
    const next = reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), empty());
    expect(next.rules).toHaveLength(1); expect(next.rules[0].sourceOccurrences).toHaveLength(2);
    extraction.review.sourceEntries[1].prerequisite = "ALT200";
    expect(() => reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), empty())).toThrow(/Conflicting/);
  });
  it("reports unmapped sources/scopes and honors explicit occurrence overrides", () => {
    const registry = fixtureRegistry(); registry.plans = [];
    expect(reconcileReviews(fixtureExtraction(), registry, emptyReviewFile(), empty()).report.unmappedSources).toEqual(["demo.pdf"]);
    const scoped = fixtureRegistry(); scoped.plans[0].sectionMappings = [];
    expect(reconcileReviews(fixtureExtraction(), scoped, emptyReviewFile(), empty()).report.unmappedScopes).toHaveLength(1);
    const overridden = { ...scoped, plans: [{ ...scoped.plans[0], occurrenceScopeOverrides: [{ page: 1, table: 1, row: 2, applicabilityKey: "default" }] }] };
    expect(reconcileReviews(fixtureExtraction(), overridden, emptyReviewFile(), empty()).rules).toHaveLength(1);
  });
  it("rejects source/scope identity collisions and malformed review artifacts", () => {
    const registry = fixtureRegistry(); registry.plans.push({ ...registry.plans[0], planKey: "other" });
    expect(() => reconcileReviews(fixtureExtraction(), registry, emptyReviewFile(), empty())).toThrow(/Duplicate/);
    const scoped = fixtureRegistry(); scoped.plans[0].sectionMappings.push({ extractedSection: "Core", applicabilityKey: "default" });
    expect(() => reconcileReviews(fixtureExtraction(), scoped, emptyReviewFile(), empty())).toThrow(/duplicate/);
    const reviews = emptyReviewFile(); reviews.reviews.push({ ruleKey: "unknown", expectedInputHash: "x", decision: "source_only", reviewerAlias: "", reviewedAt: fixtureTime });
    expect(() => reconcileReviews(fixtureExtraction(), fixtureRegistry(), reviews, empty())).toThrow();
  });
  it("rejects stale/current duplicate decisions and ignores archived decisions", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const reviews = emptyReviewFile(); reviews.reviews.push({ ruleKey: rule.ruleKey, expectedInputHash: "old-input", decision: "source_only", reviewerAlias: "reviewer", reviewedAt: fixtureTime, archived: true });
    expect(reconcileReviews(fixtureExtraction(), fixtureRegistry(), reviews, { plans: [plan], rules: [rule] }).rules[0].reviewStatus).toBe("approved");
    reviews.reviews[0].archived = false;
    expect(() => reconcileReviews(fixtureExtraction(), fixtureRegistry(), reviews, { plans: [plan], rules: [rule] })).toThrow(/stale/);
    reviews.reviews[0].expectedInputHash = rule.reviewInputHash;
    reviews.reviews.push({ ...reviews.reviews[0] });
    expect(() => reconcileReviews(fixtureExtraction(), fixtureRegistry(), reviews, { plans: [plan], rules: [rule] })).toThrow(/duplicate/);
  });
  it("never deactivates missing rules implicitly and retains inactive evidence", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const extraction = fixtureExtraction(); extraction.review.sourceEntries[0].prerequisite = null as never;
    const stored = { plans: [plan], rules: [rule] };
    const missing = reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), stored);
    expect(missing.rules[0]).toEqual(rule); expect(missing.report.missingActiveRules).toEqual([rule.ruleKey]);
    const reviews = emptyReviewFile(); reviews.deactivations.push({ ruleKey: rule.ruleKey, expectedInputHash: rule.reviewInputHash, reviewerAlias: "reviewer", reviewedAt: fixtureTime });
    const inactive = reconcileReviews(extraction, fixtureRegistry(), reviews, stored);
    expect(inactive.rules[0].recordStatus).toBe("inactive");
    expect(inactive.rules[0].approvedRuleJson).toEqual(rule.approvedRuleJson);
    expect(reconcileReviews(fixtureExtraction(), fixtureRegistry(), emptyReviewFile(), inactive).rules[0]).toEqual(inactive.rules[0]);
  });
  it("requires refresh or explicit deactivation before including changed PDF bytes", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const registry = fixtureRegistry(); registry.plans[0].sourceHash = "b".repeat(64);
    registry.plans[0].publication = { decision: "included", expectedInputHash: publicationHash(registry.plans[0]), reviewerAlias: "reviewer", reviewedAt: fixtureTime };
    const extraction = fixtureExtraction(); extraction.review.plans[0].sourceHash = "b".repeat(64); extraction.review.sourceEntries[0].prerequisite = null as never;
    expect(() => reconcileReviews(extraction, registry, emptyReviewFile(), { plans: [plan], rules: [rule] })).toThrow(/unrefreshed/);
    const reviews = emptyReviewFile(); reviews.deactivations.push({ ruleKey: rule.ruleKey, expectedInputHash: rule.reviewInputHash, reviewerAlias: "reviewer", reviewedAt: fixtureTime });
    const next = reconcileReviews(extraction, registry, reviews, { plans: [plan], rules: [rule] });
    expect(next.plans[0].publicationStatus).toBe("included");
    expect(next.rules[0].sourceHash).toBe(plan.sourceHash);
  });
  it("rejects incomplete/error extraction and future review times", () => {
    const extraction = fixtureExtraction(); extraction.metadata.entryCount = 2;
    expect(() => reconcileReviews(extraction, fixtureRegistry(), emptyReviewFile(), empty())).toThrow(/incomplete/);
    const bad = fixtureExtraction(); bad.review.issues.push({ severity: "error", issue: "truncated" });
    expect(() => reconcileReviews(bad, fixtureRegistry(), emptyReviewFile(), empty())).toThrow(/incomplete/);
    const registry = fixtureRegistry(); registry.plans[0].publication = { decision: "included", expectedInputHash: publicationHash(registry.plans[0]), reviewerAlias: "reviewer", reviewedAt: "2080-01-01T00:00:00Z" };
    expect(() => reconcileReviews(fixtureExtraction(), registry, emptyReviewFile(), empty())).toThrow(/future/);
  });
  it("guards SQL by full retained input/decision/activity state and quotes source text", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan, undefined, { rawText: "Quoted 'condition' and \\ text" });
    const sql = generateReviewSql({ plans: [plan], rules: [rule] }, { plans: [plan], rules: [rule] });
    expect(sql).toContain("pg_advisory_xact_lock"); expect(sql).toContain("SHARE ROW EXCLUSIVE");
    for (const column of ["reviewed_at", "review_status", "approved_rule_hash", "record_status", "last_updated"]) expect(sql).toContain(column);
    expect(sql).toContain("count(*)");
    expect(sql).not.toMatch(/DELETE FROM/);
  });
});
