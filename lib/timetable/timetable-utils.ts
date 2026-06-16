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

export const COURSE_COLOR_PALETTE = [
  "#F0BCC2",
  "#F2CCA0",
  "#E8D7B1",
  "#C9DFB2",
  "#C3DCEA",
  "#D8C1E7",
  "#E0C7AA",
  "#C9DDCB",
];

const LEGACY_COURSE_COLOR_PALETTE = [
  "#F4D6D8",
  "#F7E0C3",
  "#F0E7D8",
  "#D9E7C8",
  "#D7E6F0",
  "#E1D7EC",
  "#E0D8C8",
  "#D7E1D4",
];

const LEGACY_TO_CURRENT_COURSE_COLOR = new Map(
  LEGACY_COURSE_COLOR_PALETTE.map((legacyColor, index) => [legacyColor.toLowerCase(), COURSE_COLOR_PALETTE[index]] as const),
);

export function migrateCourseColor(color: string)
{
  return LEGACY_TO_CURRENT_COURSE_COLOR.get(color.toLowerCase()) ?? color;
}

export function migrateCourseColorMap(colors: Record<string, string>)
{
  return Object.fromEntries(
    Object.entries(colors).map(([courseCode, color]) => [courseCode, migrateCourseColor(color)] as const),
  );
}

export function getCourseColor(courseCode: string)
{
  let hash = 0;
  for (const character of courseCode)
  {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }
  return COURSE_COLOR_PALETTE[Math.abs(hash) % COURSE_COLOR_PALETTE.length];
}

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
      colorMap.set(selection.courseCode, COURSE_COLOR_PALETTE[colorIndex % COURSE_COLOR_PALETTE.length]);
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
    return events
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
    ].join("|");

    const existing = grouped.get(groupKey);
    if (existing)
    {
      existing.occurrenceCount += 1;
      existing.eventIds.push(event.eventId);
      const existingMode = existing.eventMode?.trim() ?? "";
      const nextMode = event.eventMode?.trim() ?? "";
      if (existingMode && nextMode && existingMode !== nextMode)
      {
        existing.eventMode = "Mixed";
      }
      else if (!existingMode && nextMode)
      {
        existing.eventMode = nextMode;
      }
      else if (existingMode && !nextMode)
      {
        existing.eventMode = "Mixed";
      }
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
      eventMode: event.eventMode?.trim() || null,
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
      color: colorMap.get(selection.courseCode) ?? getCourseColor(selection.courseCode),
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
