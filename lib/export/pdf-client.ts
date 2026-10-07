"use client";

import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import { formatCampusNames, getEventCampusCodes } from "@/lib/timetable/campus";
import type { SemesterRecord, TimetableClash, TimetableEventRecord } from "@/lib/timetable/types";

function addTextElement(parent: HTMLElement, tag: string, className: string, value: string)
{
  const element = parent.ownerDocument.createElement(tag);
  element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function buildEventListing(doc: Document, semester: SemesterRecord | null, events: TimetableEventRecord[], clashes: TimetableClash[])
{
  const listing = doc.createElement("section");
  listing.className = "print-events";
  addTextElement(listing, "h2", "print-events__title", "Class sessions");
  addTextElement(listing, "p", "print-events__subtitle", semester
    ? `Academic Year ${semester.academicYear} · ${semester.semesterName}` : "Timetable");

  const sorted = events.filter((event) => event.eventKind !== "EXAM")
    .sort((left, right) => `${left.eventDate}${left.startTime}${left.courseCode}`
      .localeCompare(`${right.eventDate}${right.startTime}${right.courseCode}`));
  if (sorted.length === 0) addTextElement(listing, "p", "print-events__empty", "No class sessions to list.");

  let previousDate = "";
  for (const event of sorted)
  {
    if (event.eventDate !== previousDate)
    {
      addTextElement(listing, "h3", "print-events__date", formatEventDate(event.eventDate));
      previousDate = event.eventDate;
    }
    const row = doc.createElement("article");
    row.className = "print-events__row";
    const heading = doc.createElement("div");
    heading.className = "print-events__row-heading";
    addTextElement(heading, "strong", "", `${event.courseLabel ?? event.courseCode} (${event.groupCode})`);
    addTextElement(heading, "span", "", formatTimeRange(event.startTime, event.endTime));
    row.appendChild(heading);
    const campuses = getEventCampusCodes(event);
    const details = [event.courseName, campuses.length ? `Campus: ${formatCampusNames(campuses)}` : null,
      event.weekLabel ? `Week: ${event.weekLabel}` : null,
      event.remarks ? `Notes: ${event.remarks}` : null].filter(Boolean).join(" · ");
    if (details) addTextElement(row, "p", "print-events__details", details);
    listing.appendChild(row);
  }

  if (clashes.length > 0)
  {
    addTextElement(listing, "h3", "print-events__clashes-title", "Detected clashes");
    for (const clash of clashes)
    {
      addTextElement(listing, "p", "print-events__clash", `${formatEventDate(clash.eventDate)} ${formatTimeRange(clash.startTime, clash.endTime)}: ${clash.events.map((event) => `${event.courseLabel ?? event.courseCode} (${event.groupCode})`).join(", ")}`);
    }
  }
  return listing;
}

const PRINT_CSS = `
  *, *::before, *::after { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
  html, body { min-height: 0 !important; }
  body { margin: 0; background: #fff; color: var(--on-surface); }
  .print-visual-page { box-sizing: border-box; display: flex; align-items: flex-start; justify-content: flex-start; width: 297mm; height: 210mm; background: #fff; }
  .print-visual-page__scaled { position: relative; flex: none; }
  .print-visual-page__scaled > div { transform-origin: top left; }
  .pdf-export-card { box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
  .pdf-export-card .timetable-export-card__header { flex: none; }
  .pdf-export-card .timetable-export-card__body { flex: 1; min-height: 0; }
  .pdf-export-card .timetable-export-card__main,
  .pdf-export-card .timetable-export-card__aside { min-height: 0; overflow: hidden; }
  .pdf-export-card--vertical .timetable-export-card__main,
  .pdf-export-card--vertical .timetable-export-card__aside { height: 100%; }
  .pdf-export-card--horizontal .timetable-export-card__main { flex: 1; }
  .pdf-export-card--horizontal .timetable-export-card__aside { flex: none; height: 230px; }
  .pdf-export-card--exam .timetable-export-card__main-content { min-height: 100%; }
  .pdf-export-card--exam .exam-calendar { min-height: 100%; display: flex; flex-direction: column; }
  .pdf-export-card--exam .exam-calendar__window { flex: 1; display: flex; flex-direction: column; }
  .pdf-export-card--exam .exam-calendar__window > div,
  .pdf-export-card--exam .exam-calendar__window > div > div { flex: 1; display: flex; flex-direction: column; }
  .pdf-export-card--exam .exam-calendar__day-grid { flex: 1; grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .pdf-export-card--exam .exam-calendar > section:not(.exam-calendar__window) { flex: 1; }
  .pdf-export-card--exam .exam-calendar > div:first-child:last-child { flex: 1; }
  .print-events { box-sizing: border-box; width: 186mm; margin: 0; padding: 0; background: #fff; font-family: var(--font-sans); }
  .print-events__title { margin: 0; font-size: 25px; font-weight: 700; line-height: 32px; }
  .print-events__subtitle { margin: 4px 0 20px; padding-bottom: 12px; border-bottom: 1px solid var(--outline-variant); color: var(--on-surface-variant); font-size: 14px; }
  .print-events__date { margin: 16px 0 0; padding: 8px 10px; background: var(--surface-container-low); font-size: 14px; break-after: avoid; }
  .print-events__row { padding: 10px; border-bottom: 1px solid var(--outline-variant); break-inside: avoid; }
  .print-events__row-heading { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
  .print-events__row-heading span, .print-events__details, .print-events__empty { color: var(--on-surface-variant); }
  .print-events__details { margin: 4px 0 0; font-size: 12px; line-height: 1.5; }
  .print-events__empty { font-size: 13px; }
  .print-events__clashes-title { margin: 22px 0 8px; font-size: 15px; break-after: avoid; }
  .print-events__clash { margin: 0; padding: 8px 10px; border-bottom: 1px solid var(--outline-variant); font-size: 12px; break-inside: avoid; }
  @media print {
    html, body { width: auto !important; margin: 0 !important; padding: 0 !important; }
    .print-visual-page { page: visual; width: 297mm; height: 210mm; margin: 0 !important; overflow: hidden; break-after: page; }
    .print-events { page: sessions; width: 186mm !important; margin: 0 !important; padding: 0 !important; }
    .timetable-cell { animation: none !important; transition: none !important; }
  }
`;

function waitForStyleSheets(doc: Document)
{
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  return Promise.all(links.map((link) => new Promise<void>((resolve) => {
    if (link.sheet) return resolve();
    const finish = () => resolve();
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, 5000);
  })));
}

