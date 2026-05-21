import {
  buildSharedClassIdentifier,
} from "./share-url";
import {
  buildWeekLabel,
  DEFAULT_END_MINUTES,
  formatDateRange,
  formatEventDate,
  getVisibleEndMinutes,
  stripSeconds,
  toMinutes,
} from "./date-utils";
import type {
  ClassEventWithWeekRecord,
  ExamCard,
  SemesterWeekRecord,
  TimetableBlock,
  TimetableData,
  TimetableEventRecord,
  TimetableSelectionRecord,
} from "./types";

const COURSE_COLORS = [
  "#cf5b22",
  "#2e6f95",
  "#7a8f2d",
  "#8f4bc4",
  "#008b7b",
  "#c14953",
  "#a76318",
  "#3556b8",
];

function unique<T>(values: T[])
{
  return [...new Set(values)];
}

function formatWeekSummary(events: ClassEventWithWeekRecord[])
{
  const teachingWeekNumbers = unique(
    events
      .filter((event) => event.weekType === "TEACHING" && event.weekNo !== null)
      .map((event) => event.weekNo as number),
  );

  if (teachingWeekNumbers.length > 0)
  {
    const sortedWeeks = [...teachingWeekNumbers].sort((left, right) => left - right);
    const coversAllTeachingWeeks = sortedWeeks.length === 12 && sortedWeeks.every((week, index) => week === index + 1);

    if (coversAllTeachingWeeks)
    {
      return "1-12";
    }

    const rangeLabels: string[] = [];
    let start = sortedWeeks[0];
    let previous = sortedWeeks[0];

    for (const current of sortedWeeks.slice(1))
    {
      if (current === previous + 1)
      {
        previous = current;
        continue;
      }

      rangeLabels.push(start === previous ? String(start) : `${start}-${previous}`);
      start = current;
      previous = current;
    }

    rangeLabels.push(start === previous ? String(start) : `${start}-${previous}`);

    return rangeLabels.join(", ");
  }

  const labels = unique(events.map((event) => event.weekLabel ?? formatEventDate(event.eventDate)).filter(Boolean));

  if (labels.length === 0)
  {
    return "Scheduled";
  }

  if (labels.length <= 3)
  {
    return labels.join(", ");
  }

  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
}

export function getCourseColorMap(selections: TimetableSelectionRecord[])
{
  const colorMap = new Map<string, string>();
  let colorIndex = 0;

  for (const selection of selections)
  {
    if (!colorMap.has(selection.courseCode))
    {
      colorMap.set(selection.courseCode, COURSE_COLORS[colorIndex % COURSE_COLORS.length]);
      colorIndex += 1;
    }
  }

  return colorMap;
}

export function buildTimetableBlocks(
  events: TimetableEventRecord[],
  selectedWeekId: number | "all",
)
{
  const classEvents = events.filter((event) => event.eventKind !== "EXAM");

  if (selectedWeekId !== "all")
  {
    return classEvents
      .filter((event) => event.weekId === selectedWeekId)
      .map((event) => ({
        id: `${event.eventId}`,
        shareKey: event.shareKey,
        courseCode: event.courseCode,
        courseName: event.courseName,
        groupCode: event.groupCode,
        groupCodeType: event.groupCodeType,
        dayOfWeek: event.dayOfWeek,
        startMinutes: toMinutes(event.startTime),
        endMinutes: toMinutes(event.endTime),
        weekLabel: event.weekLabel ?? formatEventDate(event.eventDate),
        venue: event.venue,
        eventMode: event.eventMode,
        occurrenceCount: 1,
        eventIds: [event.eventId],
      } satisfies TimetableBlock))
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinutes - right.startMinutes || left.courseCode.localeCompare(right.courseCode));
  }

  const grouped = new Map<string, TimetableBlock>();

  for (const event of classEvents)
  {
    const groupKey = [
      event.shareKey,
      event.eventKind,
      event.dayOfWeek,
      stripSeconds(event.startTime),
      stripSeconds(event.endTime),
      event.venue ?? "",
      event.eventMode ?? "",
    ].join("|");

    const existing = grouped.get(groupKey);
    if (existing)
    {
      existing.occurrenceCount += 1;
      existing.eventIds.push(event.eventId);
      existing.weekLabel = formatWeekSummary([
        ...existing.eventIds.map((eventId) => classEvents.find((candidate) => candidate.eventId === eventId)).filter(Boolean) as ClassEventWithWeekRecord[],
      ]);
      continue;
    }

    grouped.set(groupKey, {
      id: groupKey,
      shareKey: event.shareKey,
      courseCode: event.courseCode,
      courseName: event.courseName,
      groupCode: event.groupCode,
      groupCodeType: event.groupCodeType,
      dayOfWeek: event.dayOfWeek,
      startMinutes: toMinutes(event.startTime),
      endMinutes: toMinutes(event.endTime),
      weekLabel: formatWeekSummary([event]),
      venue: event.venue,
      eventMode: event.eventMode,
      occurrenceCount: 1,
      eventIds: [event.eventId],
    });
  }

  return [...grouped.values()].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinutes - right.startMinutes || left.courseCode.localeCompare(right.courseCode));
}

export function buildExamCards(events: TimetableEventRecord[])
{
  return events
    .filter((event) => event.eventKind === "EXAM")
    .map((event) => ({
      id: `${event.eventId}`,
      shareKey: event.shareKey,
      courseCode: event.courseCode,
      courseName: event.courseName,
      groupCode: event.groupCode,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      examMode: event.eventMode,
    } satisfies ExamCard))
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`));
}

export function buildSelectedCourseCards(data: TimetableData)
{
  const colorMap = getCourseColorMap(data.selections);
  return data.selections.map((selection) => {
    const exam = selection.events
      .filter((event) => event.eventKind === "EXAM")
      .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`))[0] ?? null;
    return {
      ...selection,
      shareKey: buildSharedClassIdentifier(selection.identifier),
      color: colorMap.get(selection.courseCode) ?? COURSE_COLORS[0],
      examDateLabel: exam ? formatEventDate(exam.eventDate) : selection.hasEca ? "ECA" : "No Exam",
      examTimeLabel: exam ? stripSeconds(exam.startTime) : null,
    };
  });
}

export function buildWeekOptions(semesterWeeks: SemesterWeekRecord[])
{
  return [
    { id: "all", title: "All Weeks", subtitle: "Overview" },
    ...semesterWeeks.map((week) => ({
      id: String(week.weekId),
      title: buildWeekLabel(week),
      subtitle: formatDateRange(week.startDate, week.endDate),
    })),
  ];
}

export function getLatestEndMinutes(blocks: TimetableBlock[])
{
  const latest = blocks.reduce((max, block) => Math.max(max, block.endMinutes), DEFAULT_END_MINUTES);
  return getVisibleEndMinutes(latest);
}

export function normalizeRichTextList(value: unknown)
{
  if (Array.isArray(value))
  {
    return value.flatMap((item) => {
      if (typeof item === "string")
      {
        return item.trim() ? [item.trim()] : [];
      }

      if (item && typeof item === "object")
      {
        return Object.values(item)
          .flatMap((nested) => typeof nested === "string" && nested.trim() ? [nested.trim()] : []);
      }

      return [];
    });
  }

  if (typeof value === "string")
  {
    return value.trim() ? [value.trim()] : [];
  }

  return [];
}
