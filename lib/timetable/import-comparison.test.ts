import { describe, expect, it } from "vitest";
import { buildTimetableImportComparison } from "./import-comparison";
import { buildTimetableImportProposal } from "./import-proposal";
import { upsertClassInSavedTimetable } from "./local-storage";
import type { SharedClassIdentifier, TimetableData } from "./types";

const group = (courseCode: string, groupCode = "TG01", originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, groupCode, groupCodeType: "TG", scheduleType: "daytime", ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const data = (...identifiers: SharedClassIdentifier[]) => ({ selections: identifiers.map((identifier) => ({ identifier })) }) as TimetableData;
const compare = (saved: readonly SharedClassIdentifier[], incoming: readonly SharedClassIdentifier[], preservedSelections: readonly SharedClassIdentifier[] = []) => (
  buildTimetableImportComparison(saved, { selectedClasses: incoming, preservedSelections })
);

describe("effective timetable import comparison", () => {
  it("accepts readonly selection-only inputs for a no-op comparison", () => {
    const saved = Object.freeze([group("ICT301")]);
    expect(compare(saved, saved)).toMatchObject({ added: [], removed: [], hasChanges: false });
  });

  it("shows additions for an empty saved timetable, and removals for replacement", () => {
    const added = group("ICT302", "TG03");
    expect(compare([], [added])).toMatchObject({ added: [added], removed: [], hasChanges: true });
    expect(compare([group("ICT301")], [added])).toMatchObject({ added: [added], removed: [group("ICT301")] });
    expect(compare([added], [])).toMatchObject({ added: [], removed: [added] });
  });

  it("shows group changes as added and removed, preserving independent intake identities", () => {
    const previous = group("NIE301");
    const next = { ...group("NIE301", "CRN02"), groupCodeType: "CRN" as const, scheduleType: "evening" as const };
    expect(compare([previous], [next])).toMatchObject({ added: [next], removed: [previous] });
    const independent = group("NIE301", "TG02", 1);
    expect(compare([previous], [independent])).toMatchObject({ added: [independent], removed: [previous] });
    expect(compare([group("NIE301", "TG01", 1)], [group("NIE301", "TG02", 14)]).removed).toEqual([group("NIE301", "TG01", 1)]);
  });

  it("does not guess when saved or effective identity is ambiguous", () => {
    const old = group("NIE301");
    const other = group("NIE301", "TG02");
    const next = group("NIE301", "TG03");
    expect(compare([old, other], [next])).toMatchObject({ removed: [old, other], added: [next] });
    expect(compare([old], [other, next])).toEqual({ added: [other, next], removed: [old], hasChanges: true });
  });

  it("omits retained and unchanged classes including originless continuations", () => {
    const link = group("NIE301", "TG02", 1);
    const ordinary = group("ICT301");
    const originless = group("NIE351", "TG01", 14);
    expect(compare([link, ordinary, originless], [ordinary, link, link, originless], [link])).toEqual({
      added: [], removed: [], hasChanges: false,
    });
  });

  it("compares the combined effective proposal, excluding multiple conflicts and unresolved identifiers", () => {
    let current = upsertClassInSavedTimetable(null, 1, group("NIE301", "TG02"), [3]);
    current = upsertClassInSavedTimetable(current, 14, group("NIE351", "TG03"), [3]);
    const saved = [group("NIE301", "TG02", 1), group("NIE351", "TG03", 14), group("ICT301")];
    const added = group("ICT302", "TG03");
    const incoming = [group("NIE301", "TG01", 1), group("NIE351", "TG01", 14), group("GONE"), added];
    const proposal = buildTimetableImportProposal({ current, incoming: { semesterId: 3, selectedClasses: incoming },
      incomingTimetable: data(...incoming.filter((item) => item.courseCode !== "GONE")), savedTimetable: data(...saved) });
    expect(proposal.skipped.map((item) => item.reason)).toEqual(["conflict", "conflict", "unresolved"]);
    expect(buildTimetableImportComparison(saved, proposal)).toEqual({ added: [added], removed: [group("ICT301")],
      hasChanges: true });
  });

  it("retains the all-skipped and deliberately empty import safeguards", () => {
    for (const incoming of [[], [group("GONE")]])
    {
      const proposal = buildTimetableImportProposal({ incoming: { semesterId: 3, selectedClasses: incoming },
        current: null, incomingTimetable: data(), savedTimetable: null });
      expect(proposal.canImport).toBe(false);
    }
  });
});
