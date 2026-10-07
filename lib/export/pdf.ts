import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { DAY_LABELS, START_MINUTES, formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import { buildExamCards, buildTimetableBlocks, getCourseColor } from "@/lib/timetable/timetable-utils";
import { formatCampusCodes, formatCampusNames, formatCampusSummary, getClassCampusCodes, getEventCampusCodes } from "@/lib/timetable/campus";
import { getExportExamLabel, getExportTimeRange, type ExportCourse } from "@/lib/export/timetable-model";
import type { SemesterRecord, TimetableBlock, TimetableClash, TimetableEventRecord } from "@/lib/timetable/types";

const LANDSCAPE_A4: [number, number] = [841.89, 595.28];
const PORTRAIT_A4: [number, number] = [595.28, 841.89];
const MARGIN = 30;
// Match the light timetable export surface and its alternating hour stripes.
const INK = rgb(0x13 / 255, 0x1a / 255, 0x26 / 255);
const MUTED = rgb(0x4a / 255, 0x52 / 255, 0x61 / 255);
const GRID = rgb(0xc2 / 255, 0xbd / 255, 0xb0 / 255);
const SURFACE = rgb(0xfc / 255, 0xfb / 255, 0xf8 / 255);
const STRIPE = rgb(0xf4 / 255, 0xf3 / 255, 0xf1 / 255);
const SUBTLE = STRIPE;

type PdfOptions = {
  classSessionEvents?: TimetableEventRecord[];
  selectedWeekId?: number | "all";
  weekLabel?: string;
  colorByShareKey?: Map<string, string>;
  courses?: ExportCourse[];
  orientation?: "horizontal" | "vertical";
  viewMode?: "class" | "exam";
  dayDateByDay?: Record<number, string>;
};

// Standard PDF fonts support WinAnsi. Replace unsupported characters instead of failing the export.
function pdfText(value: string)
{
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function fitText(value: string, font: PDFFont, size: number, width: number)
{
  const safe = pdfText(value);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let end = safe.length;
  while (end > 0 && font.widthOfTextAtSize(`${safe.slice(0, end)}...`, size) > width) end -= 1;
  return end > 0 ? `${safe.slice(0, end).trimEnd()}...` : "";
}

function wrapText(value: string, font: PDFFont, size: number, width: number)
{
  const result: string[] = [];
  let line = "";
  for (const word of pdfText(value).split(/\s+/))
  {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width)
    {
      result.push(line);
      line = word;
    }
    else line = candidate;
  }
  if (line) result.push(line);
  return result.flatMap((item) => font.widthOfTextAtSize(item, size) > width
    ? [fitText(item, font, size, width)] : [item]);
}

function minuteLabel(minute: number)
{
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function colorFromHex(value: string)
{
  const match = value.match(/^#([\da-f]{6})$/i);
  if (!match) return rgb(0.78, 0.86, 0.95);
  return rgb(
    Number.parseInt(match[1].slice(0, 2), 16) / 255,
    Number.parseInt(match[1].slice(2, 4), 16) / 255,
    Number.parseInt(match[1].slice(4, 6), 16) / 255,
  );
}

function readableColor(hex: string)
{
  const match = hex.match(/^#([\da-f]{6})$/i);
  if (!match) return INK;
  const channels = [0, 2, 4].map((index) => Number.parseInt(match[1].slice(index, index + 2), 16) / 255);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance < 0.43 ? rgb(1, 1, 1) : INK;
}

function buildFallbackCourses(events: TimetableEventRecord[], colors?: Map<string, string>): ExportCourse[]
{
  const seen = new Set<string>();
  return events.flatMap((event) => {
    if (seen.has(event.shareKey)) return [];
    seen.add(event.shareKey);
    const exam = events.find((candidate) => candidate.shareKey === event.shareKey && candidate.eventKind === "EXAM");
    return [{
      shareKey: event.shareKey,
      courseCode: event.courseCode,
      courseLabel: event.courseLabel,
      courseName: event.courseName,
      groupCode: event.groupCode,
      campuses: getClassCampusCodes(events.filter(candidate => candidate.shareKey === event.shareKey)),
      examDateLabel: exam ? formatEventDate(exam.eventDate) : "No Exam",
      examTimeLabel: exam ? exam.startTime.slice(0, 5) : null,
      examStatus: exam ? "dated" as const : "none" as const,
      examGuidance: null,
      creditUnits: null,
      color: colors?.get(event.shareKey) ?? getCourseColor(event.courseCode),
      hidden: false,
    }];
  });
}

function compareBlocksForPdfLane(left: TimetableBlock, right: TimetableBlock)
{
  if (left.startMinutes !== right.startMinutes) return left.startMinutes - right.startMinutes;
  if (left.groupCodeType !== right.groupCodeType) return left.groupCodeType.localeCompare(right.groupCodeType);
  if (left.groupCode !== right.groupCode) return left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true, sensitivity: "base" });
  const earliestWeek = (label: string) => {
    const text = label.trim().replace(/^weeks?\b/i, "").replace(/\+/g, ",").trim();
    if (!text || !/^[\d,\s-]+$/.test(text)) return null;
    const numbers = text.match(/\d+/g)?.map(Number) ?? [];
    return numbers.length ? Math.min(...numbers) : null;
  };
  const leftWeek = earliestWeek(left.weekLabel);
  const rightWeek = earliestWeek(right.weekLabel);
  if (leftWeek !== rightWeek) return leftWeek === null ? 1 : rightWeek === null ? -1 : leftWeek - rightWeek;
  if (left.endMinutes !== right.endMinutes) return left.endMinutes - right.endMinutes;
  if (left.courseCode !== right.courseCode) return left.courseCode.localeCompare(right.courseCode);
  if (left.shareKey !== right.shareKey) return left.shareKey.localeCompare(right.shareKey);
  return left.id.localeCompare(right.id);
}

export function buildPdfLanes(blocks: TimetableBlock[])
{
  const lanes = new Map<string, { index: number; count: number }>();
  for (let day = 1; day <= 6; day += 1)
  {
    const dayBlocks = blocks.filter((block) => block.dayOfWeek === day)
      .sort(compareBlocksForPdfLane);
    let cluster: TimetableBlock[] = [];
    let clusterEnd = -1;
    const commitCluster = () => {
      const laneEnds: number[] = [];
      const assigned = new Map<string, number>();
      for (const block of cluster)
      {
        let index = laneEnds.findIndex((end) => end <= block.startMinutes);
        if (index < 0) index = laneEnds.length;
        laneEnds[index] = block.endMinutes;
        assigned.set(block.id, index);
      }
      for (const block of cluster) lanes.set(block.id, { index: assigned.get(block.id) ?? 0, count: laneEnds.length });
    };
    for (const block of dayBlocks)
    {
      if (cluster.length && block.startMinutes >= clusterEnd)
      {
        commitCluster();
        cluster = [];
      }
      cluster.push(block);
      clusterEnd = Math.max(clusterEnd, block.endMinutes);
    }
    if (cluster.length) commitCluster();
  }
  return lanes;
}

function drawRoundedCard(page: PDFPage, x: number, top: number, width: number, height: number, color: ReturnType<typeof rgb>, radius: number)
{
  const r = Math.min(radius, width / 2, height / 2);
  const path = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, color, borderColor: GRID, borderWidth: 0.7 });
}

