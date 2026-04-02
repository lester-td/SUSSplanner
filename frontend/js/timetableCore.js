import { DAYS, FULL_START_MINUTES, FULL_END_MINUTES } from "./constants.js";
import { toMinutes } from "./time.js";

export function filterByWeekPattern(lesson, weekPattern, weekNumber)
{
  const lessonPattern = lesson.weekPattern || "all";
  if (weekPattern === "all" || lessonPattern === "all")
  {
    return true;
  }

  const oddWeek = weekNumber % 2 === 1;
  return lessonPattern === "odd" ? oddWeek : !oddWeek;
}

export function assignLanes(events)
{
  const moduleRootCode = (code) => String(code || "").toUpperCase().replace(/-TG\d+$/i, "");
  const tgRank = (code) => {
    const match = String(code || "").toUpperCase().match(/-TG(\d+)$/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const sorted = [...events].sort((a, b) => {
    const byTime = a.start - b.start || a.end - b.end;
    if (byTime !== 0)
    {
      return byTime;
    }

    const codeA = String(a.code || "");
    const codeB = String(b.code || "");
    const rootA = moduleRootCode(codeA);
    const rootB = moduleRootCode(codeB);
    const byRoot = rootA.localeCompare(rootB, undefined, { numeric: true, sensitivity: "base" });
    if (byRoot !== 0)
    {
      return byRoot;
    }

    const byTg = tgRank(codeA) - tgRank(codeB);
    if (byTg !== 0)
    {
      return byTg;
    }

    const byCode = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: "base" });
    if (byCode !== 0)
    {
      return byCode;
    }

    const venueA = String(a.venue || "");
    const venueB = String(b.venue || "");
    return venueA.localeCompare(venueB, undefined, { numeric: true, sensitivity: "base" });
  });

  const laneEvents = [];
  let cluster = [];
  let clusterEnd = -1;

  function finalizeCluster(items)
  {
    if (items.length === 0)
    {
      return;
    }

    const laneEndTimes = [];
    let maxLaneCount = 0;

    items.forEach((event) => {
      let lane = laneEndTimes.findIndex((endTime) => endTime <= event.start);
      if (lane === -1)
      {
        lane = laneEndTimes.length;
        laneEndTimes.push(event.end);
      }
      else
      {
        laneEndTimes[lane] = event.end;
      }

      maxLaneCount = Math.max(maxLaneCount, laneEndTimes.length);
      laneEvents.push({ ...event, lane });
    });

    for (let idx = laneEvents.length - items.length; idx < laneEvents.length; idx += 1)
    {
      laneEvents[idx].laneCount = maxLaneCount;
    }
  }

  sorted.forEach((event) => {
    if (cluster.length === 0 || event.start < clusterEnd)
    {
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end);
      return;
    }

    finalizeCluster(cluster);
    cluster = [event];
    clusterEnd = event.end;
  });

  finalizeCluster(cluster);
  return laneEvents;
}

export function getVisibleTimeBounds(lessons, squishTime)
{
  if (!squishTime || lessons.length === 0)
  {
    return { startMinutes: FULL_START_MINUTES, endMinutes: FULL_END_MINUTES };
  }

  let earliest = FULL_END_MINUTES;
  let latest = FULL_START_MINUTES;

  lessons.forEach((lesson) => {
    earliest = Math.min(earliest, toMinutes(lesson.start));
    latest = Math.max(latest, toMinutes(lesson.end));
  });

  const roundedStart = Math.floor(earliest / 30) * 30;
  const roundedEnd = Math.ceil(latest / 30) * 30;

  return {
    startMinutes: Math.max(FULL_START_MINUTES, roundedStart),
    endMinutes: Math.min(FULL_END_MINUTES, roundedEnd),
  };
}

function clampWindow(startMinutes, slotCount, fullStartMinutes, fullEndMinutes)
{
  let start = startMinutes;
  let end = start + slotCount * 30;

  if (start < fullStartMinutes)
  {
    start = fullStartMinutes;
    end = start + slotCount * 30;
  }

  if (end > fullEndMinutes)
  {
    end = fullEndMinutes;
    start = end - slotCount * 30;
  }

  return {
    startMinutes: start,
    endMinutes: end,
  };
}

function alignWindowToHour(startMinutes, slotCount, fullStartMinutes, fullEndMinutes)
{
  let adjustedStart = startMinutes;

  if (adjustedStart % 60 !== 0)
  {
    const forward = adjustedStart + 30;
    const backward = adjustedStart - 30;

    if (forward + slotCount * 30 <= fullEndMinutes)
    {
      adjustedStart = forward;
    }
    else if (backward >= fullStartMinutes)
    {
      adjustedStart = backward;
    }
  }

  return clampWindow(adjustedStart, slotCount, fullStartMinutes, fullEndMinutes);
}

