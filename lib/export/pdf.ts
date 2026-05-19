import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  formatEventDate,
  formatTimeRange,
} from "@/lib/timetable/date-utils";
import type { SemesterRecord, TimetableClash, TimetableEventRecord } from "@/lib/timetable/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BODY_FONT_SIZE = 10;
const LINE_HEIGHT = 14;

function wrapText(text: string, maxLength: number)
{
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words)
  {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current)
    {
      lines.push(current);
      current = word;
      continue;
    }
    current = next;
  }

  if (current)
  {
    lines.push(current);
  }

  return lines;
}

export async function buildTimetablePdf(
  semester: SemesterRecord | null,
  events: TimetableEventRecord[],
  clashes: TimetableClash[],
)
{
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

  let currentPage = page;
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(requiredHeight: number)
  {
    if (y - requiredHeight >= MARGIN)
    {
      return;
    }

    currentPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function drawLine(text: string, options?: { bold?: boolean; color?: ReturnType<typeof rgb> })
  {
    ensureSpace(LINE_HEIGHT);
    currentPage.drawText(text, {
      x: MARGIN,
      y,
      font: options?.bold ? headingFont : bodyFont,
      size: BODY_FONT_SIZE,
      color: options?.color ?? rgb(0.1, 0.11, 0.13),
    });
    y -= LINE_HEIGHT;
  }

  currentPage.drawText("SUSS Planner Timetable", {
    x: MARGIN,
    y,
    font: headingFont,
    size: 18,
    color: rgb(0, 0.19, 0.36),
  });
  y -= 24;

  drawLine(semester ? `${semester.academicYear} · ${semester.semesterName}` : "Semester unavailable", { bold: true });
  drawLine(`Generated on ${new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`);
  y -= 6;

  if (clashes.length > 0)
  {
    drawLine("Detected clashes", { bold: true, color: rgb(0.73, 0.1, 0.1) });
    for (const clash of clashes)
    {
      drawLine(`${formatEventDate(clash.eventDate)} · ${formatTimeRange(clash.startTime, clash.endTime)}`);
      for (const event of clash.events)
      {
        drawLine(`  ${event.courseCode} ${event.groupCodeType} ${event.groupCode} · ${event.courseName ?? "Untitled course"}`);
      }
      y -= 4;
    }
  }

  drawLine("Events", { bold: true });

  for (const event of events.sort((left, right) => `${left.eventDate}${left.startTime}${left.courseCode}`.localeCompare(`${right.eventDate}${right.startTime}${right.courseCode}`)))
  {
    const header = `${formatEventDate(event.eventDate)} · ${formatTimeRange(event.startTime, event.endTime)} · ${event.courseCode} ${event.groupCodeType} ${event.groupCode}`;
    const detail = [
      event.courseName ?? "Untitled course",
      event.eventKind,
      event.eventMode ? `Mode: ${event.eventMode}` : null,
      event.venue ? `Venue: ${event.venue}` : null,
      event.weekLabel ? `Week: ${event.weekLabel}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    for (const line of wrapText(header, 90))
    {
      drawLine(line, { bold: true });
    }

    for (const line of wrapText(detail, 95))
    {
      drawLine(line);
    }

    y -= 4;
  }

  return pdf.save();
}
