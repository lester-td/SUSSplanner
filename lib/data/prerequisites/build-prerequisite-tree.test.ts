import { expect, it, vi } from "vitest";
import { buildPrerequisiteTree } from "./build-prerequisite-tree";
import { buildRequisites } from "./build-requisites";
import { fixturePlan, fixtureRule } from "./fixtures";
import { courseLeaves } from "./rule";
import type { CourseNodeSummary, CourseRequisitesSnapshot, ExpandedPrerequisiteRuleNode, PrerequisiteRuleNode, PrerequisiteTreeData } from "./types";

function projection(trees: Record<string, PrerequisiteRuleNode>, unknown: string[] = [])
{
  const plan = fixturePlan();
  const codes = [...new Set([...Object.keys(trees), ...Object.values(trees).flatMap(courseLeaves)])];
  const catalogue: CourseNodeSummary[] = codes.filter(code => !unknown.includes(code)).map(courseCode => ({ courseCode, courseName: `${courseCode} sample`, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const rules = Object.entries(trees).map(([courseCode, tree]) => fixtureRule(plan, tree, { courseCode, ruleKey: `prerequisite:${plan.planKey}:${courseCode}:default` }));
  const { byCourse } = buildRequisites([plan], rules, catalogue);
  const read = vi.fn(async (code: string): Promise<CourseRequisitesSnapshot | null> => byCourse[code] ?? null);
  return { byCourse, read };
}
const course = (courseCode: string): PrerequisiteRuleNode => ({ type: "course", courseCode });
function flatten(tree: PrerequisiteTreeData)
{
  const nodes: ExpandedPrerequisiteRuleNode[] = tree.variants.flatMap(variant => variant.rule ? [variant.rule] : []);
  for (let index = 0; index < nodes.length; index++)
  {
    const node = nodes[index];
    if (node.type === "course") nodes.push(...node.requirements.flatMap(variant => variant.rule ? [variant.rule] : []));
    else if (node.type !== "condition") nodes.push(...node.children);
  }
  return nodes;
}

it("preserves all, any and numbered-choice groups while expanding their course leaves", async () => {
  const { byCourse, read } = projection({ ROOT100: { type: "all", children: [
    { type: "any", children: [course("LEFT200"), course("RIGHT200")] },
    { type: "nOf", count: 2, children: [course("PRE100"), course("PRE200"), course("PRE300")] },
  ] }, LEFT200: { type: "all", children: [course("BASE100"), course("BASE200")] }, RIGHT200: { type: "any", children: [course("BASE300"), course("OLD999")] }, BASE100: { type: "condition", text: "Minimum 30 CU" } }, ["OLD999"]);
  const tree = await buildPrerequisiteTree("ROOT100", byCourse.ROOT100, read);
  expect(tree.variants[0].rule).toMatchObject({ type: "all", children: [
    { type: "any", children: [{ courseCode: "LEFT200", requirements: [{ rule: { type: "all" } }] }, { courseCode: "RIGHT200", requirements: [{ rule: { type: "any" } }] }] },
    { type: "nOf", count: 2, children: [{ courseCode: "PRE100" }, { courseCode: "PRE200" }, { courseCode: "PRE300" }] },
  ] });
  const nodes = flatten(tree);
  expect(nodes.filter(node => node.type === "course").map(node => node.courseCode).sort()).toEqual(["BASE100", "BASE200", "BASE300", "LEFT200", "OLD999", "PRE100", "PRE200", "PRE300", "RIGHT200"]);
  expect(nodes).toContainEqual({ type: "condition", text: "Minimum 30 CU" });
  expect(read.mock.calls.flat()).not.toContain("OLD999");
});

it("expands long course chains without applying the individual-rule depth limit", async () => {
  const codes = Array.from({ length: 48 }, (_, index) => `COURSE${100 + index}`);
  const { byCourse, read } = projection(Object.fromEntries(codes.slice(0, -1).map((code, index) => [code, course(codes[index + 1])])));
  const tree = await buildPrerequisiteTree(codes[0], byCourse[codes[0]], read);
  expect(flatten(tree).filter(node => node.type === "course").map(node => node.courseCode)).toEqual(codes.slice(1));
  expect(read).toHaveBeenCalledTimes(47);
});

it("keeps shared courses in every logical choice but expands their shortest occurrence once", async () => {
  const { byCourse, read } = projection({ ROOT100: { type: "all", children: [course("LEFT200"), course("RIGHT200"), course("SHARED300")] }, LEFT200: course("SHARED300"), RIGHT200: course("SHARED300"), SHARED300: course("BASE400") });
  const nodes = flatten(await buildPrerequisiteTree("ROOT100", byCourse.ROOT100, read));
  const shared = nodes.filter(node => node.type === "course" && node.courseCode === "SHARED300");
  expect(shared).toHaveLength(3);
  expect(shared.filter(node => node.type === "course" && node.reference)).toHaveLength(2);
  expect(nodes.filter(node => node.type === "course" && node.courseCode === "BASE400")).toHaveLength(1);
  expect(read.mock.calls.filter(([code]) => code === "SHARED300")).toHaveLength(1);
});

it("stops cycles at a marked course reference", async () => {
  const { byCourse, read } = projection({ ROOT100: course("NEXT200"), NEXT200: course("ROOT100") });
  const tree = await buildPrerequisiteTree("ROOT100", byCourse.ROOT100, read);
  expect(flatten(tree)).toContainEqual(expect.objectContaining({ type: "course", courseCode: "ROOT100", reference: true, requirements: [] }));
  expect(read.mock.calls).toEqual([["NEXT200"]]);
});

it("retains nested text-only remarks without inventing prerequisite edges or missing metadata", async () => {
  const plan = fixturePlan();
  const root = fixtureRule(plan, { type: "all", children: [course("PRE100"), course("OLD999")], displayRemarks: ["Root condition."] });
  const text = fixtureRule(plan, undefined, { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default`, reviewStatus: "source_only", rawText: "Department approval; ALT200 may be taken concurrently." });
  const catalogue: CourseNodeSummary[] = ["MAIN300", "PRE100", "ALT200"].map(courseCode => ({ courseCode, courseName: courseCode, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const { byCourse } = buildRequisites([plan], [root, text], catalogue);
  const read = vi.fn(async (code: string) => byCourse[code] ?? null);
  const tree = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, read);
  expect(tree.remarks).toMatchObject([{ courseCode: "MAIN300", texts: ["Root condition."] }, { courseCode: "PRE100", texts: [text.rawText], pending: false }]);
  const nodes = flatten(tree);
  expect(nodes.filter(node => node.type === "course").map(node => node.courseCode)).toEqual(["OLD999", "PRE100"]);
  expect(nodes.find(node => node.type === "course" && node.courseCode === "OLD999")).toMatchObject({ course: { availability: "unknown", href: null }, requirements: [] });
  expect(read.mock.calls).toEqual([["PRE100"]]);
  const missing = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async () => null);
  expect(flatten(missing).filter(node => node.type === "course").every(node => node.requirements.length === 0)).toBe(true);
});