function drawCourseIcon(page: PDFPage, kind: "group" | "campus" | "exam" | "credit", x: number, y: number)
{
  const color = MUTED;
  const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({
    start: { x: x + x1, y: y + y1 }, end: { x: x + x2, y: y + y2 }, color, thickness: 0.8,
  });
  if (kind === "group")
  {
    for (const offset of [2, 5, 8])
    {
      page.drawCircle({ x: x + 1.5, y: y + offset, size: 0.55, color });
      line(4, offset, 10, offset);
    }
  }
  else if (kind === "campus")
  {
    page.drawCircle({ x: x + 5.5, y: y + 6.5, size: 3, borderColor: color, borderWidth: 0.8 });
    page.drawCircle({ x: x + 5.5, y: y + 6.5, size: 0.8, borderColor: color, borderWidth: 0.8 });
    line(3, 4.5, 5.5, 0.5);
    line(5.5, 0.5, 8, 4.5);
  }
  else if (kind === "exam")
  {
    page.drawRectangle({ x: x + 1, y: y + 1, width: 9, height: 8, borderColor: color, borderWidth: 0.8 });
    line(1, 6.5, 10, 6.5);
    line(3, 10, 3, 8);
    line(8, 10, 8, 8);
  }
  else
  {
    line(0.5, 7, 5.5, 9.5);
    line(5.5, 9.5, 10.5, 7);
    line(10.5, 7, 5.5, 4.5);
    line(5.5, 4.5, 0.5, 7);
    line(2.5, 5.4, 2.5, 2.3);
    line(2.5, 2.3, 5.5, 0.8);
    line(5.5, 0.8, 8.5, 2.3);
    line(8.5, 2.3, 8.5, 5.4);
    line(10.5, 7, 10.5, 3);
  }
}

