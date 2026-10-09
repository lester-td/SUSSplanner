import { expect, it, vi } from "vitest";
import { buildPostrequisiteTree } from "./build-postrequisite-tree";
import { buildRequisites } from "./build-requisites";
import { fixturePlan, fixtureRule } from "./fixtures";
import type { CourseNodeSummary, CourseRequisitesSnapshot, PostrequisiteNode } from "./types";

function projection(requirements: Record<string, string[]>, unknownCodes: string[] = [])
{
  const plan = fixturePlan();
  const codes = [...new Set([...Object.keys(requirements), ...Object.values(requirements).flat()])];
  const catalogue: CourseNodeSummary[] = codes.filter(code => !unknownCodes.includes(code)).map(courseCode => ({ courseCode, courseName: `${courseCode} sample`, href: `/courses/${courseCode}`, availability: "catalogued", offeredSemesters: [] }));
  const rules = Object.entries(requirements).filter(([, prerequisites]) => prerequisites.length).map(([courseCode, prerequisites]) => fixtureRule(plan, {
    type: "all", children: prerequisites.map(courseCode => ({ type: "course", courseCode })),
  }, { courseCode, ruleKey: `prerequisite:${plan.planKey}:${courseCode}:default` }));
  const { byCourse } = buildRequisites([plan], rules, catalogue);
  const read = vi.fn(async (code: string): Promise<CourseRequisitesSnapshot | null> => byCourse[code] ?? null);
  return { byCourse, read };
}

function flatten(roots: PostrequisiteNode[])
{
  const nodes = [...roots];
  for (let index = 0; index < nodes.length; index++) nodes.push(...nodes[index].dependents);
  return nodes;
}

it("includes the full downstream chain without an arbitrary depth or course limit", async () => {
  const codes = Array.from({ length: 48 }, (_, index) => `COURSE${100 + index}`);
  const requirements = Object.fromEntries(codes.map((code, index) => [code, index ? [codes[index - 1]] : []]));
  const { byCourse, read } = projection(requirements);
  const nodes = flatten(await buildPostrequisiteTree(codes[0], byCourse[codes[0]], read));
  expect(nodes.map(node => node.course.courseCode)).toEqual(codes.slice(1));
  expect(read).toHaveBeenCalledTimes(47);
  expect(nodes.every(node => !node.reference)).toBe(true);
});

it("keeps shared edges visible and expands each course along its shortest route once", async () => {
  const { byCourse, read } = projection({ ROOT100: [], LEFT200: ["ROOT100"], RIGHT200: ["ROOT100"], SHARED300: ["LEFT200", "RIGHT200"], FINAL400: ["SHARED300"] });
  const tree = await buildPostrequisiteTree("ROOT100", byCourse.ROOT100, read);
  expect(tree.map(node => node.course.courseCode)).toEqual(["LEFT200", "RIGHT200"]);
  expect(tree[0].dependents[0].dependents[0].course.courseCode).toBe("FINAL400");
  expect(tree[1].dependents[0]).toMatchObject({ course: { courseCode: "SHARED300" }, reference: true, dependents: [] });
  expect(read.mock.calls.flat().sort()).toEqual(["FINAL400", "LEFT200", "RIGHT200", "SHARED300"]);

  const shortcut = projection({ ROOT100: [], LEFT200: ["ROOT100"], SHARED300: ["ROOT100", "LEFT200"], FINAL400: ["SHARED300"] });
  const routes = await buildPostrequisiteTree("ROOT100", shortcut.byCourse.ROOT100, shortcut.read);
  expect(routes[0].dependents[0].reference).toBe(true);
  expect(routes[1].dependents[0].course.courseCode).toBe("FINAL400");
});

it("stops cyclic expansion while preserving the relationship back to the root", async () => {
  const { byCourse, read } = projection({ ROOT100: ["NEXT200"], NEXT200: ["ROOT100"] });
  const tree = await buildPostrequisiteTree("ROOT100", byCourse.ROOT100, read);
  expect(tree[0].dependents[0]).toMatchObject({ course: { courseCode: "ROOT100" }, reference: true, dependents: [] });
  expect(read.mock.calls).toEqual([["NEXT200"]]);
});

it("retains unknown and missing downstream courses as leaves and avoids unrelated reads", async () => {
  const { byCourse, read } = projection({ ROOT100: [], NEXT200: ["ROOT100"], OLD300: ["ROOT100"], OTHER400: [] }, ["OLD300"]);
  read.mockResolvedValue(null);
  const tree = await buildPostrequisiteTree("ROOT100", byCourse.ROOT100, read);
  expect(tree.map(node => node.course.courseCode)).toEqual(["NEXT200", "OLD300"]);
  expect(tree[1].course).toMatchObject({ availability: "unknown", href: null, courseName: null });
  expect(tree.every(node => node.dependents.length === 0)).toBe(true);
  expect(read.mock.calls).toEqual([["NEXT200"]]);

  const emptyRead = vi.fn();
  expect(await buildPostrequisiteTree("OTHER400", byCourse.OTHER400, emptyRead)).toEqual([]);
  expect(emptyRead).not.toHaveBeenCalled();
});
