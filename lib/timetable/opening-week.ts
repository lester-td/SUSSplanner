import type { TimetableOpeningView } from "@/lib/settings/app-settings";
import type { SemesterWeekRecord } from "./types";

export function resolveTimetableOpeningWeek({
  openingView,
  semesterId,
  currentSemesterId,
  currentWeekId,
  semesterWeeks,
  lastViewedWeekId,
}: {
  openingView: TimetableOpeningView;
  semesterId: number;
  currentSemesterId: number;
  currentWeekId: number | null;
  semesterWeeks: SemesterWeekRecord[];
  lastViewedWeekId?: number | "all";
}): number | "all"
{
  if (openingView === "all-weeks") return "all";

  if (openingView === "last-viewed" && lastViewedWeekId !== undefined)
  {
    return lastViewedWeekId === "all" || semesterWeeks.some((week) => week.weekId === lastViewedWeekId)
      ? lastViewedWeekId
      : "all";
  }

  const currentWeek = semesterWeeks.find((week) => week.weekId === currentWeekId);
  return semesterId === currentSemesterId
    && currentWeek?.weekType === "TEACHING"
    && currentWeek.weekNo >= 1
    && currentWeek.weekNo <= 12
    ? currentWeek.weekId
    : "all";
}
