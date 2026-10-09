import { getDisplayPrerequisiteVariants } from "./display-variants";
import { getPrerequisiteSourceDetails } from "./source-details";
import type { CourseNodeSummary, CourseRequisitesSnapshot, ExpandedPrerequisiteRuleNode, PostrequisiteNode, PrerequisiteRuleNode, PrerequisiteTreeData } from "./types";

type Rule = PrerequisiteRuleNode | ExpandedPrerequisiteRuleNode;
type Variant = { key: string; rule: Rule | null };
export type GraphRule =
  | { type: "course"; courseCode: string }
  | { type: "condition"; text: string }
  | { type: "all"; children: GraphRule[] }
  | { type: "any"; children: GraphRule[] }
  | { type: "nOf"; count: number; children: GraphRule[] };
export type CourseGraphNode = { id: string; kind: "course" | "operator" | "condition" | "remarks"; label: string; course?: CourseNodeSummary; title?: string; href?: string; width: number; height: number };
export type CourseGraphEdge = { from: string; to: string };
export type CourseGraph = { root: string; nodes: CourseGraphNode[]; edges: CourseGraphEdge[]; requirements: Array<{ courseCode: string; rules: GraphRule[]; textOnly: boolean }>; postrequisites: Array<{ courseCode: string; prerequisite: string }> };

function groupRule(type: "all" | "any", children: GraphRule[]): GraphRule
{
  return children.length === 1 ? children[0] : { type, children };
}

function ruleKey(rule: GraphRule): string
{
  if (rule.type === "course" || rule.type === "condition") return JSON.stringify(rule);
  return JSON.stringify([rule.type, rule.type === "nOf" ? rule.count : null, rule.children.map(ruleKey).sort()]);
}

// Simplify only equivalent Boolean expressions, leaving reviewed source intact.
// Shared factors belong above a choice; sharing their drawn edges across choices
// would instead make separate logical groups appear to be connected.
export function compactGraphRule(rule: Rule): GraphRule
{
  if (rule.type === "course") return { type: "course", courseCode: rule.courseCode };
  if (rule.type === "condition") return { type: "condition", text: rule.text };
  let children = rule.children.map(compactGraphRule);
  if (rule.type === "all" || rule.type === "any")
  {
    // Programme variants often repeat a single route already inside an OR list.
    // Flatten matching operators, but keep ALL branches inside ANY separate.
    children = [...new Map(children.flatMap(child => child.type === rule.type ? child.children : [child]).map(child => [ruleKey(child), child])).values()];
    if (children.length === 1) return children[0];
  }
  if (rule.type === "any" && children.length > 1)
  {
    if (children.every(child => child.type === "all" && child.children.every(item => item.type === "course")))
    {
      const choices = children.map(child => child.type === "all" ? child.children.map(item => item.type === "course" ? item.courseCode : "").sort() : []);
      const count = choices[0].length;
      const codes = [...new Set(choices.flat())].sort();
      let combinations = 1;
      for (let index = 1; index <= count; index++) combinations = combinations * (codes.length - index + 1) / index;
      if (count > 1 && count < codes.length && choices.every(choice => choice.length === count && new Set(choice).size === count)
        && new Set(choices.map(choice => choice.join(","))).size === choices.length && Math.round(combinations) === choices.length)
        return { type: "nOf", count, children: codes.map(courseCode => ({ type: "course", courseCode })) };
    }
    const factors = children.map(child => child.type === "all" ? child.children : [child]);
    const common = factors[0].filter(item => factors.every(branch => branch.some(other => ruleKey(other) === ruleKey(item))));
    if (common.length)
    {
      const keys = new Set(common.map(ruleKey));
      const remaining = factors.map(branch => branch.filter(item => !keys.has(ruleKey(item))));
      // Do not remove an alternative entirely (or lose its displayed courses).
      if (remaining.every(branch => branch.length))
        return compactGraphRule({ type: "all", children: [...common, compactGraphRule({ type: "any", children: remaining.map(branch => groupRule("all", branch)) })] });
    }
  }
  return rule.type === "nOf" ? { type: "nOf", count: rule.count, children } : { type: rule.type, children };
}

