import type { SharedClassIdentifier } from "./types";

export function getTimetableActionAvailability(selectedClasses: SharedClassIdentifier[], resolvedCourseCount: number)
{
  return {
    canShare: resolvedCourseCount > 0,
    canDownload: resolvedCourseCount > 0,
    canReset: selectedClasses.some(selection => selection.originSemesterId === undefined),
  };
}
