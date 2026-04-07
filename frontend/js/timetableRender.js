import { DAYS } from "./constants.js";
import { fromMinutes } from "./time.js";

export function buildGrid(timetable, bounds, orientation)
{
  const totalMinutes = bounds.endMinutes - bounds.startMinutes;
  const slots = totalMinutes / 30;
  timetable.style.setProperty("--day-count", String(DAYS.length));
  timetable.style.setProperty("--slots", String(slots));
  timetable.classList.toggle("vertical", orientation === "vertical");
  timetable.innerHTML = "";

  timetable.setAttribute("aria-colcount", orientation === "horizontal" ? String(slots + 1) : String(DAYS.length + 1));
  timetable.setAttribute("aria-rowcount", orientation === "horizontal" ? String(DAYS.length + 1) : String(slots + 1));

  const corner = document.createElement("div");
  corner.className = "corner-cell";
  timetable.appendChild(corner);

  if (orientation === "horizontal")
  {
    for (let slot = 0; slot < slots; slot += 1)
    {
      const timeHeader = document.createElement("div");
      timeHeader.className = "time-header";
      timeHeader.style.gridColumn = String(slot + 2);
      timeHeader.style.gridRow = "1";
      const labelMinutes = bounds.startMinutes + slot * 30;
      const showHourLabel = labelMinutes % 60 === 0;
      timeHeader.textContent = showHourLabel ? fromMinutes(labelMinutes) : "";
      if (!showHourLabel)
      {
        timeHeader.classList.add("half");
      }
      timetable.appendChild(timeHeader);
    }

    DAYS.forEach((day, dayIndex) => {
      const sideHeader = document.createElement("div");
      sideHeader.className = "day-side-header";
      sideHeader.id = `day-row-${dayIndex}`;
      sideHeader.style.gridColumn = "1";
      sideHeader.style.gridRow = String(dayIndex + 2);
      sideHeader.textContent = day;
      timetable.appendChild(sideHeader);

      for (let slot = 0; slot < slots; slot += 1)
      {
        const isHalf = slot % 2 === 1;
        const cell = document.createElement("div");
        cell.className = `grid-cell ${isHalf ? "half" : ""}`;
        cell.style.gridColumn = String(slot + 2);
        cell.style.gridRow = String(dayIndex + 2);
        timetable.appendChild(cell);
      }
    });

    return;
  }

  DAYS.forEach((day, dayIndex) => {
    const header = document.createElement("div");
    header.className = "day-header";
    header.id = `day-col-${dayIndex}`;
    header.style.gridColumn = String(dayIndex + 2);
    header.style.gridRow = "1";
    header.textContent = day;
    timetable.appendChild(header);
  });

  for (let slot = 0; slot < slots; slot += 1)
  {
    const isHalf = slot % 2 === 1;
    const time = document.createElement("div");
    time.className = `time-cell ${isHalf ? "half" : ""}`;
    time.style.gridRow = String(slot + 2);
    const labelMinutes = bounds.startMinutes + slot * 30;
    if (labelMinutes % 60 === 0)
    {
      const timeLabel = document.createElement("span");
      timeLabel.className = "time-label";
      timeLabel.textContent = fromMinutes(labelMinutes);
      time.appendChild(timeLabel);
    }
    timetable.appendChild(time);

    DAYS.forEach((_, dayIndex) => {
      const cell = document.createElement("div");
      cell.className = `grid-cell ${isHalf ? "half" : ""}`;
      cell.style.gridColumn = String(dayIndex + 2);
      cell.style.gridRow = String(slot + 2);
      timetable.appendChild(cell);
    });
  }
}

