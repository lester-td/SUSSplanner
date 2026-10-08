import type { ClassEventRecord } from "./types";

const CAMPUS_NAMES: Record<string, string> = {
  CLE: "Clementi",
  AMK: "Nanyang Poly",
  EXT: "External Venue",
  ONL: "Online",
};
const CAMPUS_ORDER = Object.keys(CAMPUS_NAMES);

export const MIXED_CAMPUS_GUIDANCE = "Sessions for this class group take place across these locations. View the class schedule to check the campus for each session.";

function compareCampusCodes(left: string, right: string)
{
  const leftOrder = CAMPUS_ORDER.indexOf(left);
  const rightOrder = CAMPUS_ORDER.indexOf(right);
  return (leftOrder < 0 ? CAMPUS_ORDER.length : leftOrder)
    - (rightOrder < 0 ? CAMPUS_ORDER.length : rightOrder) || left.localeCompare(right);
}

export function normalizeCampusCodes(campuses: string[])
{
  return [...new Set(campuses.flatMap(campus => campus.split("/").map(value => {
    const trimmed = value.trim();
    return Object.entries(CAMPUS_NAMES).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase())?.[0]
      ?? trimmed.toUpperCase();
  })).filter(Boolean))].sort(compareCampusCodes);
}

export function getEventCampusCodes(event: Pick<ClassEventRecord, "campus" | "eventMode">)
{
  return normalizeCampusCodes([event.campus ?? ""]);
}

export function getClassCampusCodes(events: Pick<ClassEventRecord, "campus" | "eventMode" | "eventKind">[])
{
  return normalizeCampusCodes(events.filter(event => event.eventKind === "CLASS").flatMap(getEventCampusCodes));
}

export function groupClassesByCampus<T extends { events: Pick<ClassEventRecord, "campus" | "eventMode" | "eventKind">[] }>(classes: T[])
{
  const groups = new Map<string, { campuses: string[]; classes: T[] }>();
  for (const group of classes)
  {
    const campuses = getClassCampusCodes(group.events);
    const key = formatCampusCodes(campuses);
    const existing = groups.get(key);
    if (existing) existing.classes.push(group);
    else groups.set(key, { campuses, classes: [group] });
  }

  // Show single locations first, then combinations, with unspecified campuses last.
  return [...groups.values()].sort((left, right) => {
    const countOrder = (left.campuses.length || Infinity) - (right.campuses.length || Infinity);
    if (countOrder) return countOrder;
    for (let index = 0; index < left.campuses.length; index++)
    {
      const order = compareCampusCodes(left.campuses[index], right.campuses[index]);
      if (order) return order;
    }
    return 0;
  });
}

export function formatCampusCodes(campuses: string[])
{
  return normalizeCampusCodes(campuses).join("/");
}

export function formatCampusNames(campuses: string[])
{
  return normalizeCampusCodes(campuses).map(code => CAMPUS_NAMES[code] ?? code).join(" / ");
}

export function formatCampusSummary(campuses: string[])
{
  return normalizeCampusCodes(campuses).map(code => CAMPUS_NAMES[code] ?? code).join(" & ");
}
