"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { PinIcon } from "@/components/planner/icons";
import {
  DAY_LABELS,
  START_MINUTES,
  formatClassGroupLabel,
  formatTimeRange,
  minutesToLabel,
  minutesToTimeString,
} from "@/lib/timetable/date-utils";
import { getCourseColor } from "@/lib/timetable/timetable-utils";
import type { TimetableBlock } from "@/lib/timetable/types";

const OVERLAP_INSET_PX = 1;
const OVERLAP_GAP_PX = 1;
const OVERLAP_COMPRESS_RATIO = 0.99;
const MIN_LANE_WIDTH_PX = 38;
const MIN_LANE_HEIGHT_PX = 18;
const VERTICAL_TIME_AXIS_COLUMN = "clamp(2.6rem, 8vw, 4.25rem)";
const VERTICAL_DAY_COLUMN_MIN = "clamp(2.9rem, 12vw, 8.5rem)";

type TimetableLaneLayout = {
  laneIndex: number;
  laneCount: number;
};

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

function compareBlocksForLane(left: TimetableBlock, right: TimetableBlock)
{
  if (left.startMinutes !== right.startMinutes)
  {
    return left.startMinutes - right.startMinutes;
  }
  if (left.endMinutes !== right.endMinutes)
  {
    return left.endMinutes - right.endMinutes;
  }
  if (left.courseCode !== right.courseCode)
  {
    return left.courseCode.localeCompare(right.courseCode);
  }
  if (left.groupCodeType !== right.groupCodeType)
  {
    return left.groupCodeType.localeCompare(right.groupCodeType);
  }
  if (left.groupCode !== right.groupCode)
  {
    return left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true, sensitivity: "base" });
  }
  if (left.shareKey !== right.shareKey)
  {
    return left.shareKey.localeCompare(right.shareKey);
  }
  return left.id.localeCompare(right.id);
}

function assignLaneLayoutForCluster(
  cluster: TimetableBlock[],
  laneLayouts: Map<string, TimetableLaneLayout>,
)
{
  if (cluster.length === 1)
  {
    laneLayouts.set(cluster[0].id, { laneIndex: 0, laneCount: 1 });
    return;
  }

  const sorted = [...cluster].sort(compareBlocksForLane);
  const laneEnds: number[] = [];
  const laneById = new Map<string, number>();

  for (const block of sorted)
  {
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= block.startMinutes);
    if (laneIndex < 0)
    {
      laneEnds.push(block.endMinutes);
      laneIndex = laneEnds.length - 1;
    }
    else
    {
      laneEnds[laneIndex] = block.endMinutes;
    }
    laneById.set(block.id, laneIndex);
  }

  const laneCount = Math.max(1, laneEnds.length);
  for (const block of cluster)
  {
    laneLayouts.set(block.id, {
      laneIndex: laneById.get(block.id) ?? 0,
      laneCount,
    });
  }
}

function buildLaneLayouts(blocks: TimetableBlock[])
{
  const laneLayouts = new Map<string, TimetableLaneLayout>();
  const dayMap = new Map<number, TimetableBlock[]>();

  for (const block of blocks)
  {
    const dayBlocks = dayMap.get(block.dayOfWeek);
    if (dayBlocks)
    {
      dayBlocks.push(block);
    }
    else
    {
      dayMap.set(block.dayOfWeek, [block]);
    }
  }

  for (const dayBlocks of dayMap.values())
  {
    const sorted = [...dayBlocks].sort(compareBlocksForLane);

    let cluster: TimetableBlock[] = [];
    let clusterEnd = -1;

    for (const block of sorted)
    {
      if (cluster.length === 0)
      {
        cluster = [block];
        clusterEnd = block.endMinutes;
        continue;
      }

      if (block.startMinutes < clusterEnd)
      {
        cluster.push(block);
        clusterEnd = Math.max(clusterEnd, block.endMinutes);
        continue;
      }

      assignLaneLayoutForCluster(cluster, laneLayouts);
      cluster = [block];
      clusterEnd = block.endMinutes;
    }

    if (cluster.length > 0)
    {
      assignLaneLayoutForCluster(cluster, laneLayouts);
    }
  }

  return laneLayouts;
}

