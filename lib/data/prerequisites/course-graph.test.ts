import { expect, it } from "vitest";
import { buildCourseGraph, compactGraphRule, layoutCourseGraph, type GraphRule } from "./course-graph";
import { buildPrerequisiteTree } from "./build-prerequisite-tree";
import { buildPostrequisiteTree } from "./build-postrequisite-tree";
import { buildRequisites } from "./build-requisites";
import { fixtureCatalogue, fixturePlan, fixtureRule } from "./fixtures";
import { canonicalizeRule } from "./rule";
import type { PrerequisiteRuleNode } from "./types";

const course = (courseCode: string): PrerequisiteRuleNode => ({ type: "course", courseCode });
const all = (...codes: string[]): PrerequisiteRuleNode => ({ type: "all", children: codes.map(course) });
function matches(rule: GraphRule | PrerequisiteRuleNode, completed: Set<string>): boolean
{
  if (rule.type === "course") return completed.has(rule.courseCode);
  if (rule.type === "condition") throw new Error("Course-only truth-table fixture expected");
  if (rule.type === "all") return rule.children.every(child => matches(child, completed));
  if (rule.type === "any") return rule.children.some(child => matches(child, completed));
  return rule.children.filter(child => matches(child, completed)).length >= rule.count;
}

it("compacts complete pairs to a counted choice without changing any completion combination", () => {
  const rule: PrerequisiteRuleNode = { type: "any", children: [all("ENG201", "ENG203"), all("ENG201", "ENG311"), all("ENG203", "ENG311")] };
  const compact = compactGraphRule(rule);
  expect(compact).toMatchObject({ type: "nOf", count: 2, children: [course("ENG201"), course("ENG203"), course("ENG311")] });
  const codes = ["ENG201", "ENG203", "ENG311"];
  for (let mask = 0; mask < 8; mask++)
  {
    const completed = new Set(codes.filter((_, index) => mask & (1 << index)));
    expect(matches(compact, completed)).toBe(matches(rule, completed));
  }
  for (const children of [[all("ENG201", "ENG203"), all("ENG201", "ENG311")], [all("ENG201", "ENG203"), course("ENG311")]])
    expect(compactGraphRule({ type: "any", children }).type).not.toBe("nOf");
});

it("factors PSY405's common courses above its alternative without changing eligibility", () => {
  const rule: PrerequisiteRuleNode = { type: "any", children: [all("PSY107", "PSY108", "PSY205", "PSY390"), all("PSY107", "PSY108", "PSY205", "PSY391")] };
  const compact = compactGraphRule(rule);
  expect(compact).toEqual({ type: "all", children: [course("PSY107"), course("PSY108"), course("PSY205"), { type: "any", children: [course("PSY390"), course("PSY391")] }] });
  const codes = ["PSY107", "PSY108", "PSY205", "PSY390", "PSY391"];
  for (let mask = 0; mask < 32; mask++)
  {
    const completed = new Set(codes.filter((_, index) => mask & (1 << index)));
    expect(matches(compact, completed)).toBe(matches(rule, completed));
  }
});

