"use client";

import { type CSSProperties } from "react";

import { formatClassGroupLabel, formatTimeRange } from "@/lib/timetable/date-utils";
import { buildExamCards, getCourseColor } from "@/lib/timetable/timetable-utils";

function getDarkToneFromHex(hexColor: string)
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
  const hueContrast = contrastRatio(huePreservingDark, background);
  const neutralContrast = contrastRatio(deepNeutral, background);
  const selected = neutralContrast > hueContrast ? deepNeutral : huePreservingDark;

  if (contrastRatio(selected, background) < 4.5)
  {
    return "#0b0f17";
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
  const rangeFormatter = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" });

  if (cards.length === 0)
  {
    return (
      <div className="rounded-[0.5rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-6 text-center text-[14px] leading-5 text-[var(--on-surface-variant)]">
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
    <div className="space-y-3">
      {windows.map((window) => (
        <section key={`${toDateKey(window.start)}-${toDateKey(window.end)}`} className="elev-1 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <h4 className="text-[clamp(11px,2.4vw,15px)] font-semibold leading-[1.35] text-[var(--on-surface)]">Exam Calendar</h4>
            <span className="text-[clamp(11px,2.2vw,15px)] font-medium leading-[1.35] text-[var(--on-surface-variant)]">
              {rangeFormatter.format(window.start)} - {rangeFormatter.format(window.end)}
            </span>
          </div>

          <div className="pb-0.5">
            <div className="w-full">
              <div className="grid grid-cols-6 gap-0.5">
                {dayLabels.map((label) => (
                  <div key={label} className="rounded-[0.35rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-1 py-0.5 text-center text-[clamp(10px,2.1vw,15px)] font-semibold uppercase tracking-tight text-[var(--on-surface-variant)]">
                    {label}
                  </div>
                ))}
              </div>

              <div className="mt-0.5 grid grid-cols-6 gap-0.5">
                {window.days.filter((date) => date.getDay() !== 0).map((date) => {
                  const dateKey = toDateKey(date);
                  const dateCards = cardsByDate.get(dateKey) ?? [];
                  const hasExams = dateCards.length > 0;

                  return (
                    <div
                      key={dateKey}
                      className={`min-h-[7rem] rounded-[0.45rem] border p-0.5 ${
                        hasExams
                          ? "border-[var(--primary)]/25 bg-[var(--surface-container-low)]"
                          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
                      }`}
                    >
                      <div className="text-[clamp(10px,2vw,15px)] font-semibold leading-[1.3] text-[var(--on-surface-variant)]">
                        {dayFormatter.format(date)}
                      </div>

                      <div className="mt-0.5 space-y-0.5">
                        {dateCards.map((card) => {
                          const examColor = colorByShareKey.get(card.shareKey) ?? getCourseColor(card.courseCode);
                          const examStyle: CSSProperties = {
                            ["--block-bg" as string]: examColor,
                            ["--block-border" as string]: examColor,
                            ["--block-text" as string]: getDarkToneFromHex(examColor),
                          };
                          return (
                            <article
                              key={card.id}
                              className="timetable-cell"
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
      ))}
    </div>
  );
}
