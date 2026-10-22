import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimetableImportClashAnalysis } from "./import-clashes";
import { buildTimetableImportProposal, commitTimetableImport } from "./import-proposal";
import { loadSavedTimetable, saveTimetableToLocalStorage, upsertClassInSavedTimetable } from "./local-storage";
import { buildSharedClassIdentifier } from "./share-url";
import type { SharedClassIdentifier, TimetableData, TimetableEventRecord, TimetableSelectionRecord } from "./types";

const group = (courseCode: string, originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01",
  ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const added = group("ICT301");
const kept = group("NIE301", 1);
const other = group("ICT302");
const event = (identifier: SharedClassIdentifier, eventId: number, overrides: Partial<TimetableEventRecord> = {}): TimetableEventRecord => ({
  ...identifier, eventId, classId: eventId, semesterId: 3, shareKey: buildSharedClassIdentifier(identifier),
  courseName: null, schoolName: null, eventKind: "CLASS", eventDate: "2027-07-13", dayOfWeek: 2,
  startTime: "10:00:00", endTime: "11:00:00", eventMode: "ONLINE", campus: null, remarks: null,
  weekId: 1, weekNo: 1, weekType: "TEACHING", weekLabel: "Week 1", ...overrides,
});
const selection = (identifier: SharedClassIdentifier, events: TimetableEventRecord[]): TimetableSelectionRecord => ({
  ...identifier, identifier, events, semesterId: 3, classId: 1, shareKey: buildSharedClassIdentifier(identifier),
  availableAsGsp: null, isRestricted: null, remarks: null, courseName: null, schoolName: null,
  creditUnits: null, presentationPattern: null, hasEca: false, examAssessmentMode: null,
});
const timetable = (...selections: TimetableSelectionRecord[]): TimetableData => ({
  semester: { semesterId: 3, academicYear: "2027/2028", semesterNo: 1, semesterName: "July 2027" },
  semesterWeeks: [], selections, events: selections.flatMap((item) => item.events), clashes: [], unresolvedSelections: [],
});
const analyze = (incomingTimetable: TimetableData, savedTimetable: TimetableData | null = null,
  selectedClasses = incomingTimetable.selections.map((item) => item.identifier),
  savedSelections = savedTimetable?.selections.map((item) => item.identifier) ?? []) => buildTimetableImportClashAnalysis({
  selectedClasses, savedSelections, semesterId: 3, incomingTimetable, savedTimetable,
});

afterEach(() => vi.unstubAllGlobals());

describe("effective timetable import clashes", () => {
  it("finds overlapping effective sessions using the existing detector", () => {
    const analysis = analyze(timetable(selection(added, [event(added, 1)]), selection(other, [event(other, 2)])));
    expect(analysis.status).toBe("complete");
    expect(analysis.clashes).toHaveLength(1);
    expect(analysis.clashes[0].change).toBe("new");
  });

  it("includes kept links, excludes skipped/removed classes, and does not write before confirmation", () => {
    const store = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => store.set(key, value));
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem } });
    let current = upsertClassInSavedTimetable(null, 1, group("NIE301"), [3]);
    current = upsertClassInSavedTimetable(current, 3, other);
    saveTimetableToLocalStorage(current);
    const saved = loadSavedTimetable();
    const conflicting = { ...kept, groupCode: "TG02" };
    const unresolved = group("MISSING");
    const incoming = timetable(selection(added, [event(added, 1)]), selection(conflicting, [event(conflicting, 4)]));
    const previous = timetable(selection(kept, [event(kept, 2)]), selection(other, [event(other, 3)]));
    const proposal = buildTimetableImportProposal({ incoming: { semesterId: 3, selectedClasses: [added, conflicting, unresolved] },
      current: saved, incomingTimetable: incoming, savedTimetable: previous });
    setItem.mockClear();
    const analysis = analyze(incoming, previous, proposal.selectedClasses);
    expect(proposal.selectedClasses).toEqual([added, kept]);
    expect(proposal.skipped.map((item) => item.reason)).toEqual(["conflict", "unresolved"]);
    expect(analysis.clashes).toHaveLength(1);
    expect(analysis.clashes[0].clash.events.map((item) => item.shareKey)).toEqual([
      buildSharedClassIdentifier(added), buildSharedClassIdentifier(kept),
    ]);
    expect(setItem).not.toHaveBeenCalled();
    expect(commitTimetableImport({ semesterId: 3, proposal, expectedSavedState: JSON.stringify(saved) })).toBe(true);
    expect(loadSavedTimetable()?.selectedClasses).toEqual([added, kept]);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("does not warn for non-overlapping sessions or different actual teaching dates", () => {
    const first = selection(added, [event(added, 1)]);
    for (const overrides of [{ startTime: "11:00:00", endTime: "12:00:00" }, { eventDate: "2027-07-20", weekId: 2, weekNo: 2 }])
    {
      expect(analyze(timetable(first, selection(other, [event(other, 2, overrides)]))).clashes).toEqual([]);
    }
  });

  it("classifies existing and new clashes by session and class identity rather than surrogate IDs", () => {
    const oldAdded = selection(added, [event(added, 1)]);
    const oldKept = selection(kept, [event(kept, 2)]);
    const incoming = timetable(selection(added, [event(added, 101)]), selection(kept, [event(kept, 102)]),
      selection(other, [event(other, 3, { eventDate: "2027-07-20" })]));
    const saved = timetable(oldAdded, oldKept);
    expect(analyze(incoming, saved).clashes.map((item) => item.change)).toEqual(["existing"]);
    const changed = timetable(selection(added, [event(added, 1, { startTime: "10:30:00" })]), oldKept);
    expect(analyze(changed, saved).clashes.map((item) => item.change)).toEqual(["new"]);
  });

  it("keeps an existing clash classified correctly when its detector group shrinks", () => {
    const first = selection(added, [event(added, 1)]);
    const second = selection(kept, [event(kept, 2)]);
    const saved = timetable(first, second, selection(other, [event(other, 3)]));
    expect(analyze(timetable(first, second), saved).clashes.map((item) => item.change)).toEqual(["existing"]);
  });

  it("distinguishes independent originating enrolments in the same published session", () => {
    const independent = { ...kept, originSemesterId: 2 };
    const saved = timetable(selection(added, [event(added, 1)]), selection(kept, [event(kept, 2)]));
    const incoming = timetable(selection(added, [event(added, 1)]), selection(independent, [event(independent, 2)]));
    expect(analyze(incoming, saved).clashes[0].change).toBe("new");
  });

  it("handles multiple sessions and resolved zero-event/asynchronous classes", () => {
    const first = selection(added, [event(added, 1), event(added, 2, { eventDate: "2027-07-20" })]);
    const second = selection(other, [event(other, 3, { eventDate: "2027-07-20" })]);
    const analysis = analyze(timetable(first, second, selection(kept, [])));
    expect(analysis.status).toBe("complete");
    expect(analysis.clashes.map((item) => item.clash.eventDate)).toEqual(["2027-07-20"]);
    expect(analyze(timetable(selection(added, []), selection(kept, [])))).toEqual({ status: "complete", clashes: [] });
  });

  it("reports unavailable or incomplete analysis instead of a verified no-clash result", () => {
    expect(analyze(timetable(), null, [added])).toEqual({ status: "unavailable", clashes: [] });
    const resolved = timetable(selection(added, []));
    expect(analyze(resolved, null, [added, kept])).toEqual({ status: "incomplete", clashes: [] });
    expect(analyze({ ...resolved, semester: null }, null, [added]).status).toBe("unavailable");
    expect(analyze(timetable(selection(added, [event(added, 1, { semesterId: 14 })])), null, [added]).status).toBe("incomplete");
  });

  it("does not call a clash new when the saved baseline cannot be fully resolved", () => {
    const incoming = timetable(selection(added, [event(added, 1)]), selection(kept, [event(kept, 2)]));
    const analysis = analyze(incoming, timetable(selection(added, [event(added, 1)])), [added, kept], [added, kept]);
    expect(analysis.status).toBe("complete");
    expect(analysis.clashes[0].change).toBe("unclassified");
  });
});