export function getAdaptiveVerticalBounds(lessons, containerWidth)
{
  const fullStartMinutes = FULL_START_MINUTES;
  const fullEndMinutes = FULL_END_MINUTES;
  const totalSlots = (fullEndMinutes - fullStartMinutes) / 30;

  const safeWidth = Number(containerWidth);
  if (!Number.isFinite(safeWidth) || safeWidth <= 0 || lessons.length === 0)
  {
    return { startMinutes: fullStartMinutes, endMinutes: fullEndMinutes };
  }

  const timeAxisWidth = 72;
  const preferredSlotWidth = 44;
  const availableWidth = Math.max(0, safeWidth - timeAxisWidth);

  let visibleSlots = Math.min(totalSlots, Math.max(8, Math.floor(availableWidth / preferredSlotWidth)));
  if (visibleSlots >= totalSlots)
  {
    return { startMinutes: fullStartMinutes, endMinutes: fullEndMinutes };
  }

  if (visibleSlots % 2 === 1)
  {
    visibleSlots = Math.max(8, visibleSlots - 1);
  }

  const lessonWindows = lessons
    .map((lesson) => ({
      start: toMinutes(lesson.start),
      end: toMinutes(lesson.end),
    }))
    .filter((lesson) => lesson.end > lesson.start);

  if (lessonWindows.length === 0)
  {
    return { startMinutes: fullStartMinutes, endMinutes: fullEndMinutes };
  }

  const lessonMidpoint = lessonWindows
    .reduce((sum, lesson) => sum + (lesson.start + lesson.end) / 2, 0) / lessonWindows.length;

  const earliestStart = Math.min(...lessonWindows.map((lesson) => lesson.start));
  const latestEnd = Math.max(...lessonWindows.map((lesson) => lesson.end));
  const spanStart = Math.max(fullStartMinutes, Math.floor(earliestStart / 60) * 60);
  const spanEnd = Math.min(fullEndMinutes, Math.ceil(latestEnd / 60) * 60);
  const spanSlotsRaw = Math.max(1, (spanEnd - spanStart) / 30);
  const spanSlots = spanSlotsRaw % 2 === 0 ? spanSlotsRaw : spanSlotsRaw + 1;

  if (spanSlots <= visibleSlots)
  {
    const minimumContextSlots = Math.min(visibleSlots, 10);
    let targetSlots = Math.max(spanSlots, minimumContextSlots);
    if (targetSlots % 2 === 1)
    {
      targetSlots = Math.min(visibleSlots, targetSlots + 1);
    }

    const extraSlots = targetSlots - spanSlots;
    const startMinutes = spanStart - Math.floor(extraSlots / 2) * 30;
    const clamped = clampWindow(startMinutes, targetSlots, fullStartMinutes, fullEndMinutes);
    return alignWindowToHour(clamped.startMinutes, targetSlots, fullStartMinutes, fullEndMinutes);
  }

  let bestStartSlot = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  const evaluateWindows = (hourAlignedOnly) => {
    let found = false;

    for (let startSlot = 0; startSlot <= totalSlots - visibleSlots; startSlot += 1)
    {
      const windowStart = fullStartMinutes + startSlot * 30;
      const windowEnd = windowStart + visibleSlots * 30;

      if (hourAlignedOnly && windowStart % 60 !== 0)
      {
        continue;
      }

      found = true;
      let coveredMinutes = 0;
      let uncoveredMinutes = 0;

      lessonWindows.forEach((lesson) => {
        const overlap = Math.max(0, Math.min(lesson.end, windowEnd) - Math.max(lesson.start, windowStart));
        coveredMinutes += overlap;
        uncoveredMinutes += (lesson.end - lesson.start) - overlap;
      });

      const windowMidpoint = (windowStart + windowEnd) / 2;
      const midpointPenalty = Math.abs(windowMidpoint - lessonMidpoint) / 30;
      const score = coveredMinutes - uncoveredMinutes * 1.5 - midpointPenalty;

      if (score > bestScore)
      {
        bestScore = score;
        bestStartSlot = startSlot;
      }
    }

    return found;
  };

  const hasHourAligned = evaluateWindows(true);
  if (!hasHourAligned)
  {
    evaluateWindows(false);
  }

  const rawStart = fullStartMinutes + bestStartSlot * 30;
  return alignWindowToHour(rawStart, visibleSlots, fullStartMinutes, fullEndMinutes);
}

export function toRenderableEvents(lessons, bounds)
{
  const inWindow = lessons
    .map((lesson) => {
      const dayIdx = DAYS.indexOf(lesson.day);
      const originalStart = toMinutes(lesson.start);
      const originalEnd = toMinutes(lesson.end);
      const start = Math.max(originalStart, bounds.startMinutes);
      const end = Math.min(originalEnd, bounds.endMinutes);

      return {
        ...lesson,
        dayIdx,
        start,
        end,
        originalStart,
        originalEnd,
      };
    })
    .filter((event) => event.dayIdx >= 0 && event.originalEnd > bounds.startMinutes && event.originalStart < bounds.endMinutes && event.end > event.start);

  const grouped = new Map();
  inWindow.forEach((event) => {
    if (!grouped.has(event.dayIdx))
    {
      grouped.set(event.dayIdx, []);
    }
    grouped.get(event.dayIdx).push(event);
  });

  const resolved = [];
  grouped.forEach((groupEvents) => {
    resolved.push(...assignLanes(groupEvents));
  });

  return resolved;
}