const PDF_CARD_WIDTH = 1200;
const PDF_CARD_HEIGHT = 850;

function scalePixelStyle(element: HTMLElement, property: "top" | "height", ratio: number)
{
  const value = element.style[property];
  if (value.endsWith("px")) element.style[property] = `${Number.parseFloat(value) * ratio}px`;
}

// Resize the grid geometry inside its fixed page area without scaling the text.
function fillTimetableArea(card: HTMLElement)
{
  const main = card.querySelector<HTMLElement>(".timetable-export-card__main");
  const grid = main?.querySelector<HTMLElement>(".timetable-grid");
  if (!main || !grid) return;

  if (card.classList.contains("timetable-export-card--vertical"))
  {
    const columns = grid.querySelectorAll<HTMLElement>(":scope > div > div.grid");
    const header = columns[0];
    const rows = columns[1];
    const firstCell = rows?.firstElementChild as HTMLElement | null;
    const oldHeight = Number.parseFloat(firstCell?.style.height ?? "0");
    const targetHeight = main.clientHeight - (header?.getBoundingClientRect().height ?? 0);
    if (!rows || oldHeight <= 0 || targetHeight <= 0) return;
    const ratio = targetHeight / oldHeight;
    for (const cell of rows.children) (cell as HTMLElement).style.height = `${targetHeight}px`;
    for (const label of rows.querySelectorAll<HTMLElement>(".timetable-grid__time-label")) scalePixelStyle(label, "top", ratio);
    for (const block of rows.querySelectorAll<HTMLElement>(".timetable-cell"))
    {
      scalePixelStyle(block, "top", ratio);
      scalePixelStyle(block, "height", ratio);
    }
    return;
  }

  const columns = grid.querySelector<HTMLElement>(":scope > div > div > div.grid");
  const labels = columns?.children[2] as HTMLElement | undefined;
  const days = columns?.children[3] as HTMLElement | undefined;
  const oldHeight = Number.parseFloat(labels?.style.height ?? "0");
  const targetHeight = main.clientHeight - (columns?.children[1]?.getBoundingClientRect().height ?? 0);
  if (!labels || !days || oldHeight <= 0 || targetHeight <= 0) return;
  const ratio = targetHeight / oldHeight;
  labels.style.height = `${targetHeight}px`;
  days.style.height = `${targetHeight}px`;
  for (const label of labels.children)
  {
    scalePixelStyle(label as HTMLElement, "top", ratio);
    scalePixelStyle(label as HTMLElement, "height", ratio);
  }
  for (const child of days.children)
  {
    scalePixelStyle(child as HTMLElement, "top", ratio);
    if ((child as HTMLElement).classList.contains("timetable-cell")) scalePixelStyle(child as HTMLElement, "height", ratio);
  }
}

function fitPdfContent(card: HTMLElement)
{
  if (card.classList.contains("pdf-export-card--class")) fillTimetableArea(card);
  for (const selector of ["main", "aside"])
  {
    const region = card.querySelector<HTMLElement>(`.timetable-export-card__${selector}`);
    const content = card.querySelector<HTMLElement>(`.timetable-export-card__${selector}-content`);
    if (!region || !content) continue;
    if (!region.clientWidth || !region.clientHeight || !content.scrollWidth || !content.scrollHeight) continue;
    const scale = Math.min(1, region.clientWidth / content.scrollWidth, region.clientHeight / content.scrollHeight);
    if (scale < 1)
    {
      content.style.width = `${region.clientWidth / scale}px`;
      content.style.transformOrigin = "top left";
      content.style.transform = `scale(${scale})`;
    }
  }
}

