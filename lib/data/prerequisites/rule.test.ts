import { describe, expect, it } from "vitest";
import { canonicalizeRule, PREREQUISITE_LIMITS, validateJsonBudget } from "./rule";
import { approvedRuleHash, fingerprint, publicationHash, reviewInputHash, sortedOccurrences, stableSerialize } from "./review-input";
import golden from "./hash-fixtures.json";
import { fixturePlan, fixtureRule } from "./fixtures";

const course = (courseCode: string) => ({ type: "course", courseCode });
describe("reviewed prerequisite structure", () => {
  it("normalizes codes and only trims outer condition whitespace", () => {
    expect(canonicalizeRule(course(" bus557Ae "))).toEqual(course("BUS557AE"));
    expect(canonicalizeRule({ type: "condition", text: "  Grade B  in ABC123.  " })).toEqual({ type: "condition", text: "Grade B  in ABC123." });
  });
  it("flattens homogeneous groups, sorts children and is idempotent", () => {
    const tree = canonicalizeRule({ type: "all", children: [course("XYZ999"), { type: "all", children: [course("ABC123")] }] });
    expect(tree).toEqual({ type: "all", children: [course("ABC123"), course("XYZ999")] });
    expect(canonicalizeRule(tree)).toEqual(tree);
    expect(canonicalizeRule({ type: "any", children: [course("ABC123")] })).toEqual(course("ABC123"));
  });
  it.each(["all", "any"])("rejects duplicate %s choices including after flattening", type => {
    expect(() => canonicalizeRule({ type, children: [course("abc123"), course("ABC123")] })).toThrow(/Duplicate/);
    expect(() => canonicalizeRule({ type, children: [course("ABC123"), { type, children: [course("ABC123"), course("XYZ999")] }] })).toThrow(/Duplicate/);
  });
  it("retains N-of even for one/all choices and rejects overlapping completions", () => {
    expect(canonicalizeRule({ type: "nOf", count: 1, children: [course("ABC123")] })).toEqual({ type: "nOf", count: 1, children: [course("ABC123")] });
    expect(() => canonicalizeRule({ type: "nOf", count: 2, children: [course("ABC123"), { type: "any", children: [course("ABC123"), course("XYZ999")] }] })).toThrow(/Overlapping/);
    expect(() => canonicalizeRule({ type: "nOf", count: 1, children: [course("ABC123"), course("ABC123")] })).toThrow(/Duplicate/);
  });
  it("retains root remarks through normalization and binds them to the approval hash", () => {
    const plain = course("MTD301");
    const annotated = canonicalizeRule({ type: "all", children: [plain], displayRemarks: ["  Video production experience is required.  "] });
    expect(annotated).toEqual({ ...plain, displayRemarks: ["Video production experience is required."] });
    expect(canonicalizeRule(annotated)).toEqual(annotated);
    expect(approvedRuleHash(annotated)).not.toBe(approvedRuleHash(plain));
    expect(approvedRuleHash({ ...annotated, displayRemarks: ["Different experience requirement."] })).not.toBe(approvedRuleHash(annotated));
  });
  it("rejects nested, duplicate, empty and oversized display remarks", () => {
    for (const value of [{ type: "all", children: [{ ...course("ABC123"), displayRemarks: ["Nested scope"] }] }, { ...course("ABC123"), displayRemarks: [] }, { ...course("ABC123"), displayRemarks: [" "] }, { ...course("ABC123"), displayRemarks: ["Same", " Same "] }, { ...course("ABC123"), displayRemarks: ["x".repeat(4097)] }]) expect(() => canonicalizeRule(value)).toThrow();
  });
  it.each([null, { type: "unparsed" }, { type: "condition", text: " " }, { type: "course", courseCode: "ABC-123" }, { type: "course", courseCode: "ABC123", extra: true }, { type: "all", children: [] }, { type: "nOf", count: 0, children: [course("ABC123")] }, { type: "nOf", count: 1.5, children: [course("ABC123")] }, { type: "nOf", count: 2, children: [course("ABC123")] }])("rejects malformed input %j", value => {
    expect(() => canonicalizeRule(value)).toThrow();
  });
  it("enforces depth, node, children and UTF-8 budgets before recursion", () => {
    let deep: unknown = course("ABC123");
    for (let index = 0; index < 100; index++) deep = { type: "all", children: [deep] };
    expect(() => canonicalizeRule(deep)).toThrow(/budget/);
    expect(() => canonicalizeRule({ type: "all", children: Array.from({ length: 33 }, (_, i) => course(`ABC${i}`)) })).toThrow(/children/);
    expect(() => canonicalizeRule({ type: "condition", text: "🙂".repeat(1025) })).toThrow(/budget/);
    const many = { type: "all", children: Array.from({ length: 32 }, () => ({ type: "any", children: [course("ABC123"), course("XYZ999")] })) };
    expect(() => canonicalizeRule(many)).toThrow(/nodes/);
    expect(() => validateJsonBudget({ type: "unparsed", text: "x".repeat(PREREQUISITE_LIMITS.textBytes + 1) }, true)).toThrow();
  });
});
describe("shared fingerprint contract", () => {
  it("matches checked-in contract-version-1 fingerprints", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    expect(plan.publicationInputHash).toBe(golden.publication);
    expect(rule.reviewInputHash).toBe(golden.input);
    expect(rule.approvedRuleHash).toBe(golden.approved);
    expect(fingerprint("golden", { z: null, é: "line\n\"quote\"", a: 1 })).toBe(golden.unicode);
  });
  it("uses fixed code-unit key order, JSON encoding, nulls and strict integers", () => {
    expect(stableSerialize({ z: null, é: "line\n\"quote\"", a: 1 })).toBe('{"a":1,"z":null,"é":"line\\n\\"quote\\""}');
    expect(() => stableSerialize({ value: undefined })).toThrow();
    expect(() => stableSerialize({ value: 1.5 })).toThrow();
  });
  it("sorts/deduplicates locators, putting null coordinates before positive ones", () => {
    const entry = { page: 1, table: null, row: null, section: null };
    expect(sortedOccurrences([{ ...entry, table: 2 }, entry, entry])).toEqual([entry, { ...entry, table: 2 }]);
  });
  it("preserves academic identity for path changes but invalidates evidence/scope changes", () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    const moved = { ...plan, sourcePath: "moved.pdf" };
    expect(publicationHash(moved)).toBe(publicationHash(plan));
    expect(reviewInputHash(moved, rule)).toBe(rule.reviewInputHash);
    expect(reviewInputHash(plan, { ...rule, parserContractVersion: 2 })).not.toBe(rule.reviewInputHash);
    expect(reviewInputHash(plan, { ...rule, applicabilityLabel: "Another cohort" })).not.toBe(rule.reviewInputHash);
    expect(publicationHash({ ...plan, sourceHash: "b".repeat(64) })).not.toBe(plan.publicationInputHash);
    expect(approvedRuleHash({ type: "all", children: [course("PRE100")] })).toBe(approvedRuleHash(course("PRE100")));
  });
});