function drawBlock(
  page: PDFPage,
  block: TimetableBlock,
  x: number,
  y: number,
  width: number,
  height: number,
  bold: PDFFont,
  regular: PDFFont,
  color: string,
  horizontal: boolean,
  showAllWeeks: boolean,
)
{
  if (width <= 2 || height <= 2) return;
  page.drawRectangle({ x: x + 0.5, y: y - 1, width, height, color: rgb(0.73, 0.71, 0.67) });
  page.drawRectangle({ x, y, width, height, color: colorFromHex(color) });
  page.drawRectangle({ x, y, width, height: 1.7, color: rgb(0.64, 0.62, 0.58), opacity: 0.45 });
  const textColor = readableColor(color);
  const textWidth = Math.max(0, width - 8);
  const top = y + height;
  if (height >= 11)
  {
    const title = horizontal && block.courseName ? `${block.courseLabel ?? block.courseCode} ${block.courseName}` : (block.courseLabel ?? block.courseCode);
    page.drawText(fitText(title, bold, 9, textWidth), { x: x + 4, y: top - 11, font: bold, size: 9, color: textColor });
  }
  if (height >= 21) page.drawText(fitText(block.groupCode, regular, 8, textWidth), { x: x + 4, y: top - 21, font: regular, size: 8, color: textColor });
  if (height >= 31)
  {
    page.drawText(fitText(`${minuteLabel(block.startMinutes).replace(":", "")}-${minuteLabel(block.endMinutes).replace(":", "")}`, regular, 7.8, textWidth), {
      x: x + 4, y: top - 31, font: regular, size: 7.8, color: textColor,
    });
  }
  if (showAllWeeks && height >= 43 && block.weekLabel) page.drawText(fitText(/^weeks?\b/i.test(block.weekLabel) ? block.weekLabel : `Weeks ${block.weekLabel}`, regular, 7.5, textWidth), { x: x + 4, y: top - 41, font: regular, size: 7.5, color: textColor });
  const campuses = getEventCampusCodes(block);
  if (height >= 53 && campuses.length) page.drawText(fitText(formatCampusCodes(campuses), regular, 7.5, textWidth), { x: x + 4, y: top - 51, font: regular, size: 7.5, color: textColor });
}

function drawClassGrid(
  page: PDFPage,
  blocks: TimetableBlock[],
  x: number,
  top: number,
  width: number,
  height: number,
  horizontal: boolean,
  bold: PDFFont,
  regular: PDFFont,
  options: PdfOptions,
)
{
  const days = blocks.some((block) => block.dayOfWeek === 6) ? 6 : 5;
  const { startMinutes, endMinutes } = getExportTimeRange(blocks);
  const lanes = buildPdfLanes(blocks);
  page.drawRectangle({ x, y: top - height, width, height, color: SURFACE, borderColor: GRID, borderWidth: 0.7 });

  if (!horizontal)
  {
    const axisWidth = 37;
    const headerHeight = 23;
    const gridLeft = x + axisWidth;
    const gridTop = top - headerHeight;
    const gridBottom = top - height;
    const dayWidth = (width - axisWidth) / days;
    const minuteToY = (minute: number) => gridTop - ((minute - startMinutes) / (endMinutes - startMinutes)) * (gridTop - gridBottom);
    page.drawRectangle({ x: gridLeft, y: gridTop, width: width - axisWidth, height: headerHeight, color: SURFACE });
    for (let day = 1; day <= days; day += 1)
    {
      const dayX = gridLeft + (day - 1) * dayWidth;
      const label = options.selectedWeekId !== "all" && options.dayDateByDay?.[day]
        ? `${DAY_LABELS[day - 1]} ${options.dayDateByDay[day]}` : DAY_LABELS[day - 1];
      page.drawText(fitText(label.toUpperCase(), bold, 9.5, dayWidth - 8), { x: dayX + 5, y: gridTop + 7, font: bold, size: 9.5, color: INK });
    }
    for (let minute = startMinutes; minute < endMinutes;)
    {
      const segmentEnd = Math.min(endMinutes, (Math.floor(minute / 60) + 1) * 60);
      if (Math.floor(minute / 60) % 2 === 1)
      {
        page.drawRectangle({ x: gridLeft, y: minuteToY(segmentEnd), width: width - axisWidth, height: minuteToY(minute) - minuteToY(segmentEnd), color: STRIPE });
      }
      minute = segmentEnd;
    }
    for (let minute = startMinutes; minute <= endMinutes; minute += 30)
    {
      const y = minuteToY(minute);
      page.drawLine({ start: { x: gridLeft, y }, end: { x: x + width, y }, color: GRID, thickness: minute % 60 === 0 ? 0.6 : 0.3 });
      if (minute % 60 === 0)
      {
        page.drawText(minuteLabel(minute).replace(":", ""), { x: x + 2, y: Math.max(gridBottom + 1, y - 3), font: bold, size: 9.5, color: MUTED });
      }
    }
    for (let day = 1; day < days; day += 1)
    {
      const dayX = gridLeft + day * dayWidth;
      page.drawLine({ start: { x: dayX, y: gridBottom }, end: { x: dayX, y: top }, color: GRID, thickness: 0.6 });
    }
    for (const block of blocks)
    {
      if (block.dayOfWeek < 1 || block.dayOfWeek > days) continue;
      const lane = lanes.get(block.id) ?? { index: 0, count: 1 };
      const laneWidth = (dayWidth - 3) / lane.count;
      drawBlock(page, block,
        gridLeft + (block.dayOfWeek - 1) * dayWidth + 1.5 + lane.index * laneWidth,
        Math.max(gridBottom + 1, minuteToY(block.endMinutes) + 1),
        laneWidth - 1,
        Math.max(1, minuteToY(block.startMinutes) - minuteToY(block.endMinutes) - 2),
        bold, regular, options.colorByShareKey?.get(block.shareKey) ?? getCourseColor(block.courseCode), false, (options.selectedWeekId ?? "all") === "all");
    }
  }
  else
  {
    const axisWidth = 45;
    const headerHeight = 17;
    const gridLeft = x + axisWidth;
    const gridRight = x + width;
    const gridTop = top - headerHeight;
    const dayLaneCounts = Array.from({ length: days }, (_, index) => Math.max(1, ...blocks
      .filter((block) => block.dayOfWeek === index + 1)
      .map((block) => lanes.get(block.id)?.count ?? 1)));
    const dayHeights = dayLaneCounts.map((count) => count > 1 ? 1.4 + count * 56.8 + (count - 1) * 0.7 : 59);
    const minuteToX = (minute: number) => gridLeft + ((minute - startMinutes) / (endMinutes - startMinutes)) * (gridRight - gridLeft);
    page.drawRectangle({ x: gridLeft, y: gridTop, width: width - axisWidth, height: headerHeight, color: SURFACE });
    for (let minute = startMinutes; minute < endMinutes;)
    {
      const segmentEnd = Math.min(endMinutes, (Math.floor(minute / 60) + 1) * 60);
      if (Math.floor(minute / 60) % 2 === 1)
      {
        page.drawRectangle({ x: minuteToX(minute), y: top - height, width: minuteToX(segmentEnd) - minuteToX(minute), height: height - headerHeight, color: STRIPE });
      }
      minute = segmentEnd;
    }
    for (let minute = startMinutes; minute <= endMinutes; minute += 30)
    {
      const timeX = minuteToX(minute);
      page.drawLine({ start: { x: timeX, y: top - height }, end: { x: timeX, y: gridTop }, color: GRID, thickness: minute % 60 === 0 ? 0.6 : 0.3 });
      const adjacentToLastLabel = endMinutes % 60 !== 0 && minute === endMinutes - 30;
      if (!adjacentToLastLabel && minute % 60 === 0)
      {
        page.drawText(minuteLabel(minute).replace(":", ""), { x: Math.min(timeX + 2, gridRight - 21), y: gridTop + 5, font: bold, size: 9.5, color: MUTED });
      }
    }
    let rowTop = gridTop;
    for (let day = 1; day <= days; day += 1)
    {
      const dayHeight = dayHeights[day - 1];
      const rowBottom = rowTop - dayHeight;
      if (day > 1) page.drawLine({ start: { x, y: rowTop }, end: { x: gridRight, y: rowTop }, color: GRID, thickness: 0.6 });
      const label = options.selectedWeekId !== "all" && options.dayDateByDay?.[day]
        ? `${DAY_LABELS[day - 1]} ${options.dayDateByDay[day]}` : DAY_LABELS[day - 1];
      page.drawText(fitText(label.toUpperCase(), bold, 8, axisWidth - 5), { x: x + 4, y: rowBottom + dayHeight / 2, font: bold, size: 8, color: INK });
      for (const block of blocks.filter((item) => item.dayOfWeek === day))
      {
        const lane = lanes.get(block.id) ?? { index: 0, count: 1 };
        const laneHeight = (dayHeight - 2 - Math.max(0, dayLaneCounts[day - 1] - 1) * 0.7) / dayLaneCounts[day - 1];
        const blockHeight = lane.count === 1 ? dayHeight - 2 : laneHeight - 0.7;
        drawBlock(page, block,
          minuteToX(block.startMinutes) + 1,
          lane.count === 1 ? rowBottom + 1 : rowTop - 1 - (lane.index + 1) * laneHeight - lane.index * 0.7,
          Math.max(2, minuteToX(block.endMinutes) - minuteToX(block.startMinutes) - 2),
          blockHeight,
          bold, regular, options.colorByShareKey?.get(block.shareKey) ?? getCourseColor(block.courseCode), true, (options.selectedWeekId ?? "all") === "all");
      }
      rowTop = rowBottom;
    }
  }
  if (blocks.length === 0)
  {
    page.drawText("No classes in this view", { x: x + 52, y: top - 45, font: regular, size: 10, color: MUTED });
  }
}