let activePrintFrame: HTMLIFrameElement | null = null;

export function printTimetablePdf(
  timetableCard: HTMLElement,
  examCalendarCard: HTMLElement,
  semester: SemesterRecord | null,
  events: TimetableEventRecord[],
  clashes: TimetableClash[],
  fileName: string,
  onPrepared?: () => void,
)
{
  activePrintFrame?.remove();
  const visualCards = [timetableCard, examCalendarCard];
  const cardWidth = PDF_CARD_WIDTH;
  const cardHeight = PDF_CARD_HEIGHT;
  const frame = document.createElement("iframe");
  frame.title = "Timetable PDF print";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${cardWidth}px;height:${cardHeight}px;border:0;pointer-events:none;`;
  document.body.appendChild(frame);
  activePrintFrame = frame;

  const printWindow = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!printWindow || !doc)
  {
    frame.remove();
    activePrintFrame = null;
    return false;
  }

  doc.open();
  doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title></title></head><body></body></html>');
  doc.title = fileName.replace(/\.pdf$/i, "");
  doc.documentElement.className = document.documentElement.className;
  doc.documentElement.style.cssText = document.documentElement.style.cssText;
  doc.documentElement.dataset.colorScheme = "light";
  doc.documentElement.style.colorScheme = "light";
  for (const name of ["--background", "--surface-container-lowest"])
  {
    doc.documentElement.style.setProperty(name, "#fff");
  }
  doc.body.className = document.body.className;

  const base = doc.createElement("base");
  base.href = window.location.href;
  doc.head.appendChild(base);
  for (const source of document.head.querySelectorAll('link[rel="stylesheet"], style'))
  {
    doc.head.appendChild(source.cloneNode(true));
  }
  const style = doc.createElement("style");
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  const pageStyle = doc.createElement("style");
  pageStyle.textContent = "@page visual { size: A4 landscape; margin: 0; } @page sessions { size: A4 portrait; margin: 12mm; }";
  doc.head.appendChild(pageStyle);

  const a4Width = 297 * 96 / 25.4;
  const a4Height = 210 * 96 / 25.4;
  const scale = Math.min(a4Width / cardWidth, a4Height / cardHeight);
  const printedCards: HTMLElement[] = [];
  for (const card of visualCards)
  {
    const width = cardWidth;
    const height = cardHeight;
    const page = doc.createElement("section");
    page.className = "print-visual-page";
    const scaledCard = doc.createElement("div");
    scaledCard.className = "print-visual-page__scaled";
    scaledCard.style.width = `${width * scale}px`;
    scaledCard.style.height = `${height * scale}px`;
    const printedCard = card.cloneNode(true) as HTMLElement;
    printedCard.classList.add("pdf-export-card", card.querySelector(".exam-calendar") ? "pdf-export-card--exam" : "pdf-export-card--class");
    printedCard.style.width = `${width}px`;
    printedCard.style.height = `${height}px`;
    printedCard.style.transform = `scale(${scale})`;
    printedCards.push(printedCard);
    const sourceGrid = card.querySelector<HTMLElement>(".timetable-grid");
    const printedGrid = printedCard.querySelector<HTMLElement>(".timetable-grid");
    if (sourceGrid && printedGrid)
    {
      const sourceStyle = getComputedStyle(sourceGrid);
      for (const name of ["--timetable-grid-label-size", "--timetable-grid-date-size"])
      {
        printedGrid.style.setProperty(name, sourceStyle.getPropertyValue(name));
      }
    }
    scaledCard.appendChild(printedCard);
    page.appendChild(scaledCard);
    doc.body.appendChild(page);
  }
  doc.body.appendChild(buildEventListing(doc, semester, events, clashes));
  doc.close();

  const cleanup = () => {
    if (activePrintFrame === frame) activePrintFrame = null;
    frame.remove();
  };
  printWindow.addEventListener("afterprint", () => window.setTimeout(cleanup, 30_000), { once: true });
  window.setTimeout(cleanup, 300_000);

  let preparationFinished = false;
  const finishPreparing = () => {
    if (preparationFinished) return;
    preparationFinished = true;
    onPrepared?.();
  };
  void (async () => {
    try
    {
      await waitForStyleSheets(doc);
      await Promise.race([doc.fonts.ready, new Promise<void>((resolve) => window.setTimeout(resolve, 5000))]);
      if (!frame.isConnected) return;
      await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(() => resolve())));
      if (!frame.isConnected) return;
      for (const card of printedCards) fitPdfContent(card);
      await new Promise<void>((resolve) => printWindow.requestAnimationFrame(() => resolve()));
      finishPreparing();
      printWindow.focus();
      printWindow.print();
    }
    catch
    {
      cleanup();
    }
    finally
    {
      finishPreparing();
    }
  })();
  return true;
}
