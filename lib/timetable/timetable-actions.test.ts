import { describe, expect, it } from "vitest";
import { getTimetableActionAvailability } from "./timetable-actions";
import type { SharedClassIdentifier } from "./types";

const selection: SharedClassIdentifier = {
  courseCode: "NIE351", scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN06",
};

describe("timetable action availability", () => {
  it("disables actions for an empty timetable", () => {
    expect(getTimetableActionAvailability([], 0)).toEqual({ canShare: false, canDownload: false, canReset: false });
  });

  it("allows sharing and downloading a continuation without resetting it", () => {
    expect(getTimetableActionAvailability([{ ...selection, originSemesterId: 20 }], 1))
      .toEqual({ canShare: true, canDownload: true, canReset: false });
  });

  it("enables reset when the timetable includes a starting selection", () => {
    expect(getTimetableActionAvailability([selection, { ...selection, originSemesterId: 20 }], 2))
      .toEqual({ canShare: true, canDownload: true, canReset: true });
  });

  it("allows stale starting selections to be cleared without sharing or downloading an unresolved timetable", () => {
    expect(getTimetableActionAvailability([selection], 0)).toEqual({ canShare: false, canDownload: false, canReset: true });
  });
});
