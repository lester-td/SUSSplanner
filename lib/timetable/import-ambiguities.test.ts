import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportGroupSelection } from "@/components/timetable/import-group-selection";
import { getTimetableImportGroups, resolveTimetableImportGroups } from "./import-ambiguities";
import { buildTimetableImportProposal } from "./import-proposal";
import { buildSharedClassIdentifier as keyOf } from "./share-url";
import type { SharedClassIdentifier, TimetableData } from "./types";

const group = (courseCode: string, groupCode: string, originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, groupCode, groupCodeType: "TG", scheduleType: "daytime", ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const first = group("NIE301", "TG02");
const second = group("NIE301", "TG01");
const incoming = { semesterId: 14, selectedClasses: [first, first, second, group("NIE351", "TG03"), group("NIE351", "TG02"), group("NIE301", "TG04", 3)] };

describe("incoming group choices", () => {
  it("deduplicates identifiers, preserves incoming group order, and separates originating semesters", () => {
    const groups = getTimetableImportGroups(incoming);
    expect([...groups.values()]).toEqual([[first, second], incoming.selectedClasses.slice(3, 5), [incoming.selectedClasses[5]]]);
  });

  it("renders native single-choice controls with the first group selected for each enrolment", () => {
    const groups = getTimetableImportGroups(incoming);
    const choices = Object.fromEntries([...groups].map(([key, items]) => [key, keyOf(items[0])]));
    const html = renderToStaticMarkup(createElement(ImportGroupSelection, { groups, choices, semesters: [], onChange: () => {} }));
    expect(html.match(/<fieldset/g)).toHaveLength(2);
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain("Multiple groups detected for NIE301");
    const result = resolveTimetableImportGroups(incoming, choices);
    expect(result.selectedClasses).toEqual([first, incoming.selectedClasses[3], incoming.selectedClasses[5]]);
  });

  it("uses the user's group choice and never substitutes another group on validation failure", () => {
    const selected = resolveTimetableImportGroups({ semesterId: 14, selectedClasses: [first, second, first] }, { "NIE301:14": keyOf(second) });
    expect(selected.selectedClasses).toEqual([second]);
    const proposal = buildTimetableImportProposal({ incoming: selected, current: null,
      incomingTimetable: { selections: [{ identifier: first }] } as TimetableData, savedTimetable: null });
    expect(proposal).toMatchObject({ canImport: false, selectedClasses: [], skipped: [{ selection: second, reason: "unresolved" }] });
  });

  it("guards direct proposal callers against unresolved ambiguity instead of picking a winner", () => {
    const proposal = buildTimetableImportProposal({ incoming: { semesterId: 14, selectedClasses: [first, second] }, current: null,
      incomingTimetable: { selections: [{ identifier: first }, { identifier: second }] } as TimetableData, savedTimetable: null });
    expect(proposal.canImport).toBe(false);
    expect(proposal.skipped.map((item) => item.reason)).toEqual(["ambiguous", "ambiguous"]);
  });

  it("does not mark exact duplicates as ambiguous", () => {
    expect([...getTimetableImportGroups({ semesterId: 14, selectedClasses: [first, first] }).values()]).toEqual([[first]]);
  });
});