type ExamWindow = { start: Date; cards: ReturnType<typeof buildExamCards>; showSaturday: boolean; dayHeight: number };

function buildExamWindows(events: TimetableEventRecord[]): ExamWindow[]
{
  const cards = buildExamCards(events);
  const windows: ExamWindow[] = [];
  let index = 0;
  while (index < cards.length)
  {
    const date = new Date(`${cards[index].eventDate}T00:00:00Z`);
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + 13);
    const endKey = end.toISOString().slice(0, 10);
    const windowCards: typeof cards = [];
    while (index < cards.length && cards[index].eventDate <= endKey)
    {
      windowCards.push(cards[index]);
      index += 1;
    }
    const maxPerDay = Math.max(1, ...Array.from(new Set(windowCards.map((card) => card.eventDate)), (key) => windowCards.filter((card) => card.eventDate === key).length));
    windows.push({
      start: date,
      cards: windowCards,
      showSaturday: windowCards.some((card) => new Date(`${card.eventDate}T00:00:00Z`).getUTCDay() === 6),
      dayHeight: Math.max(78, 17 + maxPerDay * 31),
    });
  }
  return windows;
}

function undatedExamSectionHeight(count: number)
{
  return 40 + Math.ceil(count / 2) * 55 + Math.max(0, Math.ceil(count / 2) - 1) * 5;
}

