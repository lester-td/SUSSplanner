import { buildSharedClassIdentifier, encodeShareUrlState } from "./share-url";
import type { SharedTimetableState, TimetableData } from "./types";

// Batch the existing published resolver requests for both reviewed imports and
// passive restoration. Missing/failed destinations stay unverified.
export async function resolveContinuationTimetables(
  incoming: SharedTimetableState,
  timetable: TimetableData,
  signal?: AbortSignal,
)
{
  const requests = new Map<number, SharedTimetableState["selectedClasses"]>();
  const resolved = new Map(timetable.selections.map((item) => [buildSharedClassIdentifier(item.identifier), item]));
  for (const selection of incoming.selectedClasses)
  {
    if (selection.originSemesterId !== undefined) continue;
    const published = resolved.get(buildSharedClassIdentifier(selection));
    for (const id of new Set(published?.continuationSemesterIds ?? []))
    {
      if (id === incoming.semesterId) continue;
      requests.set(id, [...(requests.get(id) ?? []), { ...selection, originSemesterId: incoming.semesterId }]);
    }
  }
  const result = new Map<number, TimetableData>();
  await Promise.all([...requests].map(async ([semesterId, selectedClasses]) => {
    try
    {
      const query = encodeShareUrlState({ semesterId, selectedClasses }).split("?")[1];
      const response = await fetch(`/api/classes?${query}`, { signal });
      if (response.ok && !signal?.aborted) result.set(semesterId, (await response.json() as { timetable: TimetableData }).timetable);
    }
    catch { /* Caller defers restoration or discloses unverified import links. */ }
  }));
  return result;
}
