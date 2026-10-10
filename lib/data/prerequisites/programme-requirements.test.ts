import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PrerequisiteTree } from "@/components/courses/prerequisite-tree/prerequisite-tree";
import plansFile from "@/scraper/data/reviews/curriculum-plans.json";
import reviewsFile from "@/scraper/data/reviews/prerequisite-rules.json";
import { buildRequisites } from "./build-requisites";
import { buildPrerequisiteTree } from "./build-prerequisite-tree";
import { buildCourseGraph, graphRuleText } from "./course-graph";
import { reviewFileSchema } from "./review-input";
import { fixtureCatalogue, fixturePlan, fixtureRule } from "./fixtures";
import type { CourseRequisitesSnapshot, PrerequisiteRuleNode } from "./types";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ prefetch: _prefetch, ...props }: { prefetch: boolean }) => createElement("a", props) };
});
const course = (courseCode: string): PrerequisiteRuleNode => ({ type: "course", courseCode });
const narrow = course("ICT133");
const broad: PrerequisiteRuleNode = { type: "any", children: [course("ANL252"), narrow] };

async function assertScopedDisplay(requisites: CourseRequisitesSnapshot)
{
  const prerequisites = await buildPrerequisiteTree("ICT233", requisites, async () => null);
  const graph = buildCourseGraph("ICT233", requisites, prerequisites);
  expect(graph.requirements[0].rules).toEqual(expect.arrayContaining([narrow, broad]));
  expect(graph.requirements[0].rules).toHaveLength(2);
  const branch = graph.nodes.find(node => node.label === "by programme")!;
  expect(branch).toBeDefined();
  expect(graph.edges.filter(edge => edge.from === graph.root)).toEqual([{ from: graph.root, to: branch.id }]);
  expect(graph.edges.filter(edge => edge.from === branch.id)).toHaveLength(2);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "ICT233", requisites, prerequisites }));
  const accessible = html.match(/aria-label="Prerequisite requirements">(.*?)<\/ul>/)![1];
  expect(accessible).toContain("ICT233: requirements vary by programme:");
  expect(accessible).toContain("ICT133");
  expect(accessible).toContain("one of (ANL252; ICT133)");
  expect(accessible).not.toContain("ICT233: one of (ANL252; ICT133).");
  expect(html).toContain('href="#prerequisite-details"');
  return html;
}

it("preserves the six checked-in ICT233 decisions and their programme requirements", async () => {
  const decisions = reviewFileSchema.parse(reviewsFile).reviews.filter(review => review.ruleKey.includes(":ICT233:") && !review.archived);
  expect(decisions).toHaveLength(6);
  const plans = plansFile.plans.filter(plan => decisions.some(review => review.ruleKey.split(":")[1] === plan.planKey)).map(plan => fixturePlan({ ...plan, studyMode: plan.studyMode as "part-time" | "full-time" | null }));
  const rules = decisions.map(decision => {
    if (decision.decision !== "approved" || !("approvedRule" in decision)) throw new Error("ICT233 reviewed tree required");
    const plan = plans.find(plan => plan.planKey === decision.ruleKey.split(":")[1])!;
    const applicabilityKey = decision.ruleKey.split(":")[3];
    const tree = decision.approvedRule as PrerequisiteRuleNode;
    // Exercise the actual reviewed trees and registered programme identities.
    return fixtureRule(plan, tree, { ruleKey: decision.ruleKey, courseCode: "ICT233", applicabilityKey, rawText: graphRuleText(tree) });
  });
  expect(rules.filter(rule => rule.approvedRuleJson?.type === "course")).toHaveLength(4);
  expect(rules.filter(rule => rule.approvedRuleJson?.type === "any")).toHaveLength(2);
  const catalogue = ["ICT233", "ICT133", "ANL252"].map(courseCode => ({ ...fixtureCatalogue[0], courseCode, href: `/courses/${courseCode}` }));
  const { byCourse } = buildRequisites(plans, rules, catalogue);
  expect(byCourse.ICT233.prerequisiteVariants.map(variant => variant.ruleKeys.length).sort()).toEqual([2, 4]);
  const html = await assertScopedDisplay(byCourse.ICT233);
  for (const plan of plans) expect(html).toContain(plan.programmeName);
});

it("consolidates equivalent requirements from different programmes in graph and accessible text", () => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", sourceHash: "b".repeat(64) });
  const requisites = buildRequisites([first, second], [fixtureRule(first), fixtureRule(second)], fixtureCatalogue).byCourse.MAIN300;
  const graph = buildCourseGraph("MAIN300", requisites);
  expect(graph.requirements[0].rules).toEqual([course("PRE100")]);
  expect(graph.nodes.some(node => node.label === "by programme")).toBe(false);
  const html = renderToStaticMarkup(createElement(PrerequisiteTree, { courseCode: "MAIN300", requisites }));
  expect(html).toContain("MAIN300: PRE100.");
  expect(html).not.toContain("requirements vary by programme");
});
