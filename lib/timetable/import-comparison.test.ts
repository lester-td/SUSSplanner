import { describe, expect, it } from "vitest";
import { buildTimetableImportComparison } from "./import-comparison";
import { buildTimetableImportProposal } from "./import-proposal";
import { upsertClassInSavedTimetable } from "./local-storage";
import type { SharedClassIdentifier, TimetableData } from "./types";

const group = (courseCode: string, groupCode = "TG01", originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, groupCode, groupCodeType: "TG", scheduleType: "daytime", ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const data = (...identifiers: SharedClassIdentifier[]) => ({ selections: identifiers.map((identifier) => ({ identifier })) }) as TimetableData;
const compare = (saved: SharedClassIdentifier[], incoming: SharedClassIdentifier[], preservedSelections: SharedClassIdentifier[] = []) => (
  buildTimetableImportComparison(saved, { selectedClasses: incoming, preservedSelections, skipped: [], canImport: true, tooManySelections: false })
);

describe("effective timetable import comparison", () => {
  it("shows additions for an empty saved timetable, and removals for replacement", () => {
    const added = group("ICT302", "TG03");
    expect(compare([], [added])).toMatchObject({ added: [added], removed: [], changed: [], hasChanges: true });
    expect(compare([group("ICT301")], [added])).toMatchObject({ added: [added], removed: [group("ICT301")] });
    expect(compare([added], [])).toMatchObject({ added: [], removed: [added] });
  });

  it("pairs changed group/class identities only within the same course and intake", () => {
    const previous = group("NIE301");
    const next = { ...group("NIE301", "CRN02"), groupCodeType: "CRN" as const, scheduleType: "evening" as const };
    expect(compare([previous], [next])).toMatchObject({ added: [], removed: [], changed: [{ before: previous, after: next }] });
    const independent = group("NIE301", "TG02", 1);
    expect(compare([previous], [independent])).toMatchObject({ added: [independent], removed: [previous], changed: [] });
    expect(compare([group("NIE301", "TG01", 1)], [group("NIE301", "TG02", 14)]).changed).toEqual([]);
  });

  it("does not guess when saved or effective identity is ambiguous", () => {
    const old = group("NIE301");
    const other = group("NIE301", "TG02");
    const next = group("NIE301", "TG03");
    expect(compare([old, other], [next])).toMatchObject({ removed: [old, other], added: [next], changed: [] });
    expect(compare([old], [other, next]).changed).toEqual([]);
  });

  it("distinguishes retained linked continuations from unchanged ordinary or originless classes", () => {
    const link = group("NIE301", "TG02", 1);
    const ordinary = group("ICT301");
    const originless = group("NIE351", "TG01", 14);
    expect(compare([link, ordinary, originless], [ordinary, link, link, originless], [link])).toEqual({
      added: [], removed: [], changed: [], preserved: [link], unchanged: [ordinary, originless], hasChanges: false,
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
      changed: [], preserved: saved.slice(0, 2), unchanged: [], hasChanges: true });
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