export function graphRuleText(rule: GraphRule): string
{
  if (rule.type === "course") return rule.courseCode;
  if (rule.type === "condition") return rule.text;
  const label = rule.type === "all" ? "all of" : rule.type === "any" ? "one of" : `at least ${rule.count} of`;
  return `${label} (${rule.children.map(graphRuleText).join("; ")})`;
}

export function buildCourseGraph(courseCode: string, requisites: CourseRequisitesSnapshot, prerequisites?: PrerequisiteTreeData, postrequisites?: PostrequisiteNode[]): CourseGraph
{
  const courses = new Map(Object.entries(requisites.coursesByCode));
  const sources = prerequisites?.sources ?? getPrerequisiteSourceDetails(courseCode, requisites);
  const variants = new Map<string, Variant[]>([[courseCode, prerequisites?.variants ?? getDisplayPrerequisiteVariants(requisites)]]);
  const pending: Rule[] = [...variants.values()].flatMap(items => items.flatMap(item => item.rule ? [item.rule] : []));
  for (let index = 0; index < pending.length; index++)
  {
    const rule = pending[index];
    if (rule.type === "course" && "course" in rule)
    {
      courses.set(rule.courseCode, rule.course);
      if (rule.requirements.length && !variants.has(rule.courseCode))
      {
        variants.set(rule.courseCode, rule.requirements);
        pending.push(...rule.requirements.flatMap(item => item.rule ? [item.rule] : []));
      }
    }
    else if (rule.type !== "course" && rule.type !== "condition") pending.push(...rule.children);
  }

  const nodes: CourseGraphNode[] = [], edges: CourseGraphEdge[] = [];
  const requirements: CourseGraph["requirements"] = [], downstream: CourseGraph["postrequisites"] = [];
  const counts = new Map<string, number>();
  const addNode = (node: CourseGraphNode) => {
    const count = (counts.get(node.id) ?? 0) + 1;
    counts.set(node.id, count);
    const id = count === 1 ? node.id : `${node.id}#${count}`;
    nodes.push({ ...node, id }); return id;
  };
  const connect = (from: string, to: string) => { edges.push({ from, to }); };
  const addCourse = (code: string) => addNode({ id: `course:${code}`, kind: "course", label: code, course: courses.get(code), width: Math.max(72, code.length * 8 + 16), height: 30 });
  const operator = (id: string, label: string, title?: string, href?: string) => addNode({ id, kind: "operator", label, title, href, width: Math.max(40, label.length * 6.5 + 12), height: 28 });
  const root = addCourse(courseCode);
  const expanded = new Set<string>();
  const addRequirements = (code: string, owner: string) => {
    if (expanded.has(code)) return;
    expanded.add(code);
    const items = variants.get(code) ?? [];
    const unique = new Map<string, GraphRule>();
    for (const item of items) if (item.rule) { const rule = compactGraphRule(item.rule); unique.set(ruleKey(rule), rule); }
    let rules = [...unique.values()];
    const textOnly = items.some(item => !item.rule);
    if (rules.length > 1 && !textOnly)
    {
      const combined = compactGraphRule({ type: "any", children: rules });
      // Collapse overlapping variants only when their combined routes are
      // already represented by one recorded variant. Keep genuine differences
      // (and unstructured requirements) under their programme branch.
      if (rules.some(rule => ruleKey(rule) === ruleKey(combined))) rules = [combined];
    }
    if (!rules.length && !textOnly) return;
    requirements.push({ courseCode: code, rules, textOnly });
    const varies = rules.length + Number(textOnly) > 1;
    const parent = varies ? operator(`varies:${code}`, "by programme", "Prerequisites differ by programme. View the recorded requirements.", "#prerequisite-details") : owner;
    if (varies) connect(owner, parent);
    const addRule = (rule: GraphRule): string => {
      if (rule.type === "course") { const child = addCourse(rule.courseCode); addRequirements(rule.courseCode, child); return child; }
      const base = `rule:${code}`;
      if (rule.type === "condition")
      {
        let lines = 1, length = 0;
        for (const word of rule.text.split(/\s+/)) { if (length && length + word.length + 1 > 28) { lines++; length = 0; } length += word.length + 1; }
        return addNode({ id: base, kind: "condition", label: rule.text, width: 196, height: Math.max(44, lines * 18 + 12) });
      }
      const id = operator(base, rule.type === "all" ? "all of" : rule.type === "any" ? "one of" : `at least ${rule.count} of`);
      for (const child of rule.children) connect(id, addRule(child));
      return id;
    };
    for (const rule of rules)
    {
      const destination = addRule(rule);
      if (!varies && rule.type === "course")
      {
        const needs = operator(`needs:prerequisite:${code}`, "needs");
        connect(parent, needs); connect(needs, destination);
      }
      else connect(parent, destination);
    }
    if (textOnly)
    {
      const hasPrerequisites = sources.some(source => source.courseCode === code && source.prerequisites.length);
      const id = addNode({ id: `remarks:${code}`, kind: "remarks", label: hasPrerequisites ? "See prerequisites" : "See remarks", href: hasPrerequisites ? "#prerequisite-details" : "#prerequisite-remarks", width: 126, height: 28 });
      connect(parent, id);
    }
  };
  addRequirements(courseCode, root);

  const addDependents = (parent: string, code: string, children: PostrequisiteNode[]) => {
    if (!children.length) return;
    const needs = operator(`needs:postrequisite:${code}`, "needs");
    connect(needs, parent);
    for (const child of children)
    {
      courses.set(child.course.courseCode, child.course);
      const id = addCourse(child.course.courseCode);
      connect(id, needs);
      downstream.push({ courseCode: child.course.courseCode, prerequisite: code });
      addDependents(id, child.course.courseCode, child.dependents);
    }
  };
  const post = postrequisites ?? requisites.dependentCourses.map(item => ({ course: requisites.coursesByCode[item.courseCode], dependents: [] }));
  addDependents(root, courseCode, post);
  return { root, nodes, edges, requirements, postrequisites: downstream };
}

