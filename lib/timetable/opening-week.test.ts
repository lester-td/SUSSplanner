import { describe, expect, it } from "vitest";

import { normalizeAppSettings } from "@/lib/settings/app-settings";
import { resolveTimetableOpeningWeek } from "./opening-week";
import type { SemesterWeekRecord } from "./types";

const weeks: SemesterWeekRecord[] = [
  { weekId: 101, semesterId: 1, weekNo: 1, weekType: "TEACHING", label: "Week 1", startDate: "2026-09-28", endDate: "2026-10-04" },
  { weekId: 102, semesterId: 1, weekNo: 2, weekType: "TEACHING", label: "Week 2", startDate: "2026-10-05", endDate: "2026-10-11" },
  { weekId: 113, semesterId: 1, weekNo: 13, weekType: "STUDY", label: "Study week", startDate: "2026-12-21", endDate: "2026-12-27" },
];
const context = { semesterId: 1, currentSemesterId: 1, currentWeekId: 102, semesterWeeks: weeks };

describe("timetable opening preference", () => {
  it("opens All weeks even when a particular week was saved", () => {
    expect(resolveTimetableOpeningWeek({ ...context, openingView: "all-weeks", lastViewedWeekId: 101 })).toBe("all");
  });

  it("opens the current week instead of the saved week", () => {
    expect(resolveTimetableOpeningWeek({ ...context, openingView: "this-week", lastViewedWeekId: 101 })).toBe(102);
  });

  it("falls back to All weeks when This week is unavailable", () => {
    for (const overrides of [{ semesterId: 2 }, { currentWeekId: null }, { currentWeekId: 999 }, { currentWeekId: 113 }])
    {
      expect(resolveTimetableOpeningWeek({ ...context, ...overrides, openingView: "this-week" })).toBe("all");
    }
  });

  it("restores a saved week, including All weeks and study weeks", () => {
    for (const lastViewedWeekId of [101, 113, "all"] as const)
    {
      expect(resolveTimetableOpeningWeek({ ...context, openingView: "last-viewed", lastViewedWeekId })).toBe(lastViewedWeekId);
    }
  });

  it("keeps the current-week default for a semester without a saved view", () => {
    expect(resolveTimetableOpeningWeek({ ...context, openingView: "last-viewed" })).toBe(102);
  });

  it("falls back to All weeks when a saved week no longer belongs to the semester", () => {
    expect(resolveTimetableOpeningWeek({ ...context, openingView: "last-viewed", lastViewedWeekId: 999 })).toBe("all");
  });

  it("migrates existing settings to Last viewed and keeps valid preferences", () => {
    expect(normalizeAppSettings({ themeId: "focus" }).timetableOpeningView).toBe("last-viewed");
    expect(normalizeAppSettings({ timetableOpeningView: "invalid" }).timetableOpeningView).toBe("last-viewed");
    for (const timetableOpeningView of ["all-weeks", "this-week", "last-viewed"] as const)
    {
      expect(normalizeAppSettings({ timetableOpeningView }).timetableOpeningView).toBe(timetableOpeningView);
    }
  });
});
