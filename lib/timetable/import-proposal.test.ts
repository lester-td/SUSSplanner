import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTimetableImportProposal, commitTimetableImport } from "./import-proposal";
import { getSavedSemesterState, loadSavedTimetable, saveTimetableToLocalStorage, upsertClassInSavedTimetable } from "./local-storage";
import type { SharedClassIdentifier, TimetableData } from "./types";

const group = (courseCode: string, groupCode: string, originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, groupCode, groupCodeType: "TG", scheduleType: "daytime",
  ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const timetable = (...identifiers: SharedClassIdentifier[]) => ({
  selections: identifiers.map((identifier) => ({ identifier })),
}) as TimetableData;

afterEach(() => vi.unstubAllGlobals());

describe("timetable import proposal", () => {
  it("skips a conflicting continuation, keeps the valid saved link, and replaces ordinary classes", () => {
    const savedOrigin = group("NIE301", "TG02");
    const savedLink = group("NIE301", "TG02", 1);
    const incomingLink = group("NIE301", "TG01", 1);
    const added = group("ICT302", "TG03");
    const stale = group("MISSING", "TG01");
    let current = upsertClassInSavedTimetable(null, 1, savedOrigin, [3]);
    current = upsertClassInSavedTimetable(current, 3, group("ICT301", "TG01"));
    const before = structuredClone(current);
    const proposal = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [incomingLink, added, added, stale] },
      current,
      incomingTimetable: timetable(incomingLink, added),
      savedTimetable: timetable(savedLink, group("ICT301", "TG01")),
    });
    expect(proposal.selectedClasses).toEqual([added, savedLink]);
    expect(getSavedSemesterState(proposal.projectedState, 3)!.selectedClasses).toEqual([added, savedLink]);
    expect(proposal.skipped).toEqual([
      { selection: incomingLink, reason: "conflict", savedOrigin },
      { selection: stale, reason: "unresolved" },
    ]);
    expect(proposal.canImport).toBe(true);
    expect(current).toEqual(before);
  });

  it("allows a published continuation without a saved origin and a matching saved origin", () => {
    const link = group("NIE301", "TG02", 1);
    const noOrigin = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [link] }, current: null,
      incomingTimetable: timetable(link), savedTimetable: null,
    });
    expect(noOrigin).toMatchObject({ selectedClasses: [link], skipped: [], canImport: true });

    const current = upsertClassInSavedTimetable(null, 1, group("NIE301", "TG02"), [3]);
    const matching = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [link] }, current,
      incomingTimetable: timetable(link), savedTimetable: timetable(link),
    });
    expect(matching).toMatchObject({ selectedClasses: [link], skipped: [], canImport: true });
  });

  it("preserves omitted valid links and independent starts but cannot clear when everything is skipped", () => {
    const link = group("NIE301", "TG02", 1);
    let current = upsertClassInSavedTimetable(null, 1, group("NIE301", "TG02"), [3]);
    current = upsertClassInSavedTimetable(current, 3, group("NIE301", "TG01"));
    const validNew = group("ICT302", "TG03");
    const withNew = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [validNew] }, current,
      incomingTimetable: timetable(validNew), savedTimetable: timetable(link),
    });
    expect(withNew.selectedClasses).toEqual([validNew, link]);

    const unresolved = group("GONE", "TG01");
    const onlySkipped = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [unresolved] }, current,
      incomingTimetable: timetable(), savedTimetable: timetable(link),
    });
    expect(onlySkipped.selectedClasses).toEqual([link]);
    expect(onlySkipped.canImport).toBe(false);
    expect(onlySkipped.skipped).toEqual([{ selection: unresolved, reason: "unresolved" }]);
  });

  it("reports multiple conflicts without affecting their existing links", () => {
    let current = upsertClassInSavedTimetable(null, 1, group("NIE301", "TG02"), [3]);
    current = upsertClassInSavedTimetable(current, 1, group("NIE351", "TG03"), [3]);
    const incoming = [group("NIE301", "TG01", 1), group("NIE351", "TG01", 1)];
    const saved = [group("NIE301", "TG02", 1), group("NIE351", "TG03", 1)];
    const proposal = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: incoming }, current,
      incomingTimetable: timetable(...incoming), savedTimetable: timetable(...saved),
    });
    expect(proposal.selectedClasses).toEqual(saved);
    expect(proposal.skipped.map((item) => item.reason)).toEqual(["conflict", "conflict"]);
    expect(proposal.canImport).toBe(false);
  });

  it("writes only after final confirmation and refuses a proposal made against stale saved state", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    const savedLink = group("NIE301", "TG02", 1);
    const conflicting = group("NIE301", "TG01", 1);
    const added = group("ICT302", "TG03");
    let current = upsertClassInSavedTimetable(null, 1, group("NIE301", "TG02"), [3]);
    current = upsertClassInSavedTimetable(current, 3, group("ICT301", "TG01"));
    saveTimetableToLocalStorage(current);
    const saved = loadSavedTimetable();
    const snapshot = JSON.stringify(saved);
    const proposal = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [conflicting, added] }, current: saved,
      incomingTimetable: timetable(conflicting, added), savedTimetable: timetable(savedLink),
    });
    expect(data.values().next().value).toBeDefined();
    const before = [...data.values()][0];
    expect(proposal.selectedClasses).toEqual([added, savedLink]);
    expect([...data.values()][0]).toBe(before);

    saveTimetableToLocalStorage(upsertClassInSavedTimetable(loadSavedTimetable(), 3, group("ICT303", "TG01")));
    const changed = [...data.values()][0];
    expect(commitTimetableImport({ semesterId: 3, proposal, expectedSavedState: snapshot })).toBe(false);
    expect([...data.values()][0]).toBe(changed);

    const refreshed = loadSavedTimetable();
    const reviewed = buildTimetableImportProposal({
      incoming: { semesterId: 3, selectedClasses: [conflicting, added] }, current: refreshed,
      incomingTimetable: timetable(conflicting, added), savedTimetable: timetable(savedLink),
    });
    expect(commitTimetableImport({ semesterId: 3, proposal: reviewed, expectedSavedState: JSON.stringify(refreshed) })).toBe(true);
    expect(getSavedSemesterState(loadSavedTimetable(), 3)!.selectedClasses).toEqual([added, savedLink]);
    expect(getSavedSemesterState(loadSavedTimetable(), 1)!.selectedClasses).toEqual([group("NIE301", "TG02")]);
    expect(loadSavedTimetable()).toEqual(reviewed.projectedState);
  });

  it("retains the 50-selection boundary including kept links", () => {
    const incoming = Array.from({ length: 50 }, (_, index) => group(`ICT${100 + index}`, "TG01"));
    const shared = { semesterId: 3, selectedClasses: incoming };
    const atLimit = buildTimetableImportProposal({ incoming: shared, current: null,
      incomingTimetable: timetable(...incoming), savedTimetable: null });
    expect(atLimit).toMatchObject({ canImport: true, tooManySelections: false });

    const origin = group("NIE301", "TG01");
    const link = { ...origin, originSemesterId: 1 };
    const current = upsertClassInSavedTimetable(null, 1, origin, [3]);
    const overLimit = buildTimetableImportProposal({ incoming: shared, current,
      incomingTimetable: timetable(...incoming), savedTimetable: timetable(link) });
    expect(overLimit).toMatchObject({ canImport: false, tooManySelections: true });
    expect(overLimit.selectedClasses).toEqual([link]);
    expect(overLimit.skipped).toHaveLength(50);
    expect(overLimit.skipped.every((item) => item.reason === "capacity")).toBe(true);
  });
});
