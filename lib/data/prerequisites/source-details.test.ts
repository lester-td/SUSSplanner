import { expect, it } from "vitest";
import { getPrerequisiteSourceDetails } from "./source-details";
import { buildRequisites } from "./build-requisites";
import { buildPrerequisiteTree } from "./build-prerequisite-tree";
import { fixtureCatalogue, fixturePlan, fixtureRule } from "./fixtures";

it("retains programme attribution for identical source-only statements and separates their remarks", () => {
  const first = fixturePlan(), second = fixturePlan({ planKey: "second", programmeName: "Second programme", studyMode: "full-time", curriculumVersion: "2026", sourceHash: "b".repeat(64) });
  const rawText = "PRE100\nRemarks: Department approval is also required.";
  const rules = [fixtureRule(first, undefined, { reviewStatus: "source_only", rawText }), fixtureRule(second, undefined, { reviewStatus: "source_only", rawText }),
    fixtureRule(second, { type: "course", courseCode: "MAIN300" }, { courseCode: "NEXT400", ruleKey: `prerequisite:${second.planKey}:NEXT400:default` })];
  const { byCourse } = buildRequisites([first, second], rules, fixtureCatalogue);
  const entries = getPrerequisiteSourceDetails("MAIN300", byCourse.MAIN300);
  expect(entries).toHaveLength(2);
  expect(entries.map(entry => entry.programme)).toEqual(["Demonstration programme · part-time · Sample", "Second programme · full-time · 2026"]);
  for (const entry of entries) expect(entry).toMatchObject({ courseCode: "MAIN300", prerequisites: ["PRE100"], remarks: ["Department approval is also required."], pending: false });
});

it("keeps approved display conditions and distinguishes pending remarks-only text", () => {
  const plan = fixturePlan();
  const { byCourse } = buildRequisites([plan], [
    fixtureRule(plan, { type: "course", courseCode: "PRE100", displayRemarks: ["Remarks: Additional experience is required."] }, { rawText: "PRE100\nRemarks: Additional experience is required." }),
    fixtureRule(plan, undefined, { courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default`, reviewStatus: "pending", rawText: "Remarks: Prior departmental approval." }),
  ], fixtureCatalogue);
  expect(getPrerequisiteSourceDetails("MAIN300", byCourse.MAIN300)[0]).toMatchObject({ prerequisites: ["PRE100"], remarks: ["Additional experience is required."] });
  expect(getPrerequisiteSourceDetails("PRE100", byCourse.PRE100)[0]).toMatchObject({ prerequisites: [], remarks: ["Prior departmental approval."], pending: true });
});

it("retains nested course source labels and literal prerequisite qualifications during expansion", async () => {
  const plan = fixturePlan();
  const { byCourse } = buildRequisites([plan], [fixtureRule(plan), fixtureRule(plan, { type: "course", courseCode: "ALT200" }, {
    courseCode: "PRE100", ruleKey: `prerequisite:${plan.planKey}:PRE100:default`, rawText: "ALT200 and minimum 30 CU.\nRemarks: Check departmental approval.",
  })], fixtureCatalogue);
  const tree = await buildPrerequisiteTree("MAIN300", byCourse.MAIN300, async code => byCourse[code] ?? null);
  expect(tree.sources.find(source => source.courseCode === "PRE100")).toMatchObject({ programme: "Demonstration programme · part-time · Sample", prerequisites: ["ALT200 and minimum 30 CU."], remarks: ["Check departmental approval."] });
});
