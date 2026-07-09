"use client";

import { type CSSProperties } from "react";

import { formatClassGroupLabel, formatTimeRange } from "@/lib/timetable/date-utils";
import { buildExamCards, getCourseColor } from "@/lib/timetable/timetable-utils";

function getContrastingTextColorFromHex(hexColor: string)
{
  const normalized = hexColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized))
  {
    return "#111827";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  const huePreservingDark: [number, number, number] = [
    Math.round(red * 0.18),
    Math.round(green * 0.18),
    Math.round(blue * 0.18),
  ];
  const deepNeutral: [number, number, number] = [17, 24, 39];
  const white: [number, number, number] = [255, 255, 255];

  const toLinear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: [number, number, number]) => (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
  const contrastRatio = (foreground: [number, number, number], background: [number, number, number]) => {
    const foregroundLum = luminance(foreground);
    const backgroundLum = luminance(background);
    const lighter = Math.max(foregroundLum, backgroundLum);
    const darker = Math.min(foregroundLum, backgroundLum);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const background: [number, number, number] = [red, green, blue];
  const candidates = [huePreservingDark, deepNeutral, white];
  const selected = candidates.reduce((best, candidate) => (
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best
  ), deepNeutral);

  if (contrastRatio(selected, background) < 4.5)
  {
    return contrastRatio(white, background) > contrastRatio(deepNeutral, background)
      ? "#ffffff"
      : "#0b0f17";
  }

  return `rgb(${selected[0]} ${selected[1]} ${selected[2]})`;
}

export function ExamCalendar({
  cards,
  colorByShareKey,
}: {
  cards: ReturnType<typeof buildExamCards>;
  colorByShareKey: Map<string, string>;
})
{
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const parseDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const addDays = (value: Date, amount: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + amount);
    return next;
  };

  const toDateKey = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startOfWeekMonday = (value: Date) => {
    const start = new Date(value);
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const dayFormatter = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });

  if (cards.length === 0)
  {
    return (
      <div className="rounded-none border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-6 text-center text-[14px] leading-5 text-[var(--on-surface-variant)]">
        No exam events for selected courses.
      </div>
    );
  }

  const cardsByDate = new Map<string, ReturnType<typeof buildExamCards>>();
  for (const card of cards)
  {
    const existing = cardsByDate.get(card.eventDate) ?? [];
    existing.push(card);
    cardsByDate.set(card.eventDate, existing);
  }

  const windows: Array<{
    start: Date;
    end: Date;
    days: Date[];
  }> = [];

  let cursor = 0;
  while (cursor < cards.length)
  {
    const start = startOfWeekMonday(parseDate(cards[cursor].eventDate));
    const end = addDays(start, 13);
    windows.push({
      start,
      end,
      days: Array.from({ length: 14 }, (_, index) => addDays(start, index)),
    });

    const endKey = toDateKey(end);
    while (cursor < cards.length && cards[cursor].eventDate <= endKey)
    {
      cursor += 1;
    }
  }

  return (
    <div className="exam-calendar space-y-3">
      {windows.map((window) => {
        const showSaturday = window.days.some((date) => {
          if (date.getDay() !== 6)
          {
            return false;
          }

          const dateKey = toDateKey(date);
          return (cardsByDate.get(dateKey)?.length ?? 0) > 0;
        });
        const visibleDayLabels = showSaturday ? dayLabels : dayLabels.slice(0, 5);
        const visibleDays = window.days.filter((date) => date.getDay() !== 0 && (showSaturday || date.getDay() !== 6));

        return (
          <section key={`${toDateKey(window.start)}-${toDateKey(window.end)}`} className="exam-calendar__window elev-1 rounded-none border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
            <div className="pb-0.5">
              <div className="w-full">
                <div
                  className="exam-calendar__day-label-grid grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${visibleDayLabels.length}, minmax(0, 1fr))` }}
                >
                  {visibleDayLabels.map((label) => (
                    <div key={label} className="exam-calendar__day-label rounded-none border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-1 py-0.5 text-center font-semibold uppercase tracking-tight text-[var(--on-surface-variant)]">
                      {label}
                    </div>
                  ))}
                </div>

                <div
                  className="exam-calendar__day-grid mt-0.5 grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${visibleDayLabels.length}, minmax(0, 1fr))` }}
                >
                  {visibleDays.map((date) => {
                    const dateKey = toDateKey(date);
                    const dateCards = cardsByDate.get(dateKey) ?? [];
                    const hasExams = dateCards.length > 0;

                    return (
                      <div
                        key={dateKey}
                        className={`exam-calendar__day min-h-[7rem] rounded-none border p-0.5 ${
                          hasExams
                            ? "border-[var(--primary)]/25"
                            : "border-[var(--outline-variant)]"
                        }`}
                      >
                        <div className="exam-calendar__day-date font-semibold leading-[1.3] text-[var(--on-surface-variant)]">
                          {dayFormatter.format(date)}
                        </div>

                        <div className="mt-0.5 space-y-0.5">
                          {dateCards.map((card) => {
                            const examColor = colorByShareKey.get(card.shareKey) ?? getCourseColor(card.courseCode);
                            const examStyle: CSSProperties = {
                              ["--block-bg" as string]: examColor,
                              ["--block-border" as string]: examColor,
                              ["--block-text" as string]: getContrastingTextColorFromHex(examColor),
                            };
                            return (
                              <article
                                key={card.id}
                                className="exam-calendar__card timetable-cell"
                                style={examStyle}
                              >
                                <div className="timetable-cell__content">
                                  <div className="timetable-cell__module">{card.courseCode}</div>
                                  <div className="timetable-cell__meta">{formatClassGroupLabel(card.groupCode)}</div>
                                  <div className="timetable-cell__time">{formatTimeRange(card.startTime, card.endTime)}</div>
                                  {card.examMode ? (
                                    <div className="timetable-cell__mode">{card.examMode}</div>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ExamCalendarOverviewRail({
  subtitle,
}: {
  subtitle: string;
})
{
  return (
    <div className="border-t border-[var(--outline-variant)]/25 bg-[var(--rail-week-bg)] px-2.5 py-1.5 text-center sm:px-3 sm:py-2">
      <div className="flex min-w-0 flex-col items-center justify-center gap-0">
        <div className="text-[13px] font-bold leading-4 text-[var(--primary)] sm:text-[14px]">
          Exam Calendar
        </div>
        <div className="whitespace-nowrap text-[11px] leading-3 text-[var(--on-surface-variant)] sm:text-[12px] sm:leading-[14px]">
          {subtitle}
        </div>
      </div>
    </div>
  );
}