function getVerticalTimeLabelStyle(slot: number, firstSlot: number, lastSlot: number, rangeMinutes: number): CSSProperties
{
  const leftPercent = ((slot - START_MINUTES) / rangeMinutes) * 100;

  if (slot === firstSlot)
  {
    return { left: `${leftPercent}%`, transform: "translateX(0)" };
  }

  if (slot === lastSlot)
  {
    return { left: `${leftPercent}%`, transform: "translateX(-100%)" };
  }

  return { left: `${leftPercent}%`, transform: "translateX(-50%)" };
}

function getHorizontalTimeLabelStyle(slot: number, firstSlot: number, lastSlot: number, rangeMinutes: number, contentHeight: number): CSSProperties
{
  const topPx = ((slot - START_MINUTES) / rangeMinutes) * contentHeight;

  if (slot === firstSlot)
  {
    return { top: `${topPx}px`, transform: "translateY(0)" };
  }

  if (slot === lastSlot)
  {
    return { top: `${topPx}px`, transform: "translateY(-100%)" };
  }

  return { top: `${topPx}px`, transform: "translateY(-50%)" };
}

export function TimetableCanvas({
  blocks,
  blockColorByKey,
  isHorizontal,
  timeSlots,
  visibleEndMinutes,
  showAllWeeks,
  activeShareKey,
  deEmphasisMode,
  activeCourseCode,
  courseCanPickByCode,
  isPickMode,
  suppressActiveOutline,
  onBlockClick,
  showCurrentTime,
}: {
  blocks: TimetableBlock[];
  blockColorByKey: Map<string, string>;
  isHorizontal: boolean;
  timeSlots: number[];
  visibleEndMinutes: number;
  showAllWeeks: boolean;
  activeShareKey: string | null;
  deEmphasisMode: "all" | "course-only" | "none";
  activeCourseCode: string | null;
  courseCanPickByCode: Record<string, boolean>;
  isPickMode: boolean;
  suppressActiveOutline: boolean;
  onBlockClick: (block: TimetableBlock) => void;
  showCurrentTime: boolean;
})
{
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateMobileState = () => setIsMobile(mediaQuery.matches);
    updateMobileState();
    mediaQuery.addEventListener("change", updateMobileState);
    return () => mediaQuery.removeEventListener("change", updateMobileState);
  }, []);

  const hasSaturdayClasses = blocks.some((block) => block.dayOfWeek === 6);
  const visibleDays = DAY_LABELS
    .map((label, index) => ({ label, dayOfWeek: index + 1 }))
    .filter((day) => day.dayOfWeek <= 5 || hasSaturdayClasses);
  const rangeMinutes = Math.max(30, visibleEndMinutes - START_MINUTES);
  const slotSize = isMobile ? 22 : 30;
  const daySize = 104;
  const contentHeight = (rangeMinutes / 30) * slotSize;
  const horizontalMinWidthPx = (rangeMinutes / 30) * 58;
  const laneLayouts = buildLaneLayouts(blocks);
  const dayBlocksByIndex = visibleDays.map((day) => blocks.filter((block) => block.dayOfWeek === day.dayOfWeek));
  const dayLaneCounts = dayBlocksByIndex.map((dayBlocks) => dayBlocks.reduce((maxLaneCount, block) => {
    const layout = laneLayouts.get(block.id);
    return Math.max(maxLaneCount, layout?.laneCount ?? 1);
  }, 1));
  const fullLaneHeight = Math.max(MIN_LANE_HEIGHT_PX, daySize - OVERLAP_INSET_PX * 2);
  const horizontalLaneHeights = dayLaneCounts.map((laneCount) => (
    laneCount > 1
      ? Math.max(MIN_LANE_HEIGHT_PX, fullLaneHeight * OVERLAP_COMPRESS_RATIO)
      : fullLaneHeight
  ));
  const horizontalDayHeights = dayLaneCounts.map((laneCount, dayIndex) => (
    OVERLAP_INSET_PX * 2 + laneCount * horizontalLaneHeights[dayIndex] + Math.max(0, laneCount - 1) * OVERLAP_GAP_PX
  ));
  const horizontalDayTops: number[] = [];
  let horizontalRunningTop = 0;
  for (const height of horizontalDayHeights)
  {
    horizontalDayTops.push(horizontalRunningTop);
    horizontalRunningTop += height;
  }
  const horizontalContentHeight = horizontalRunningTop;
  const verticalGridTemplateColumns = `${VERTICAL_TIME_AXIS_COLUMN} ${dayLaneCounts.map((laneCount) => `minmax(${VERTICAL_DAY_COLUMN_MIN}, ${laneCount}fr)`).join(" ")}`;
  const now = new Date();
  const todayIndex = now.getDay() === 0 ? 7 : now.getDay();
  const todayVisibleIndex = visibleDays.findIndex((day) => day.dayOfWeek === todayIndex);
  const showNowLine = showCurrentTime && todayVisibleIndex >= 0;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (isHorizontal)
  {
    return (
      <div className="overflow-visible bg-[var(--surface-container-lowest)] p-px">
        <div className={`min-w-0 ${isMobile ? "overflow-x-auto" : "overflow-x-visible"}`}>
          <div style={isMobile ? { minWidth: `${horizontalMinWidthPx}px` } : undefined}>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] grid-rows-[2rem_minmax(0,1fr)] gap-0">
              <div />

              <div className="relative h-8">
                {timeSlots.map((slot) => (
                  <div
                    key={slot}
                    className="absolute top-0 text-[11px] font-medium leading-[14px] text-[var(--on-surface-variant)]"
                    style={getVerticalTimeLabelStyle(slot, timeSlots[0], timeSlots[timeSlots.length - 1], rangeMinutes)}
                  >
                    {slot % 60 === 0 ? minutesToLabel(slot) : ""}
                  </div>
                ))}
              </div>

              <div
                className="relative border border-[var(--outline-variant)] border-r-0 border-t-0 bg-[var(--surface-container-lowest)]"
                style={{ height: `${horizontalContentHeight}px` }}
              >
                {visibleDays.map((day, dayIndex) => (
                  <div
                    key={day.dayOfWeek}
                    className="absolute inset-x-0 flex items-center justify-center border-t border-[var(--outline-variant)] text-center text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]"
                    style={{
                      top: `${horizontalDayTops[dayIndex]}px`,
                      height: `${horizontalDayHeights[dayIndex]}px`,
                    }}
                  >
                    {day.label}
                  </div>
                ))}
              </div>

              <div
                className="relative w-full overflow-visible border border-[var(--outline-variant)] border-t-0 bg-[var(--surface-container-lowest)]"
                style={{ height: `${horizontalContentHeight}px` }}
              >
                {visibleDays.map((day, index) => (
                  <div
                    key={day.dayOfWeek}
                    className="absolute inset-x-0 border-t border-[var(--outline-variant)]"
                    style={{ top: `${horizontalDayTops[index]}px` }}
                  />
                ))}
                {timeSlots.map((slot) => (
                  <div
                    key={slot}
                    className={`absolute inset-y-0 border-l ${slot % 60 === 0 ? "border-[var(--outline-variant)]" : "border-[var(--outline-variant)]/35"}`}
                    style={{ left: `${((slot - START_MINUTES) / rangeMinutes) * 100}%` }}
                  />
                ))}

                {blocks.map((block) => {
                  const layout = laneLayouts.get(block.id) ?? { laneIndex: 0, laneCount: 1 };
                  const dayIndex = visibleDays.findIndex((day) => day.dayOfWeek === block.dayOfWeek);
                  if (dayIndex < 0)
                  {
                    return null;
                  }
                  const dayLaneCount = dayLaneCounts[dayIndex];
                  const blockLeftPercent = ((block.startMinutes - START_MINUTES) / rangeMinutes) * 100;
                  const blockWidthPercent = ((block.endMinutes - block.startMinutes) / rangeMinutes) * 100;
                  const dayLaneHeight = horizontalLaneHeights[dayIndex];
                  const laneHeight = layout.laneCount === 1 && dayLaneCount > 1
                    ? dayLaneCount * dayLaneHeight + (dayLaneCount - 1) * OVERLAP_GAP_PX
                    : dayLaneHeight;
                  const laneTop = horizontalDayTops[dayIndex]
                    + OVERLAP_INSET_PX
                    + layout.laneIndex * (dayLaneHeight + OVERLAP_GAP_PX);

                  return (
                    <TimetableBlockButton
                      key={block.id}
                      block={block}
                      color={blockColorByKey.get(block.shareKey) ?? getCourseColor(block.courseCode)}
                      active={activeShareKey === block.shareKey}
                      available={Boolean(activeShareKey) && activeShareKey !== block.shareKey && (
                        deEmphasisMode === "all"
                        || (deEmphasisMode === "course-only" && Boolean(activeCourseCode) && block.courseCode === activeCourseCode)
                      )}
                      clickable={isPickMode || Boolean(courseCanPickByCode[block.courseCode])}
                      showPickHint={!isPickMode && Boolean(courseCanPickByCode[block.courseCode])}
                      suppressOutline={suppressActiveOutline}
                      dimmed={false}
                      style={{
                        top: `${laneTop}px`,
                        left: `${blockLeftPercent}%`,
                        width: `${Math.max(0, blockWidthPercent)}%`,
                        minWidth: `${MIN_LANE_WIDTH_PX}px`,
                        height: `${laneHeight}px`,
                        zIndex: layout.laneIndex + 1,
                      }}
                      onClick={() => onBlockClick(block)}
                      showAllWeeks={showAllWeeks}
                      showCourseName
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-visible bg-[var(--surface-container-lowest)] p-px">
      <div className="w-full">
        <div className="grid grid-rows-[40px] gap-0" style={{ gridTemplateColumns: verticalGridTemplateColumns }}>
          <div className="border-b border-[var(--outline-variant)]" />
          {visibleDays.map((day, index) => (
            <div
              key={day.dayOfWeek}
              className={`flex items-end justify-center border-b border-l border-[var(--outline-variant)] px-2 pb-2 text-center text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)] ${
                index === visibleDays.length - 1 ? "border-r" : ""
              } ${
                showNowLine && todayVisibleIndex === index ? "bg-[color:rgb(243_243_249_/_0.3)]" : "bg-[var(--surface-container-lowest)]"
              }`}
            >
              {day.label}
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: verticalGridTemplateColumns }}>
          <div className="relative" style={{ height: `${contentHeight}px` }}>
            {timeSlots.map((slot) => (
              <div
                key={slot}
                className={`absolute left-0 w-full pr-3 text-right text-[11px] leading-[14px] ${
                  slot % 60 === 0 ? "font-medium text-[var(--on-surface-variant)]" : "text-[var(--on-surface-variant)]/60"
                }`}
                style={getHorizontalTimeLabelStyle(slot, timeSlots[0], timeSlots[timeSlots.length - 1], rangeMinutes, contentHeight)}
              >
                {slot % 60 === 0 ? minutesToLabel(slot) : ""}
              </div>
            ))}
          </div>

          {visibleDays.map((day, dayIndex) => (
            <div
              key={day.dayOfWeek}
              className={`relative border-l border-[var(--outline-variant)] ${
                dayIndex === visibleDays.length - 1 ? "border-r" : ""
              } ${
                showNowLine && todayVisibleIndex === dayIndex ? "bg-[color:rgb(243_243_249_/_0.3)]" : "bg-[var(--surface-container-lowest)]"
              }`}
              style={{ height: `${contentHeight}px` }}
            >
              {timeSlots.map((slot) => (
                <div
                  key={slot}
                  className={`absolute inset-x-0 border-t ${slot % 60 === 0 ? "border-[var(--outline-variant)]" : "border-[var(--outline-variant)]/35"}`}
                  style={{ top: `${((slot - START_MINUTES) / rangeMinutes) * contentHeight}px` }}
                />
              ))}

              {showNowLine && todayVisibleIndex === dayIndex && nowMinutes >= START_MINUTES && nowMinutes <= visibleEndMinutes ? (
                <div
                  className="absolute inset-x-0 z-20 border-t border-[#ba1a1a]"
                  style={{ top: `${((nowMinutes - START_MINUTES) / rangeMinutes) * contentHeight}px` }}
                >
                  <div className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-[#ba1a1a]" />
                </div>
              ) : null}

              {dayBlocksByIndex[dayIndex].map((block) => {
                const layout = laneLayouts.get(block.id) ?? { laneIndex: 0, laneCount: 1 };
                const dayLaneCount = dayLaneCounts[dayIndex];
                const blockHeight = ((block.endMinutes - block.startMinutes) / rangeMinutes) * contentHeight;
                const laneTop = ((block.startMinutes - START_MINUTES) / rangeMinutes) * contentHeight + OVERLAP_INSET_PX;
                const laneHeight = Math.max(MIN_LANE_HEIGHT_PX, blockHeight - OVERLAP_INSET_PX * 2);
                let laneWidth: string;
                let laneLeft: string;

                if (layout.laneCount === 1 && dayLaneCount > 1)
                {
                  const dayLaneTrackPx = OVERLAP_INSET_PX * 2 + OVERLAP_GAP_PX * (dayLaneCount - 1);
                  const dayLaneTrackWidth = `calc((100% - ${dayLaneTrackPx}px) / ${dayLaneCount})`;
                  const dayCompressedLaneWidth = `calc(${dayLaneTrackWidth} * ${OVERLAP_COMPRESS_RATIO})`;
                  laneWidth = `calc(${dayLaneCount} * ${dayCompressedLaneWidth} + ${(dayLaneCount - 1) * OVERLAP_GAP_PX}px)`;
                  laneLeft = `calc(${OVERLAP_INSET_PX}px + ((100% - ${OVERLAP_INSET_PX * 2}px) - ${laneWidth}) / 2)`;
                }
                else
                {
                  const laneTrackPx = OVERLAP_INSET_PX * 2 + OVERLAP_GAP_PX * (layout.laneCount - 1);
                  const laneTrackWidth = `calc((100% - ${laneTrackPx}px) / ${layout.laneCount})`;
                  laneWidth = layout.laneCount > 1
                    ? `calc(${laneTrackWidth} * ${OVERLAP_COMPRESS_RATIO})`
                    : laneTrackWidth;
                  const laneTrackLeft = `calc(${OVERLAP_INSET_PX}px + ${layout.laneIndex} * (${laneTrackWidth} + ${OVERLAP_GAP_PX}px))`;
                  const laneOffsetWithinTrack = layout.laneCount > 1
                    ? (layout.laneIndex < layout.laneCount / 2 ? "0px" : `calc(${laneTrackWidth} - ${laneWidth})`)
                    : "0px";
                  laneLeft = `calc(${laneTrackLeft} + ${laneOffsetWithinTrack})`;
                }

                return (
                  <TimetableBlockButton
                    key={block.id}
                    block={block}
                    color={blockColorByKey.get(block.shareKey) ?? getCourseColor(block.courseCode)}
                    active={activeShareKey === block.shareKey}
                    available={Boolean(activeShareKey) && activeShareKey !== block.shareKey && (
                      deEmphasisMode === "all"
                      || (deEmphasisMode === "course-only" && Boolean(activeCourseCode) && block.courseCode === activeCourseCode)
                    )}
                    clickable={isPickMode || Boolean(courseCanPickByCode[block.courseCode])}
                    showPickHint={!isPickMode && Boolean(courseCanPickByCode[block.courseCode])}
                    suppressOutline={suppressActiveOutline}
                    dimmed={false}
                    style={{
                      top: `${laneTop}px`,
                      left: laneLeft,
                      width: laneWidth,
                      height: `${laneHeight}px`,
                      zIndex: layout.laneIndex + 1,
                    }}
                    onClick={() => onBlockClick(block)}
                    showAllWeeks={showAllWeeks}
                    showCourseName={false}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimetableBlockButton({
  block,
  color,
  active,
  available,
  clickable,
  showPickHint,
  suppressOutline,
  dimmed,
  style,
  onClick,
  showAllWeeks,
  showCourseName = false,
}: {
  block: TimetableBlock;
  color: string;
  active: boolean;
  available: boolean;
  clickable: boolean;
  showPickHint: boolean;
  suppressOutline: boolean;
  dimmed: boolean;
  style: CSSProperties;
  onClick: () => void;
  showAllWeeks: boolean;
  showCourseName?: boolean;
})
{
  const blockHeightPx = typeof style.height === "number"
    ? style.height
    : Number.parseFloat(String(style.height ?? 0));
  const isTight = Number.isFinite(blockHeightPx) && blockHeightPx <= 58;
  const isVeryTight = Number.isFinite(blockHeightPx) && blockHeightPx <= 38;
  const classGroupLabel = formatClassGroupLabel(block.groupCode);
  const showWeeks = showAllWeeks && !isVeryTight;
  const showMode = block.eventMode && !isTight;
  const showTime = !isVeryTight;

  return (
    <button
      type="button"
      className={`timetable-cell absolute ${active ? "is-active" : ""} ${clickable ? "is-clickable" : ""} ${showPickHint ? "is-group-switchable" : ""} ${suppressOutline ? "no-active-outline" : ""} ${available ? "is-available" : ""} ${isTight ? "is-tight" : ""} ${isVeryTight ? "is-very-tight" : ""}`}
      style={{
        ...style,
        ["--block-bg" as string]: color,
        ["--block-border" as string]: color,
        ["--block-text" as string]: getDarkToneFromHex(color),
        opacity: dimmed ? 0.5 : undefined,
      }}
      onClick={onClick}
      title={`${block.courseCode} ${formatClassGroupLabel(block.groupCode)}
${formatTimeRange(minutesToTimeString(block.startMinutes), minutesToTimeString(block.endMinutes))}${block.weekLabel ? `
${block.weekLabel}` : ""}${showMode ? `
${block.eventMode}` : ""}`}
    >
      <div className="timetable-cell__content">
        <div className="timetable-cell__module">
          {showCourseName && block.courseName ? (
            <span className="inline-flex min-w-0 max-w-full items-baseline gap-1">
              <span className="shrink-0">{block.courseCode}</span>
              <span className="min-w-0 truncate font-medium">{block.courseName}</span>
            </span>
          ) : (
            block.courseCode
          )}
        </div>

        <div className="timetable-cell__meta">{classGroupLabel}</div>

        {showTime ? (
          <div className="timetable-cell__time">
            {formatTimeRange(minutesToTimeString(block.startMinutes), minutesToTimeString(block.endMinutes))}
          </div>
        ) : null}

        {showWeeks && block.weekLabel ? (
          <div className="timetable-cell__week">{block.weekLabel}</div>
        ) : null}

        {showMode ? (
          <div className="timetable-cell__mode">{block.eventMode}</div>
        ) : null}
      </div>
    </button>
  );
}