function drawExamGrid(page: PDFPage, windows: ExamWindow[], undatedCourses: ExportCourse[], x: number, top: number, width: number, bold: PDFFont, regular: PDFFont, options: PdfOptions)
{
  if (windows.length === 0 && undatedCourses.length === 0)
  {
    page.drawRectangle({ x, y: top - 80, width, height: 80, borderColor: GRID, borderWidth: 0.7, color: SUBTLE });
    page.drawText("No exam events for selected courses.", { x: x + 10, y: top - 35, font: regular, size: 10, color: MUTED });
    return;
  }
  let windowTop = top;
  for (const window of windows)
  {
    const days = window.showSaturday ? 6 : 5;
    const colWidth = width / days;
    const headerHeight = 18;
    const totalHeight = headerHeight + window.dayHeight * 2;
    page.drawRectangle({ x, y: windowTop - totalHeight, width, height: totalHeight, color: rgb(1, 1, 1), borderColor: GRID, borderWidth: 0.7 });
    page.drawRectangle({ x, y: windowTop - headerHeight, width, height: headerHeight, color: SUBTLE });
    for (let col = 0; col < days; col += 1)
    {
      const colX = x + col * colWidth;
      if (col > 0) page.drawLine({ start: { x: colX, y: windowTop - totalHeight }, end: { x: colX, y: windowTop }, color: GRID, thickness: 0.6 });
      page.drawText(DAY_LABELS[col].toUpperCase(), { x: colX + 5, y: windowTop - 12, font: bold, size: 8, color: INK });
    }
    for (let row = 0; row < 2; row += 1)
    {
      const rowTop = windowTop - headerHeight - row * window.dayHeight;
      if (row > 0) page.drawLine({ start: { x, y: rowTop }, end: { x: x + width, y: rowTop }, color: GRID, thickness: 0.6 });
      for (let col = 0; col < days; col += 1)
      {
        const date = new Date(window.start);
        date.setUTCDate(date.getUTCDate() + row * 7 + col);
        const key = date.toISOString().slice(0, 10);
        const dayCards = window.cards.filter((card) => card.eventDate === key);
        const colX = x + col * colWidth;
        page.drawText(`${date.getUTCDate()} ${date.toLocaleString("en-SG", { month: "short", timeZone: "UTC" })}`, {
          x: colX + 4, y: rowTop - 12, font: bold, size: 7.5, color: MUTED,
        });
        dayCards.forEach((card, cardIndex) => {
          const bottom = rowTop - 16 - (cardIndex + 1) * 30;
          const color = options.colorByShareKey?.get(card.shareKey) ?? getCourseColor(card.courseCode);
          page.drawRectangle({ x: colX + 3, y: bottom, width: colWidth - 6, height: 29, color: colorFromHex(color), borderColor: GRID, borderWidth: 0.4 });
          const textColor = readableColor(color);
          page.drawText(fitText(card.courseLabel ?? card.courseCode, bold, 7.5, colWidth - 12), { x: colX + 6, y: bottom + 19, font: bold, size: 7.5, color: textColor });
          page.drawText(fitText(`${card.groupCode}  ${formatTimeRange(card.startTime, card.endTime)}`, regular, 6.5, colWidth - 12), {
            x: colX + 6, y: bottom + 8, font: regular, size: 6.5, color: textColor,
          });
        });
      }
    }
    windowTop -= totalHeight + 8;
  }
  if (undatedCourses.length > 0)
  {
    const sectionTop = windows.length > 0 ? windowTop - 4 : top;
    const sectionHeight = undatedExamSectionHeight(undatedCourses.length);
    page.drawRectangle({ x, y: sectionTop - sectionHeight, width, height: sectionHeight, color: rgb(1, 1, 1), borderColor: GRID, borderWidth: 0.7 });
    page.drawText("Exams without timetable dates", { x: x + 8, y: sectionTop - 14, font: bold, size: 10, color: INK });
    page.drawText(fitText("Check with course instructor", regular, 7.5, width - 16), {
      x: x + 8, y: sectionTop - 27, font: regular, size: 7.5, color: MUTED,
    });
    const columns = 2;
    const gap = 5;
    const cardWidth = (width - 16 - gap) / columns;
    undatedCourses.forEach((course, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cardX = x + 8 + col * (cardWidth + gap);
      const cardTop = sectionTop - 35 - row * 60;
      page.drawRectangle({ x: cardX, y: cardTop - 55, width: cardWidth, height: 55, color: SUBTLE, borderColor: GRID, borderWidth: 0.5 });
      page.drawRectangle({ x: cardX, y: cardTop - 55, width: 3, height: 55, color: colorFromHex(course.color) });
      page.drawText(fitText(`${course.courseLabel ?? course.courseCode} (${course.groupCode})`, bold, 8.5, cardWidth - 14), {
        x: cardX + 8, y: cardTop - 13, font: bold, size: 8.5, color: INK,
      });
      page.drawText(fitText(course.courseName ?? "Untitled course", regular, 7.5, cardWidth - 14), {
        x: cardX + 8, y: cardTop - 26, font: regular, size: 7.5, color: MUTED,
      });
      page.drawText(fitText(course.examDateLabel, bold, 8, cardWidth - 14), {
        x: cardX + 8, y: cardTop - 40, font: bold, size: 8, color: INK,
      });
    });
  }
}