export type PositionedGraphNode = CourseGraphNode & { x: number; y: number; level: number; column: number };
export type CourseGraphLayout = { nodes: PositionedGraphNode[]; paths: Array<CourseGraphEdge & { path: string }>; width: number; height: number };
type Contour = Map<number, { min: number; max: number }>;
type BranchLayout = { positions: Array<{ id: string; depth: number; y: number; level: number }>; contour: Contour };

export function layoutCourseGraph(graph: CourseGraph): CourseGraphLayout
{
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  const incoming = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) { outgoing.get(edge.from)!.push(edge.to); incoming.get(edge.to)!.push(edge.from); }
  const gap = 36, rowGap = 20, padding = 16;
  const merge = (target: Contour, depth: number, min: number, max: number) => {
    const previous = target.get(depth);
    target.set(depth, { min: Math.min(previous?.min ?? min, min), max: Math.max(previous?.max ?? max, max) });
  };
  // Pack subtrees only where their horizontal extents overlap. Include connector
  // lanes in their contours, so separate logical branches can never touch.
  const branch = (id: string, childrenById: Map<string, string[]>): BranchLayout => {
    const node = byId.get(id)!, children = childrenById.get(id)!;
    const packed: Array<{ layout: BranchLayout; shift: number }> = [];
    const occupied: Contour = new Map();
    for (const child of children)
    {
      const layout = branch(child, childrenById);
      const shift = packed.length ? Math.max(...[...layout.contour].flatMap(([depth, range]) => {
        const prior = occupied.get(depth); return prior ? [prior.max + rowGap - range.min] : [];
      })) : 0;
      packed.push({ layout, shift });
      for (const [depth, range] of layout.contour) merge(occupied, depth, range.min + shift, range.max + shift);
    }
    const centre = packed.length ? (packed[0].shift + packed.at(-1)!.shift) / 2 : 0;
    const courseStep = node.kind === "course" ? 1 : 0;
    const positions: BranchLayout["positions"] = [{ id, depth: 0, y: 0, level: courseStep }];
    const contour: Contour = new Map([[0, { min: -node.height / 2, max: node.height / 2 }]]);
    for (const { layout, shift } of packed)
    {
      for (const item of layout.positions) positions.push({ ...item, depth: item.depth + 1, level: item.level + courseStep, y: item.y + shift - centre });
      for (const [depth, range] of layout.contour) merge(contour, depth + 2, range.min + shift - centre, range.max + shift - centre);
      merge(contour, 1, Math.min(0, shift - centre), Math.max(0, shift - centre));
    }
    return { positions, contour };
  };
  const current = byId.get(graph.root)!;
  const preRoot = outgoing.get(graph.root)![0], postRoot = incoming.get(graph.root)![0];
  const sides = [postRoot ? branch(postRoot, incoming) : null, preRoot ? branch(preRoot, outgoing) : null];
  const sideMetrics = sides.map(side => {
    const widths: number[] = [];
    for (const item of side?.positions ?? []) widths[item.depth] = Math.max(widths[item.depth] ?? 0, byId.get(item.id)!.width);
    const starts: number[] = []; let width = 0;
    for (const [depth, column] of widths.entries()) { starts[depth] = width; width += column + gap; }
    const min = Math.min(0, ...[...(side?.contour.values() ?? [])].map(range => range.min));
    const max = Math.max(0, ...[...(side?.contour.values() ?? [])].map(range => range.max));
    return { widths, starts, width: side ? width - gap : 0, min, max };
  });
  const above = Math.max(current.height / 2, ...sideMetrics.map(side => -side.min));
  const below = Math.max(current.height / 2 + 20, ...sideMetrics.map(side => side.max));
  const leftWidth = sides[0] ? sideMetrics[0].width + gap : 0;
  const rightWidth = sides[1] ? sideMetrics[1].width + gap : 0;
  const rootX = padding + leftWidth, rootY = padding + above;
  const positions = new Map<string, PositionedGraphNode>([[graph.root, { ...current, x: rootX, y: rootY - current.height / 2, level: 0, column: 0 }]]);
  const bends = new Map<string, number>();
  const key = (from: string, to: string) => JSON.stringify([from, to]);
  if (preRoot) bends.set(key(graph.root, preRoot), rootX + current.width + gap / 2);
  if (postRoot) bends.set(key(postRoot, graph.root), rootX - gap / 2);
  sides.forEach((side, index) => {
    const metrics = sideMetrics[index];
    for (const item of side?.positions ?? [])
    {
      const node = byId.get(item.id)!, x = metrics.starts[item.depth] + (metrics.widths[item.depth] - node.width) / 2;
      positions.set(item.id, { ...node, x: index === 0 ? padding + metrics.width - x - node.width : rootX + current.width + gap + x, y: rootY + item.y - node.height / 2, level: index === 0 ? -item.level : item.level, column: 0 });
      const bend = metrics.starts[item.depth] + metrics.widths[item.depth] + gap / 2;
      for (const child of (index === 0 ? incoming : outgoing).get(item.id)!)
        bends.set(index === 0 ? key(child, item.id) : key(item.id, child), index === 0 ? padding + metrics.width - bend : rootX + current.width + gap + bend);
    }
  });
  const columns = [...new Set([...positions.values()].filter(node => node.kind === "course" && node.id !== graph.root).map(node => node.x + node.width / 2))].sort((left, right) => left - right);
  for (const node of positions.values())
    if (node.kind === "course" && node.id !== graph.root) node.column = columns.indexOf(node.x + node.width / 2) + 1;
  const paths = graph.edges.map(edge => {
    const from = positions.get(edge.from)!, to = positions.get(edge.to)!;
    const startX = from.x + from.width, startY = from.y + from.height / 2, endY = to.y + to.height / 2;
    const middle = bends.get(key(edge.from, edge.to))!;
    return { ...edge, path: `M ${startX} ${startY} H ${middle} V ${endY} H ${to.x}` };
  });
  return { nodes: [...positions.values()].sort((left, right) => left.x - right.x || left.y - right.y), paths, width: padding * 2 + leftWidth + current.width + rightWidth, height: padding * 2 + above + below };
}
