import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { fixtureCatalogue, fixturePlan, fixtureRule } from "./fixtures";
import { buildRequisites } from "./build-requisites";
import { buildPostrequisiteTree } from "./build-postrequisite-tree";
import { buildPrerequisiteTree } from "./build-prerequisite-tree";
import { PrerequisiteTree } from "@/components/courses/prerequisite-tree/prerequisite-tree";
import { CourseGraph } from "@/components/courses/prerequisite-tree/course-graph";

const links = vi.hoisted(() => ({ props: [] as Array<{ href: string; prefetch: boolean }> }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ prefetch, ...props }: { prefetch: boolean; href: string; children: unknown }) => { links.props.push({ href: props.href, prefetch }); return createElement("a", props as never); } };
});
beforeEach(() => { links.props.length = 0; });
it("renders nested prerequisite course groups and labels their remarks below the whole tree", async () => {
  const plan = fixturePlan();
  const rules = [fixtureRule(plan),
    fixtureRule(plan, { type: "any", children: [{ type: "course", courseCode: "ALT200" }, { type: "course", courseCode: "NEXT400" }] }, { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default` }),
    fixtureRule(plan, { type: "condition", text: "Minimum 30 CU", displayRemarks: ["Prior experience is required."] }, { courseCode: "ALT200", ruleKey: `prerequisite:${plan.planKey}:ALT200:default` }),
  ];
  const { byCourse } = buildRequisites([plan], rules, fixtureCatalogue);
  const prerequisites = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites: byCourse.MAIN300, prerequisites }));
  expect(links.props.map(link => link.href)).toEqual(["/courses/MAIN300", "/courses/PRE100", "/courses/ALT200", "/courses/NEXT400"]);
  for (const text of ["one of", "Minimum 30 CU", "Prior experience is required."]) expect(html).toContain(text);
  expect(html.indexOf('href="/courses/NEXT400"')).toBeLessThan(html.indexOf('id="prerequisite-remarks"'));
  expect(html).toMatch(/<h3[^>]*>ALT200<\/h3>/);
});
it("connects multiple downstream levels through needs while keeping the current course once", async () => {
  const plan = fixturePlan();
  const rules = [fixtureRule(plan), ...[["NEXT400", "MAIN300"], ["ALT200", "NEXT400"]].map(([courseCode, prerequisite]) => fixtureRule(plan,
    { type: "course", courseCode: prerequisite }, { courseCode, ruleKey: `prerequisite:${plan.planKey}:${courseCode}:default` }))];
  const { byCourse } = buildRequisites([plan], rules, fixtureCatalogue);
  const postrequisites = await buildPostrequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites: byCourse.MAIN300, postrequisites }));
  expect(links.props.map(link => link.href)).toEqual(["/courses/ALT200", "/courses/NEXT400", "/courses/MAIN300", "/courses/PRE100"]);
  expect(html.match(/>needs</g)).toHaveLength(3);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain("Other requirements may apply");
});
it("renders compact operators, hover names and only supplied course links without prefetch", () => {
  const plan = fixturePlan();
  const rule = fixtureRule(plan, { type: "all", children: [{ type: "any", children: [{ type: "course", courseCode: "PRE100" }, { type: "course", courseCode: "OLD999" }] }, { type: "nOf", count: 1, children: [{ type: "course", courseCode: "ALT200" }] }, { type: "condition", text: "Minimum 30 CU" }] });
  const downstream = fixtureRule(plan, { type: "course", courseCode: "MAIN300" }, { courseCode: "NEXT400", ruleKey: `prerequisite:${plan.planKey}:NEXT400:default` });
  const requisites = buildRequisites([plan], [rule, downstream], fixtureCatalogue).byCourse.MAIN300;
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites }));
  for (const label of ["all of", "one of", "at least 1 of", "Minimum 30 CU", "<summary>Prerequisite</summary>", "OLD999", "Postrequisite courses", "Prerequisite requirements", "needs"]) expect(html).toContain(label);
  expect(html).not.toContain("<summary>Remarks</summary>");
  expect(html.indexOf('href="/courses/NEXT400"')).toBeLessThan(html.indexOf('aria-current="page"'));
  expect(html.indexOf('aria-current="page"')).toBeLessThan(html.indexOf('href="/courses/PRE100"'));
  expect(html).toContain("Prerequisite trees are experimental and may not reflect true accuracy. Always check your programme&#x27;s curriculum plan for the updated information. Other requirements may apply.");
  expect(html.match(/Other requirements may apply\./g)).toHaveLength(1);
  expect(html).not.toContain('title="PRE100 sample course"');
  expect(html).not.toContain("Select a boxed course to view its page. Hover for its full name.");
  expect(html).toContain("Current course");
  expect(html).toContain('--course-color:#C3DCEA');
  expect(html).not.toMatch(/<a[^>]*aria-haspopup="dialog"/);
  expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*>Expand tree<\/button>/);
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("View Course Page");
  expect(html).toContain('aria-label="PRE100: PRE100 sample course"');
  expect(html).toContain('aria-current="page"');
  expect(html.indexOf("Demonstration programme")).toBeGreaterThan(html.indexOf("<summary>Prerequisite</summary>"));
  for (const removed of ["Original requirement wording", "Programme-wide", "Source details", "Semester offerings", "July 2026"]) expect(html).not.toContain(removed);
  expect(html).toContain('id="prerequisites"'); expect(html).toContain("<details"); expect(html).toContain("<ul");
  expect(links.props.length).toBeGreaterThan(0);
  expect(links.props.every(link => link.prefetch === false)).toBe(true);
  expect(links.props.some(link => link.href === "/courses/OLD999")).toBe(false);
});
it.each(["pending", "source_only"] as const)("renders %s text with its review label", reviewStatus => {
  const plan = fixturePlan();
  const second = fixturePlan({ planKey: "second-programme", programmeName: "Second programme", sourceHash: "b".repeat(64) });
  const requisites = buildRequisites([plan, second], [fixtureRule(plan, undefined, { reviewStatus }), fixtureRule(second, undefined, { reviewStatus })], fixtureCatalogue).byCourse.MAIN300;
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites }));
  expect(html).toContain("<summary>Prerequisite</summary>");
  expect(html).not.toContain("<summary>Remarks</summary>");
  expect(html.includes("Needs verification")).toBe(reviewStatus === "pending");
  expect(html).toContain("PRE100");
  expect(html.match(/See prerequisites/g)).toHaveLength(1);
  expect(html).toContain("Second programme");
  expect(html).not.toContain("Requirement 2");
  expect(links.props.map(link => link.href)).toEqual(["/courses/MAIN300"]);
});
it("keeps distinct requirements separate and labels source text by programme inside spoilers", () => {
  const first = fixturePlan();
  const second = fixturePlan({ planKey: "second-programme", programmeName: "Second programme", studyMode: "full-time", curriculumVersion: "Second version", sourceHash: "b".repeat(64) });
  const requisites = buildRequisites([first, second], [
    fixtureRule(first),
    fixtureRule(second, { type: "nOf", count: 1, children: [{ type: "course", courseCode: "ALT200" }, { type: "condition", text: "Department approval" }] }, { applicabilityLabel: "Specialisation students" }),
  ], fixtureCatalogue).byCourse.MAIN300;
  expect(requisites.prerequisiteVariants).toHaveLength(2);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites }));
  for (const label of ["by programme", "at least 1 of", "Department approval", "Demonstration programme", "Second programme", "Second version"]) expect(html).toContain(label);
  for (const removed of ["Requirement 1", "Requirement 2", ">varies<", "Specialisation students"]) expect(html).not.toContain(removed);
  expect(html.indexOf("Second programme")).toBeGreaterThan(html.indexOf("<summary>Prerequisite</summary>"));
  expect(links.props.every(link => link.prefetch === false)).toBe(true);
});
it("renders approved remarks beneath their course tree without creating extra dependencies", () => {
  const plan = fixturePlan();
  const tree = { type: "course" as const, courseCode: "PRE100", displayRemarks: ["Video production experience is required."] };
  const projection = buildRequisites([plan], [fixtureRule(plan, tree)], fixtureCatalogue);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites: projection.byCourse.MAIN300 }));
  expect(html).toContain("<summary>Prerequisite</summary>");
  expect(html).toContain("<summary>Remarks</summary>");
  expect(html.indexOf('href="/courses/PRE100"')).toBeLessThan(html.indexOf('id="prerequisite-remarks"'));
  expect(html).toContain("Video production experience is required.");
  expect(html).not.toContain("Needs verification");
  expect(projection.report.reversePairs).toBe(1);
  expect(links.props.map(link => link.href)).toEqual(["/courses/MAIN300", "/courses/PRE100"]);
});
it("renders reverse-only pages with partial-coverage wording and omits empty sections", () => {
  const plan = fixturePlan(); const pages = buildRequisites([plan], [fixtureRule(plan)], fixtureCatalogue).byCourse;
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "PRE100", requisites: pages.PRE100 }));
  expect(html).not.toContain("<details");
  expect(html).not.toContain("No published");
  expect(html).toContain('href="/courses/MAIN300"');
  expect(html).toContain("Other requirements may apply");
  expect(renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "ALT200", requisites: pages.ALT200 }))).toBe("");
});

it("shows only Remarks for a remarks-only requirement and retains its tree link target", () => {
  const plan = fixturePlan();
  const requisites = buildRequisites([plan], [fixtureRule(plan, undefined, { reviewStatus: "source_only", rawText: "Remarks: Take a placement test." })], fixtureCatalogue).byCourse.MAIN300;
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites }));
  expect(html).toContain("<summary>Remarks</summary>");
  expect(html).toContain("Take a placement test.");
  expect(html).toContain('href="#prerequisite-remarks"');
  expect(html).toContain('id="prerequisite-remarks"');
  expect(html).not.toContain("<summary>Prerequisite</summary>");
  expect(html).not.toContain("No published");
});

it("targets the expanded programme disclosure while preserving course navigation", () => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", sourceHash: "b".repeat(64) });
  const requisites = buildRequisites([first, second], [fixtureRule(first), fixtureRule(second, { type: "all", children: [{ type: "course", courseCode: "PRE100" }, { type: "course", courseCode: "ALT200" }] })], fixtureCatalogue).byCourse.MAIN300;
  const html = renderToStaticMarkup(createElement(CourseGraph, { courseCode: "MAIN300", requisites, expanded: true, idPrefix: "expanded-" }));
  expect(html).toContain('href="#expanded-prerequisite-details"');
  expect(html).not.toContain('href="#prerequisite-details"');
  expect(links.props.some(link => link.href === "/courses/PRE100")).toBe(true);
  expect(links.props.every(link => link.prefetch === false)).toBe(true);
});

it("targets the expanded remarks disclosure for text-only remarks", () => {
  const plan = fixturePlan();
  const requisites = buildRequisites([plan], [fixtureRule(plan, undefined, { reviewStatus: "source_only", rawText: "Remarks: Take a placement test." })], fixtureCatalogue).byCourse.MAIN300;
  const html = renderToStaticMarkup(createElement(CourseGraph, { courseCode: "MAIN300", requisites, expanded: true, idPrefix: "expanded-" }));
  expect(html).toContain('href="#expanded-prerequisite-remarks"');
  expect(html).not.toContain('href="#prerequisite-remarks"');
  expect(html).toContain("See remarks");
});