function courseRowHeights(courses: ExportCourse[], horizontal: boolean)
{
  const columns = horizontal ? 4 : 1;
  return Array.from({ length: Math.ceil(courses.length / columns) }, (_, row) => (
    Math.max(...courses.slice(row * columns, (row + 1) * columns).map(course => (
      (course.examStatus === "undated" ? 97 : 75) + (formatCampusSummary(course.campuses ?? []) ? 12 : 0)
    )))
  ));
}

function drawCoursePanel(page: PDFPage, courses: ExportCourse[], x: number, top: number, width: number, horizontal: boolean, bold: PDFFont, regular: PDFFont)
{
  const columns = horizontal ? 4 : 1;
  const rowHeights = courseRowHeights(courses, horizontal);
  const gap = 5;
  const headingHeight = 26;
  const cardWidth = (width - (columns - 1) * gap) / columns;
  if (!horizontal) page.drawLine({ start: { x: x - 6, y: top }, end: { x: x - 6, y: top - coursePanelHeight(courses, horizontal) }, color: GRID, thickness: 0.7 });
  else page.drawLine({ start: { x, y: top + 6 }, end: { x: x + width, y: top + 6 }, color: GRID, thickness: 0.7 });
  page.drawText("My Courses", { x, y: top - 15, font: bold, size: 13, color: INK });
  courses.forEach((course, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cardX = x + col * (cardWidth + gap);
    const cardHeight = rowHeights[row];
    const cardTop = top - headingHeight - rowHeights.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
    const bottom = cardTop - cardHeight;
    drawRoundedCard(page, cardX, cardTop, cardWidth, cardHeight, course.hidden ? SUBTLE : SURFACE, 5.5);
    page.drawRectangle({ x: cardX, y: bottom, width: 3, height: cardHeight, color: colorFromHex(course.color) });
    page.drawRectangle({ x: cardX + 8, y: cardTop - 14, width: 8, height: 8, color: colorFromHex(course.color) });
    const titleX = cardX + 21;
    const code = fitText(course.courseLabel ?? course.courseCode, bold, 9, cardWidth - 27);
    page.drawText(code, { x: titleX, y: cardTop - 13, font: bold, size: 9, color: INK });
    const nameX = titleX + bold.widthOfTextAtSize(code, 9) + 4;
    const nameWidth = Math.max(0, cardX + cardWidth - nameX - (course.hidden ? 41 : 6));
    page.drawText(fitText(course.courseName ?? "Untitled course", regular, 8.2, nameWidth), {
      x: nameX, y: cardTop - 13, font: regular, size: 8.2, color: INK,
    });
    if (course.hidden) page.drawText("HIDDEN", { x: cardX + cardWidth - 39, y: cardTop - 13, font: bold, size: 5.5, color: MUTED });
    const rowX = cardX + 24;
    const rowWidth = cardWidth - 30;
    drawCourseIcon(page, "group", cardX + 9, cardTop - 36);
    page.drawText("Group:", { x: rowX, y: cardTop - 35, font: bold, size: 8, color: INK });
    page.drawText(fitText(course.groupCode, regular, 8, rowWidth - 30), { x: rowX + 30, y: cardTop - 35, font: regular, size: 8, color: MUTED });
    const campusLabel = formatCampusSummary(course.campuses ?? []);
    const campusOffset = campusLabel ? 12 : 0;
    if (campusLabel)
    {
      drawCourseIcon(page, "campus", cardX + 9, cardTop - 48);
      page.drawText("Campus:", { x: rowX, y: cardTop - 47, font: bold, size: 8, color: INK });
      const campusX = rowX + bold.widthOfTextAtSize("Campus:", 8) + 3;
      page.drawText(fitText(campusLabel, regular, 8, cardX + cardWidth - campusX - 6), {
        x: campusX, y: cardTop - 47, font: regular, size: 8, color: MUTED,
      });
    }
    const examLabel = course.examStatus === "dated" ? `Exam: ${getExportExamLabel(course)}` : getExportExamLabel(course);
    const examFont = course.examStatus === "dated" ? regular : bold;
    drawCourseIcon(page, "exam", cardX + 9, cardTop - 48 - campusOffset);
    page.drawText(fitText(examLabel, examFont, 8, rowWidth), {
      x: rowX, y: cardTop - 47 - campusOffset, font: examFont, size: 8, color: course.examStatus === "dated" ? MUTED : INK,
    });
    const guidanceLines = course.examGuidance ? wrapText(course.examGuidance, regular, 7.2, rowWidth).slice(0, 3) : [];
    guidanceLines.forEach((line, lineIndex) => {
      page.drawText(line, { x: rowX, y: cardTop - 59 - campusOffset - lineIndex * 9, font: regular, size: 7.2, color: MUTED });
    });
    const creditsY = cardTop - 59 - campusOffset - (guidanceLines.length ? guidanceLines.length * 9 + 5 : 0);
    drawCourseIcon(page, "credit", cardX + 9, creditsY - 1);
    page.drawText("Credit Units:", { x: rowX, y: creditsY, font: bold, size: 8, color: INK });
    page.drawText((course.creditUnits ?? 0).toFixed(1), {
      x: rowX + bold.widthOfTextAtSize("Credit Units:", 8) + 3, y: creditsY, font: regular, size: 8, color: MUTED,
    });
  });
  const rows = Math.ceil(courses.length / columns);
  const summaryTop = top - headingHeight - rowHeights.reduce((sum, height) => sum + height, 0) - Math.max(0, rows - 1) * gap - 10;
  page.drawLine({ start: { x, y: summaryTop }, end: { x: x + width, y: summaryTop }, color: GRID, thickness: 0.7 });
  const totalCredits = courses.reduce((sum, course) => sum + (course.creditUnits ?? 0), 0);
  page.drawText("Total Credit Units", { x, y: summaryTop - 14, font: regular, size: 7.5, color: MUTED });
  page.drawText(`${totalCredits.toFixed(1)} CU`, { x, y: summaryTop - 30, font: bold, size: 12, color: INK });
  const secondX = x + (horizontal ? 125 : width * 0.55);
  page.drawText("Total Courses", { x: secondX, y: summaryTop - 14, font: regular, size: 7.5, color: MUTED });
  page.drawText(String(courses.length), { x: secondX, y: summaryTop - 30, font: bold, size: 12, color: INK });
}