it("preserves overlapping programme requirements while keeping separate course branches", async () => {
  const plan = fixturePlan();
  const other = fixturePlan({ planKey: "other-programme", sourceHash: "b".repeat(64) });
  const rules = [fixtureRule(plan, all("PRE100", "ALT200")),
    fixtureRule(plan, course("ALT200"), { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default` }),
    fixtureRule(other, { type: "any", children: [course("ALT200"), course("NEXT400")] }, { courseCode: "PRE100", ruleKey: `prerequisite:${other.planKey}:PRE100:default` }),
  ];
  const { byCourse } = buildRequisites([plan, other], rules, fixtureCatalogue);
  const expanded = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300, expanded);
  expect([...new Set(graph.nodes.filter(node => node.kind === "course").map(node => node.label))].sort()).toEqual(["ALT200", "MAIN300", "NEXT400", "PRE100"]);
  const alternatives = graph.nodes.filter(node => node.label === "ALT200");
  expect(alternatives).toHaveLength(3);
  for (const node of alternatives) expect(graph.edges.filter(edge => edge.to === node.id)).toHaveLength(1);
  expect(graph.nodes.some(node => node.label === "by programme")).toBe(true);
  expect(graph.requirements.find(item => item.courseCode === "PRE100")?.rules).toEqual(expect.arrayContaining([course("ALT200"), { type: "any", children: [course("ALT200"), course("NEXT400")] }]));
  expect(graph.nodes.some(node => /Requirement [12]|↩/.test(node.label))).toBe(false);
});

it("merges identical structures with differing remarks without adding a programme branch", async () => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", sourceHash: "b".repeat(64) });
  const { byCourse } = buildRequisites([first, second], [fixtureRule(first), fixtureRule(second, { ...course("PRE100"), displayRemarks: ["Additional eligibility condition."] })], fixtureCatalogue);
  const expanded = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300, expanded);
  expect(graph.nodes.some(node => node.label === "by programme")).toBe(false);
  expect(expanded.remarks[0].texts).toEqual(["Additional eligibility condition."]);
});

it("assigns distinct visible columns even when logical groups put the same course level in different columns", async () => {
  const first = fixturePlan();
  const { byCourse } = buildRequisites([first], [
    fixtureRule(first, { type: "all", children: [course("PRE100"), { type: "any", children: [course("ALT200"), course("NEXT400")] }] }),
    fixtureRule(first, course("NEXT400"), { courseCode: "PRE100", ruleKey: `prerequisite:${first.planKey}:PRE100:default` }),
    fixtureRule(first, course("MAIN300"), { courseCode: "EXIT500", ruleKey: `prerequisite:${first.planKey}:EXIT500:default` }),
  ], fixtureCatalogue);
  const [pre, post] = await Promise.all([
    buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null),
    buildPostrequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null),
  ]);
  const layout = layoutCourseGraph(buildCourseGraph("MAIN300", byCourse.MAIN300, pre, post));
  for (const [code, level] of [["MAIN300", 0], ["PRE100", 1], ["ALT200", 1], ["EXIT500", -1]] as const)
    expect(layout.nodes.find(node => node.label === code)?.level).toBe(level);
  expect(layout.nodes.find(node => node.label === "PRE100")?.column).not.toBe(layout.nodes.find(node => node.label === "ALT200")?.column);
  const courses = layout.nodes.filter(node => node.kind === "course");
  expect(courses.find(node => node.label === "MAIN300")?.column).toBe(0);
  expect(new Set(courses.map(node => node.column)).size).toBe(new Set(courses.map(node => node.x + node.width / 2)).size);
  for (const left of courses) for (const right of courses)
    expect(left.column === right.column).toBe(left.x + left.width / 2 === right.x + right.width / 2);
});

it.each([
  [course("PRE100"), { type: "any", children: [course("PRE100"), course("ALT200")] }],
  [{ type: "any", children: [course("PRE100"), course("ALT200")] }, { type: "any", children: [course("ALT200"), course("NEXT400"), course("PRE100")] }],
  [all("PRE100", "ALT200"), { type: "any", children: [all("ALT200", "PRE100"), course("NEXT400")] }],
  [all("PRE100", "ALT200", "NEXT400"), { type: "all", children: [course("NEXT400"), { type: "any", children: [all("PRE100", "ALT200"), course("OLD999")] }] }],
] satisfies PrerequisiteRuleNode[][])("preserves narrower and broader requirements in separate programme branches (%#)", async (narrow, broad) => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", sourceHash: "b".repeat(64) });
  const { byCourse } = buildRequisites([first, second], [fixtureRule(first, narrow), fixtureRule(second, broad)], fixtureCatalogue);
  const pre = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300, pre);
  expect(graph.nodes.some(node => node.label === "by programme")).toBe(true);
  const rules = graph.requirements.find(item => item.courseCode === "MAIN300")!.rules;
  expect(rules).toHaveLength(2);
  expect(rules).toEqual(expect.arrayContaining([compactGraphRule(canonicalizeRule(narrow)), compactGraphRule(canonicalizeRule(broad))]));
  const codes = ["PRE100", "ALT200", "NEXT400", "OLD999"];
  for (let mask = 0; mask < 16; mask++)
  {
    const completed = new Set(codes.filter((_, index) => mask & (1 << index)));
    for (const original of [narrow, broad])
      expect(matches(rules.find(rule => JSON.stringify(rule) === JSON.stringify(compactGraphRule(canonicalizeRule(original))))!, completed)).toBe(matches(original, completed));
  }
  expect(pre.sources.map(source => source.planKey).sort()).toEqual([first.planKey, second.planKey].sort());
});

it("retains programme branches for genuinely different requirements and source-only variants", () => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", sourceHash: "b".repeat(64) });
  for (const secondRule of [fixtureRule(second, all("PRE100", "ALT200")), fixtureRule(second, undefined, { reviewStatus: "source_only" })])
  {
    const { byCourse } = buildRequisites([first, second], [fixtureRule(first), secondRule], fixtureCatalogue);
    const graph = buildCourseGraph("MAIN300", byCourse.MAIN300);
    expect(graph.nodes.filter(node => node.label === "by programme")).toHaveLength(1);
    expect(graph.requirements[0].rules.length + Number(graph.requirements[0].textOnly)).toBe(2);
  }
});

it("retains all downstream connections to a shared course with a finite cycle layout", async () => {
  const plan = fixturePlan();
  const rules = [fixtureRule(plan, all("PRE100", "ALT200")),
    fixtureRule(plan, course("MAIN300"), { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default` }),
    fixtureRule(plan, course("PRE100"), { courseCode: "NEXT400", ruleKey: `prerequisite:${plan.planKey}:NEXT400:default` }),
  ];
  const { byCourse } = buildRequisites([plan], rules, fixtureCatalogue);
  const [pre, post] = await Promise.all([
    buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null),
    buildPostrequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null),
  ]);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300, pre, post);
  expect(new Set(graph.nodes.filter(node => node.kind === "course").map(node => node.label)).size).toBe(4);
  expect(graph.postrequisites.map(item => item.courseCode).sort()).toEqual(["MAIN300", "NEXT400", "PRE100"]);
  const layout = layoutCourseGraph(graph);
  expect(Number.isFinite(layout.width) && Number.isFinite(layout.height)).toBe(true);
  expect(layout.paths.every(edge => !/NaN|Infinity/.test(edge.path))).toBe(true);
  for (const [index, left] of layout.nodes.entries()) for (const right of layout.nodes.slice(index + 1))
    expect(left.x + left.width <= right.x || right.x + right.width <= left.x || left.y + left.height <= right.y || right.y + right.height <= left.y).toBe(true);
});

