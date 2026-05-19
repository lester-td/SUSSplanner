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

  const sorted = [...cluster].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes)
    {
      return left.startMinutes - right.startMinutes;
    }
    return left.endMinutes - right.endMinutes;
  });
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
    const sorted = [...dayBlocks].sort((left, right) => {
      if (left.startMinutes !== right.startMinutes)
      {
        return left.startMinutes - right.startMinutes;
      }
      return left.endMinutes - right.endMinutes;
    });

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
  const horizontalMinWidthPx = (rangeMinutes / 30) * (isMobile ? 58 : 74);
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
      <div className="overflow-hidden bg-[var(--surface-container-lowest)] p-px">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
          <div className="pt-10">
            {visibleDays.map((day, dayIndex) => (
              <div
                key={day.dayOfWeek}
                className="flex items-start justify-end pt-2 pr-3 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]"
                style={{ height: `${horizontalDayHeights[dayIndex]}px` }}
              >
                {day.label}
              </div>
            ))}
          </div>

          <div className="min-w-0 overflow-x-auto">
            <div style={{ minWidth: `${horizontalMinWidthPx}px` }}>
              <div className="relative h-10">
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
                className="relative w-full overflow-hidden border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
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
                      color={blockColorByKey.get(block.shareKey) ?? "#3556b8"}
                      active={activeShareKey === block.shareKey}
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
                      showWeekLabel={showAllWeeks}
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
    <div className="overflow-hidden bg-[var(--surface-container-lowest)] p-px">
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
                    color={blockColorByKey.get(block.shareKey) ?? "#3556b8"}
                    active={activeShareKey === block.shareKey}
                    dimmed={false}
                    style={{
                      top: `${laneTop}px`,
                      left: laneLeft,
                      width: laneWidth,
                      height: `${laneHeight}px`,
                      zIndex: layout.laneIndex + 1,
                    }}
                    onClick={() => onBlockClick(block)}
                    showWeekLabel={showAllWeeks}
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
  dimmed,
  style,
  onClick,
  showWeekLabel,
}: {
  block: TimetableBlock;
  color: string;
  active: boolean;
  dimmed: boolean;
  style: CSSProperties;
  onClick: () => void;
  showWeekLabel: boolean;
})
{
  const blockHeightPx = typeof style.height === "number"
    ? style.height
    : Number.parseFloat(String(style.height ?? 0));
  const isTight = Number.isFinite(blockHeightPx) && blockHeightPx <= 60;

  return (
    <button
      type="button"
      className={`absolute z-10 origin-center overflow-hidden rounded-[0.375rem] border border-[color:var(--block-outline)] bg-[color:var(--block-bg)] text-left text-[color:var(--block-text)] transition-[box-shadow,opacity] ${
        active ? "ring-2 ring-[var(--primary)] shadow-md" : "shadow-sm"
      }`}
      style={{
        ...style,
        ["--block-bg" as string]: color,
        ["--block-outline" as string]: "rgba(0, 0, 0, 0.12)",
        ["--block-text" as string]: "#ffffff",
        opacity: dimmed ? 0.5 : 1,
        padding: isTight ? "0.25rem" : "0.375rem",
      }}
      onClick={onClick}
    >
      <div className="flex h-full min-h-0 flex-col items-start justify-start gap-0.5 overflow-auto text-left">
        <p className="w-full break-words text-[clamp(9px,1.8vw,12px)] font-bold leading-tight">{block.courseCode}</p>
        <p className="w-full break-words text-[clamp(8px,1.6vw,11px)] leading-tight opacity-90">{formatClassGroupLabel(block.groupCode)}</p>
        <p className="w-full break-words text-[clamp(8px,1.6vw,11px)] leading-tight opacity-80">
          {formatTimeRange(minutesToTimeString(block.startMinutes), minutesToTimeString(block.endMinutes))}
        </p>
        {showWeekLabel ? (
          <p className="w-full break-words text-[clamp(8px,1.6vw,11px)] leading-tight opacity-80">
            {block.weekLabel}
          </p>
        ) : null}
        {block.venue ? (
          <p className="mt-0.5 flex w-full items-start gap-1 break-words text-[clamp(8px,1.6vw,11px)] leading-tight opacity-80">
            <PinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{block.venue}</span>
          </p>
        ) : null}
      </div>
    </button>
  );
}
