import fs from "node:fs/promises";
import { inferSemesterFromIsoDate } from "./dates.js";
import type { ClassEventRecord, ScheduleParseResult } from "./types.js";

export type ScheduleCohortIndex = {
  formatVersion: 1;
  sources: string[];
  eventStarts: Record<string, string>;
};

type ScheduleSource = { source: string; result: ScheduleParseResult };

function eventKey(event: ClassEventRecord): string {
  return [event.courseCode, event.scheduleType, event.groupCodeType, event.groupCode,
    event.eventKind, event.eventDate, event.startTime, event.endTime].join("|");
}

export async function readScheduleCohortIndex(filePath: string): Promise<ScheduleCohortIndex | undefined> {
  try {
    const index = JSON.parse(await fs.readFile(filePath, "utf8")) as ScheduleCohortIndex;
    if (index.formatVersion !== 1 || !Array.isArray(index.sources) || !index.eventStarts
      || typeof index.eventStarts !== "object") throw new Error(`Invalid existing cohort index: ${filePath}`);
    return index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// Ownership is the explicitly assigned source intake. Dates only determine
// whether a session needs a compatibility mapping for a different displayed term.
export function buildScheduleCohortIndex(sources: ScheduleSource[], previous?: ScheduleCohortIndex): ScheduleCohortIndex {
  const replaced = new Set(sources.flatMap(({ result }) => result.classEvents.map(eventKey)));
  const preserved = Object.entries(previous?.eventStarts ?? {}).filter(([key]) => !replaced.has(key));
  const owners = new Map<string, string>(preserved);
  const crossSemesterKeys = new Set(preserved.map(([key]) => key));
  for (const { result } of sources) {
    for (const event of result.classEvents) {
      const key = eventKey(event);
      const owner = `${event.academicYear}#${event.semesterNo}`;
      const existing = owners.get(key);
      if (existing && existing !== owner) throw new Error(`Conflicting schedule cohorts for ${key}: ${existing} / ${owner}`);
      owners.set(key, owner);
      const displayed = inferSemesterFromIsoDate(event.eventDate);
      if (displayed.academicYear !== event.academicYear || displayed.semesterNo !== event.semesterNo) crossSemesterKeys.add(key);
    }
  }
  return {
    formatVersion: 1,
    sources: [...new Set([...(previous?.sources ?? []), ...sources.map(item => item.source)])].sort(),
    eventStarts: Object.fromEntries([...crossSemesterKeys].sort().map(key => [key, owners.get(key)!])),
  };
}