function coursePanelHeight(courses: ExportCourse[], horizontal: boolean)
{
  const rows = courseRowHeights(courses, horizontal);
  return 26 + rows.reduce((sum, height) => sum + height, 0) + Math.max(0, rows.length - 1) * 5 + 51;
}

function drawVisualPage(
  pdf: PDFDocument,
  semester: SemesterRecord | null,
  events: TimetableEventRecord[],
  bold: PDFFont,
  regular: PDFFont,
  options: PdfOptions,
)
{
  const horizontal = options.orientation === "horizontal";
  const examView = options.viewMode === "exam";
  const blocks = buildTimetableBlocks(events, options.selectedWeekId ?? "all");
  const courses = options.courses ?? buildFallbackCourses(events, options.colorByShareKey);
  const examWindows = examView ? buildExamWindows(events) : [];
  const days = blocks.some((block) => block.dayOfWeek === 6) ? 6 : 5;
  const { startMinutes, endMinutes } = getExportTimeRange(blocks);
  const laneLayouts = buildPdfLanes(blocks);
  const horizontalGridHeight = 17 + Array.from({ length: days }, (_, index) => {
    const count = Math.max(1, ...blocks.filter((block) => block.dayOfWeek === index + 1)
      .map((block) => laneLayouts.get(block.id)?.count ?? 1));
    return count > 1 ? 1.4 + count * 56.8 + (count - 1) * 0.7 : 59;
  }).reduce((sum, value) => sum + value, 0);
  const effectiveOptions: PdfOptions = {
    ...options,
    colorByShareKey: new Map([
      ...courses.map((course) => [course.shareKey, course.color] as const),
      ...options.colorByShareKey?.entries() ?? [],
    ]),
  };
  const undatedCourses = courses.filter((course) => course.examStatus === "undated" && !course.hidden);
  const examWindowsHeight = examWindows.length ? examWindows.reduce((sum, window) => sum + 18 + window.dayHeight * 2 + 8, -8) : 0;
  const gridHeight = examView
    ? examWindowsHeight + (undatedCourses.length ? (examWindows.length ? 12 : 0) + undatedExamSectionHeight(undatedCourses.length) : examWindows.length ? 0 : 80)
    : horizontal ? horizontalGridHeight : 23 + ((endMinutes - startMinutes) / 30) * 21;
  const margin = 17;
  const gap = 11;
  const headerHeight = 62;
  const pageWidth = LANDSCAPE_A4[0];
  const contentWidth = pageWidth - margin * 2;
  const gridWidth = horizontal ? contentWidth : (contentWidth - gap) * 0.7;
  const panelWidth = horizontal ? contentWidth : contentWidth - gap - gridWidth;
  const panelHeight = coursePanelHeight(courses, horizontal);
  const bodyHeight = horizontal ? gridHeight + gap + panelHeight : Math.max(gridHeight, panelHeight);
  const pageHeight = margin + headerHeight + bodyHeight + margin;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: SURFACE });
  const headerTop = pageHeight - margin;
  page.drawText(examView ? "Exam Calendar" : "Timetable", { x: margin, y: headerTop - 21, font: bold, size: 20, color: INK });
  const semesterLabel = semester ? `${semester.academicYear} · ${semester.semesterName}` : "Semester unavailable";
  page.drawText(fitText(semesterLabel, regular, 10, contentWidth - 150), { x: margin, y: headerTop - 42, font: regular, size: 10, color: MUTED });
  const weekLabel = examView ? "All exams" : options.weekLabel ?? "All weeks";
  const fittedWeekLabel = fitText(weekLabel, bold, 9, 145);
  page.drawText(fittedWeekLabel, { x: pageWidth - margin - bold.widthOfTextAtSize(fittedWeekLabel, 9), y: headerTop - 24, font: bold, size: 9, color: MUTED });
  page.drawLine({ start: { x: margin, y: headerTop - 49 }, end: { x: pageWidth - margin, y: headerTop - 49 }, color: GRID, thickness: 0.7 });
  const bodyTop = headerTop - headerHeight;
  if (examView) drawExamGrid(page, examWindows, undatedCourses, margin, bodyTop, gridWidth, bold, regular, effectiveOptions);
  else drawClassGrid(page, blocks, margin, bodyTop, gridWidth, gridHeight, horizontal, bold, regular, effectiveOptions);
  drawCoursePanel(page, courses,
    horizontal ? margin : margin + gridWidth + gap,
    horizontal ? bodyTop - gridHeight - gap : bodyTop,
    panelWidth, horizontal, bold, regular);
  return page;
}

