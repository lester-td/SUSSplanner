import { detectTimetableClashes } from "./clash-detection";
import { buildSharedClassIdentifier } from "./share-url";
import type { SharedClassIdentifier, TimetableClash, TimetableData, TimetableEventRecord } from "./types";

export type ImportClashAnalysis = {
  status: "complete" | "incomplete" | "unavailable";
  clashes: { clash: TimetableClash; change: "new" | "existing" | "unclassified" }[];
};

function collectEvents(
  selectedClasses: readonly SharedClassIdentifier[],
  timetables: (TimetableData | null)[],
  semesterId: number,
)
{
  const resolved = new Map(timetables.flatMap((timetable) => (
    timetable?.semester?.semesterId === semesterId ? timetable.selections : []
  )).map((selection) => [buildSharedClassIdentifier(selection.identifier), selection]));
  const keys = new Set(selectedClasses.map(buildSharedClassIdentifier));
  const events: TimetableEventRecord[] = [];
  let resolvedCount = 0;
  let complete = true;
  for (const key of keys)
  {
    const selection = resolved.get(key);
    if (!selection || selection.semesterId !== semesterId || !Array.isArray(selection.events))
    {
      complete = false;
      continue;
    }
    resolvedCount += 1;
    for (const event of selection.events)
    {
      if (event.semesterId !== semesterId || event.shareKey !== key)
      {
        complete = false;
        continue;
      }
      events.push(event);
    }
  }
  return { events, complete, resolvedCount };
}

function eventIdentity(event: TimetableEventRecord)
{
  // Semantic class identity includes the origin; dates/times identify the session.
  // Surrogate event IDs can change when publication snapshots are regenerated.
  return JSON.stringify([event.shareKey, event.eventKind, event.eventDate, event.startTime, event.endTime]);
}

export function buildTimetableImportClashAnalysis({
  selectedClasses,
  savedSelections,
  semesterId,
  incomingTimetable,
  savedTimetable,
}: {
  selectedClasses: readonly SharedClassIdentifier[];
  savedSelections: readonly SharedClassIdentifier[];
  semesterId: number;
  incomingTimetable: TimetableData;
  savedTimetable: TimetableData | null;
}): ImportClashAnalysis
{
  // Reuse already resolved publication records. Only the proposal's effective
  // selections participate, so skipped incoming and removed saved classes cannot clash.
  const effective = collectEvents(selectedClasses, [savedTimetable, incomingTimetable], semesterId);
  const saved = collectEvents(savedSelections, [savedTimetable], semesterId);
  const savedEvents = new Set(saved.events.map(eventIdentity));
  const clashes = detectTimetableClashes(effective.events).map((clash) => ({
    clash,
    // Existing detector groups can shrink or expand. Matching sessions avoids
    // calling an unchanged overlap new just because a third participant was removed.
    change: clash.events.every((event) => savedEvents.has(eventIdentity(event)))
      ? "existing" as const : saved.complete ? "new" as const : "unclassified" as const,
  }));
  return {
    status: effective.complete ? "complete" : effective.resolvedCount === 0 ? "unavailable" : "incomplete",
    clashes,
  };
}