it("routes separate recursive branches between columns without crossing another node", async () => {
  const plan = fixturePlan();
  const { byCourse } = buildRequisites([plan], [
    fixtureRule(plan, all("PRE100", "ALT200")),
    fixtureRule(plan, all("ALT200", "NEXT400"), { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default` }),
  ], fixtureCatalogue);
  const pre = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300, pre);
  const layout = layoutCourseGraph(graph);
  expect(layout.paths).toHaveLength(graph.edges.length);
  for (const edge of layout.paths)
  {
    const tokens = edge.path.match(/[MHV]|-?\d+(?:\.\d+)?/g)!;
    let x = 0, y = 0;
    for (let index = 0; index < tokens.length;)
    {
      const command = tokens[index++];
      if (command === "M") { x = Number(tokens[index++]); y = Number(tokens[index++]); continue; }
      const nextX = command === "H" ? Number(tokens[index++]) : x;
      const nextY = command === "V" ? Number(tokens[index++]) : y;
      for (const node of layout.nodes.filter(node => node.id !== edge.from && node.id !== edge.to))
      {
        const crosses = command === "H"
          ? y > node.y && y < node.y + node.height && Math.max(x, nextX) > node.x && Math.min(x, nextX) < node.x + node.width
          : x > node.x && x < node.x + node.width && Math.max(y, nextY) > node.y && Math.min(y, nextY) < node.y + node.height;
        expect(crosses, `${edge.from} → ${edge.to} crosses ${node.id}`).toBe(false);
      }
      x = nextX; y = nextY;
    }
    const destination = layout.nodes.find(node => node.id === edge.to)!;
    expect([x, y]).toEqual([destination.x, destination.y + destination.height / 2]);
  }
});

it("never joins connectors from distinct all-of alternatives sharing course codes", () => {
  const plan = fixturePlan();
  const rule: PrerequisiteRuleNode = { type: "any", children: [all("PRE100", "ALT200"), all("ALT200", "NEXT400"), all("PRE100", "NEXT400"), all("PRE100", "OLD999")] };
  const { byCourse } = buildRequisites([plan], [fixtureRule(plan, rule)], fixtureCatalogue);
  const graph = buildCourseGraph("MAIN300", byCourse.MAIN300);
  const layout = layoutCourseGraph(graph);
  const trunks = layout.paths.flatMap(edge => {
    const owner = graph.nodes.find(node => node.id === edge.from)!;
    if (owner.label !== "all of") return [];
    const [, x, start, end] = edge.path.match(/H ([\d.]+) V ([\d.]+) H ([\d.]+)/)!;
    const from = layout.nodes.find(node => node.id === edge.from)!;
    return [{ owner: edge.from, x: Number(x), min: Math.min(from.y + from.height / 2, Number(start)), max: Math.max(from.y + from.height / 2, Number(start)), end: Number(end) }];
  });
  expect(new Set(trunks.map(trunk => trunk.owner)).size).toBe(4);
  for (const [index, left] of trunks.entries()) for (const right of trunks.slice(index + 1))
  {
    if (left.owner === right.owner) continue;
    expect(left.max < right.min || right.max < left.min, "Different alternatives must have disjoint vertical connector ranges").toBe(true);
  }
});