function drawEventPages(pdf: PDFDocument, semester: SemesterRecord | null, events: TimetableEventRecord[], clashes: TimetableClash[], bold: PDFFont, regular: PDFFont)
{
  let page: PDFPage;
  let y: number;
  let pageNumber = 0;
  const contentWidth = PORTRAIT_A4[0] - 2 * MARGIN;
  const addPage = () => {
    page = pdf.addPage(PORTRAIT_A4);
    pageNumber += 1;
    y = PORTRAIT_A4[1] - MARGIN;
    page.drawText("Class events", { x: MARGIN, y, font: bold, size: 18, color: INK });
    y -= 18;
    page.drawText(fitText(semester ? `${semester.academicYear} - ${semester.semesterName}` : "Timetable", regular, 9, contentWidth), {
      x: MARGIN, y, font: regular, size: 9, color: MUTED,
    });
    y -= 28;
  };
  const ensure = (height: number) => { if (y - height < MARGIN) addPage(); };
  addPage();
  let previousDate = "";
  const sorted = [...events].sort((a, b) => `${a.eventDate}${a.startTime}${a.courseCode}`.localeCompare(`${b.eventDate}${b.startTime}${b.courseCode}`));
  if (sorted.length === 0)
  {
    page!.drawText("No class events to list.", { x: MARGIN, y: y!, font: regular, size: 10, color: MUTED });
  }
  for (const event of sorted)
  {
    const dateChanged = event.eventDate !== previousDate;
    const title = `${event.courseLabel ?? event.courseCode} (${event.groupCode})  ${formatTimeRange(event.startTime, event.endTime)}`;
    const campuses = getEventCampusCodes(event);
    const details = [event.courseName, event.eventKind !== "CLASS" ? event.eventKind : null,
      campuses.length ? `Campus: ${formatCampusNames(campuses)}` : null,
      event.weekLabel ? `Week: ${event.weekLabel}` : null, event.remarks ? `Notes: ${event.remarks}` : null]
      .filter(Boolean).join("  |  ");
    const detailLines = wrapText(details, regular, 9, contentWidth - 14);
    ensure((dateChanged ? 31 : 0) + 30 + detailLines.length * 12);
    if (dateChanged)
    {
      page!.drawRectangle({ x: MARGIN, y: y! - 4, width: contentWidth, height: 20, color: SUBTLE });
      page!.drawText(pdfText(formatEventDate(event.eventDate)), { x: MARGIN + 7, y: y! + 2, font: bold, size: 10, color: INK });
      y! -= 28;
      previousDate = event.eventDate;
    }
    page!.drawText(fitText(title, bold, 10, contentWidth - 14), { x: MARGIN + 7, y: y!, font: bold, size: 10, color: INK });
    y! -= 13;
    for (const line of detailLines)
    {
      page!.drawText(line, { x: MARGIN + 7, y: y!, font: regular, size: 9, color: MUTED });
      y! -= 12;
    }
    y! -= 10;
  }
  if (clashes.length > 0)
  {
    ensure(42);
    y! -= 8;
    page!.drawText("Detected clashes", { x: MARGIN, y: y!, font: bold, size: 11, color: rgb(0.65, 0.13, 0.13) });
    y! -= 17;
    for (const clash of clashes)
    {
      ensure(27);
      const label = `${formatEventDate(clash.eventDate)} ${formatTimeRange(clash.startTime, clash.endTime)}: ${clash.events.map((event) => `${event.courseLabel ?? event.courseCode} (${event.groupCode})`).join(", ")}`;
      page!.drawText(fitText(label, regular, 9, contentWidth), { x: MARGIN, y: y!, font: regular, size: 9, color: INK });
      y! -= 16;
    }
  }
  return pageNumber;
}

export async function buildTimetablePdf(
  semester: SemesterRecord | null,
  events: TimetableEventRecord[],
  clashes: TimetableClash[],
  options: PdfOptions = {},
)
{
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  drawVisualPage(pdf, semester, events, bold, regular, options);
  drawEventPages(pdf, semester, options.classSessionEvents ?? events, clashes, bold, regular);
  return pdf.save();
}
