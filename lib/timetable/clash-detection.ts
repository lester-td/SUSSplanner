import { toMinutes } from "./date-utils";
import type { TimetableClash, TimetableEventRecord } from "./types";

function overlaps(left: TimetableEventRecord, right: TimetableEventRecord)
{
  if (left.eventDate !== right.eventDate)
  {
    return false;
  }

  if (left.eventId === right.eventId)
  {
    return false;
  }

  return toMinutes(left.startTime) < toMinutes(right.endTime)
    && toMinutes(right.startTime) < toMinutes(left.endTime);
}

export function detectTimetableClashes(events: TimetableEventRecord[])
{
  const sorted = [...events].sort((left, right) => {
    const leftKey = `${left.eventDate}${left.startTime}${left.endTime}${left.eventId}`;
    const rightKey = `${right.eventDate}${right.startTime}${right.endTime}${right.eventId}`;
    return leftKey.localeCompare(rightKey);
  });

  const clashes: TimetableClash[] = [];
  const seenPairs = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1)
  {
    const base = sorted[index];
    const related = [base];

    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1)
    {
      const candidate = sorted[nextIndex];
      if (candidate.eventDate !== base.eventDate)
      {
        break;
      }

      if (!overlaps(base, candidate))
      {
        continue;
      }

      const pairKey = [base.eventId, candidate.eventId].sort((left, right) => left - right).join(":");
      if (seenPairs.has(pairKey))
      {
        continue;
      }

      seenPairs.add(pairKey);
      related.push(candidate);
    }

    if (related.length < 2)
    {
      continue;
    }

    const startMinutes = Math.min(...related.map((event) => toMinutes(event.startTime)));
    const endMinutes = Math.max(...related.map((event) => toMinutes(event.endTime)));
    const clashKey = `${base.eventDate}:${startMinutes}:${endMinutes}:${related.map((event) => event.eventId).sort((left, right) => left - right).join("-")}`;

    clashes.push({
      clashKey,
      eventDate: base.eventDate,
      startTime: related.reduce((earliest, event) => toMinutes(event.startTime) < toMinutes(earliest) ? event.startTime : earliest, related[0].startTime),
      endTime: related.reduce((latest, event) => toMinutes(event.endTime) > toMinutes(latest) ? event.endTime : latest, related[0].endTime),
      events: related.sort((left, right) => {
        const timeDiff = toMinutes(left.startTime) - toMinutes(right.startTime);
        if (timeDiff !== 0)
        {
          return timeDiff;
        }
        return left.courseCode.localeCompare(right.courseCode);
      }),
    });
  }

  return clashes;
}