export function renderEvents(timetable, events, bounds, orientation, lessonTimeLabel, onEventClick)
{
  const normalizeTgLabel = (eventData) => {
    const explicitTg = String(eventData.tg || "").trim().toUpperCase();
    if (/^TG\d+$/.test(explicitTg))
    {
      return explicitTg;
    }

    const codeMatch = String(eventData.code || "").toUpperCase().match(/-TG(\d+)$/i);
    if (codeMatch)
    {
      return `TG${String(codeMatch[1]).padStart(2, "0")}`;
    }

    return "TG";
  };

  const hasActiveTgSelection = events.some((eventData) => eventData.isTgActive);
  const totalSlots = (bounds.endMinutes - bounds.startMinutes) / 30;
  const tableRect = timetable.getBoundingClientRect();
  const firstTimeCell = timetable.querySelector(".time-cell");
  const rowHeight = firstTimeCell ? firstTimeCell.getBoundingClientRect().height : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour-h")) / 2;

  const dayColumnRects = DAYS.map((_, idx) => {
    const header = document.getElementById(`day-col-${idx}`);
    return header ? header.getBoundingClientRect() : null;
  });

  const dayRowRects = DAYS.map((_, idx) => {
    const row = document.getElementById(`day-row-${idx}`);
    return row ? row.getBoundingClientRect() : null;
  });

  const firstTimeHeader = timetable.querySelector(".time-header");
  const slotWidth = firstTimeHeader
    ? firstTimeHeader.getBoundingClientRect().width
    : (timetable.clientWidth - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--time-col"))) / totalSlots;

  const dayRowHeight = dayRowRects[0] ? dayRowRects[0].height : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--day-row-h"));
  const timeColumnBase = firstTimeHeader
    ? firstTimeHeader.getBoundingClientRect().left - tableRect.left
    : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--time-col"));
  const timeRowBase = firstTimeCell ? firstTimeCell.getBoundingClientRect().top - tableRect.top : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h"));
  const layoutWidth = Math.max(timetable.scrollWidth, timetable.clientWidth);
  const layoutHeight = Math.max(timetable.scrollHeight, timetable.clientHeight);
  const maxTop = layoutHeight - 4;
  const maxLeft = layoutWidth - 4;

  events.forEach((eventData, index) => {
    const event = document.createElement("article");
    event.className = "event";
    if (eventData.isTgOption)
    {
      event.classList.add("tg-option");
    }
    if (eventData.isTgActive)
    {
      event.classList.add("tg-active");
    }
    if (hasActiveTgSelection && !eventData.isTgActive)
    {
      event.classList.add("tg-dimmed");
    }
    event.style.backgroundColor = eventData.isTgOption ? `${eventData.color}80` : eventData.color;
    event.tabIndex = 0;
    event.setAttribute("role", "gridcell");
    event.setAttribute("data-testid", `event-${index}`);
    event.setAttribute(
      "aria-label",
      `${eventData.code} on ${DAYS[eventData.dayIdx]} ${lessonTimeLabel(eventData)} at ${eventData.venue}.`
    );

    const startOffset = (eventData.start - bounds.startMinutes) / 30;
    const durationSlots = (eventData.end - eventData.start) / 30;

    let left;
    let top;
    let width;
    let height;

    if (orientation === "horizontal")
    {
      const laneHeight = dayRowHeight / eventData.laneCount;
      const dayRect = dayRowRects[eventData.dayIdx];
      if (!dayRect)
      {
        return;
      }
      left = timeColumnBase + startOffset * slotWidth + 2;
      top = dayRect.top - tableRect.top + eventData.lane * laneHeight + 2;
      width = durationSlots * slotWidth - 4;
      height = laneHeight - 4;
    }
    else
    {
      const dayRect = dayColumnRects[eventData.dayIdx];
      if (!dayRect)
      {
        return;
      }
      const dayStart = dayRect.left - tableRect.left;
      const laneWidth = dayRect.width / eventData.laneCount;
      left = dayStart + eventData.lane * laneWidth + 2;
      top = timeRowBase + startOffset * rowHeight + 2;
      width = laneWidth - 4;
      height = durationSlots * rowHeight - 4;
    }

    const clampedLeft = Math.max(1, Math.min(left, maxLeft));
    const clampedTop = Math.max(1, Math.min(top, maxTop));
    const availableWidth = Math.max(1, layoutWidth - clampedLeft - 2);
    const availableHeight = Math.max(1, layoutHeight - clampedTop - 2);
    const clampedWidth = Math.max(1, Math.min(width, availableWidth));
    const clampedHeight = Math.max(1, Math.min(height, availableHeight));

    event.style.left = `${clampedLeft}px`;
    event.style.top = `${clampedTop}px`;
    event.style.width = `${clampedWidth}px`;
    event.style.height = `${clampedHeight}px`;

    const normalizedCode = String(eventData.code || "").toUpperCase();
    const tgMatch = normalizedCode.match(/-TG\d+$/i);
    const tgLabel = normalizeTgLabel(eventData);
    const courseCode = tgMatch ? normalizedCode.replace(/-TG\d+$/i, "") : normalizedCode;

    const title = document.createElement("p");
    title.className = "event-title";
    title.textContent = courseCode;

    const tg = document.createElement("p");
    tg.className = "event-tg";
    tg.textContent = `${String(eventData.type || "Class").toUpperCase()} ${tgLabel}`;

    const meta = document.createElement("p");
    meta.className = "event-meta";
    meta.textContent = lessonTimeLabel(eventData);

    const venue = document.createElement("p");
    venue.className = "event-venue";
    venue.textContent = eventData.venue;

    event.appendChild(title);
    event.appendChild(tg);
    event.appendChild(meta);
    event.appendChild(venue);

    if (typeof onEventClick === "function")
    {
      event.addEventListener("click", () => onEventClick(eventData));
    }

    timetable.appendChild(event);
  });
}
