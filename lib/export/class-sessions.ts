import type { TimetableData } from "@/lib/timetable/types";

export function getPdfClassSessionEvents(timetable: TimetableData, hiddenClasses: string[] = [])
{
  const hidden = new Set(hiddenClasses);
  return (timetable.classSessionEvents ?? timetable.events)
    .filter(event => event.eventKind !== "EXAM" && !hidden.has(event.shareKey));
}
