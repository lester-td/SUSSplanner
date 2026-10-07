import type { ClassEventRecord } from "./types";

const CAMPUS_NAMES: Record<string, string> = {
  ONL: "Online",
  CLE: "Clementi",
  NP: "Ngee Ann Poly",
  NYP: "Nanyang Poly",
};
const CAMPUS_ORDER = Object.keys(CAMPUS_NAMES);

export const MIXED_CAMPUS_GUIDANCE = "Check the class schedule as different sessions are held in different campuses.";

export function normalizeCampusCodes(campuses: string[])
{
  return [...new Set(campuses.flatMap(campus => campus.split("/").map(value => {
    const trimmed = value.trim();
    return Object.entries(CAMPUS_NAMES).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase())?.[0]
      ?? trimmed.toUpperCase();
  })).filter(Boolean))].sort((left, right) => {
    const leftOrder = CAMPUS_ORDER.indexOf(left);
    const rightOrder = CAMPUS_ORDER.indexOf(right);
    return (leftOrder < 0 ? CAMPUS_ORDER.length : leftOrder)
      - (rightOrder < 0 ? CAMPUS_ORDER.length : rightOrder) || left.localeCompare(right);
  });
}

export function getEventCampusCodes(event: Pick<ClassEventRecord, "campus" | "eventMode">)
{
  return normalizeCampusCodes([event.campus ?? ""]);
}

export function getClassCampusCodes(events: Pick<ClassEventRecord, "campus" | "eventMode" | "eventKind">[])
{
  return normalizeCampusCodes(events.filter(event => event.eventKind === "CLASS").flatMap(getEventCampusCodes));
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
  const codes = normalizeCampusCodes(campuses);
  return codes.length > 1 ? "Mixed" : formatCampusNames(codes);
}
