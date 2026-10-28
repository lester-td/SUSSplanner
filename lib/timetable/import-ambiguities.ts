import { getEnrolmentOwner } from "./continuation-ownership";
import { buildSharedClassIdentifier } from "./share-url";
import type { SharedClassIdentifier, SharedTimetableState } from "./types";

export function getImportEnrolmentKey(selection: SharedClassIdentifier, semesterId: number)
{
  const owner = getEnrolmentOwner(selection, semesterId);
  return `${owner.courseCode}:${owner.originSemesterId}`;
}

export function getTimetableImportGroups(incoming: SharedTimetableState)
{
  const groups = new Map<string, SharedClassIdentifier[]>();
  const seen = new Set<string>();
  for (const selection of incoming.selectedClasses)
  {
    const identifier = buildSharedClassIdentifier(selection);
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    const key = getImportEnrolmentKey(selection, incoming.semesterId);
    groups.set(key, [...(groups.get(key) ?? []), selection]);
  }
  return groups;
}

export function resolveTimetableImportGroups(incoming: SharedTimetableState, choices: Readonly<Record<string, string>>)
{
  const groups = getTimetableImportGroups(incoming);
  return {
    semesterId: incoming.semesterId,
    selectedClasses: incoming.selectedClasses.filter((selection, index, selections) => {
      const identifier = buildSharedClassIdentifier(selection);
      if (selections.findIndex((item) => buildSharedClassIdentifier(item) === identifier) !== index) return false;
      const key = getImportEnrolmentKey(selection, incoming.semesterId);
      return groups.get(key)!.length === 1 || choices[key] === identifier;
    }),
  };
}
