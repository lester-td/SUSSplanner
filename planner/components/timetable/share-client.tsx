"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CalendarIcon,
  ColumnsIcon,
  DownloadIcon,
  GridIcon,
  RowsIcon,
  ShareIcon,
  XIcon,
} from "@/components/planner/icons";
import { ActionButton } from "@/components/ui/actions";
import { Modal } from "@/components/ui/modal";
import { SelectorRail } from "@/components/timetable/selector-rail";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { exportElementToPng } from "@/lib/export/png";
import {
  buildTimeSlots,
  formatClassGroupLabel,
  formatEventDate,
  formatTimeRange,
} from "@/lib/timetable/date-utils";
import {
  importSharedTimetableToLocalStorage,
  loadSavedTimetable,
} from "@/lib/timetable/local-storage";
import { encodeShareUrlState } from "@/lib/timetable/share-url";
import {
  buildExamCards,
  buildSelectedCourseCards,
  buildTimetableBlocks,
  buildWeekOptions,
  getCourseColorMap,
  getLatestEndMinutes,
} from "@/lib/timetable/timetable-utils";
import type {
  SharedTimetableState,
  TimetableData,
  TimetableOrientation,
} from "@/lib/timetable/types";

export function ShareClient({
  sharedState,
  timetable,
}: {
  sharedState: SharedTimetableState;
  timetable: TimetableData;
})
{
  const router = useRouter();
  const [orientation, setOrientation] = useState<TimetableOrientation>("horizontal");
  const [viewMode, setViewMode] = useState<"class" | "exam">("class");
  const [selectedWeekId, setSelectedWeekId] = useState<number | "all">("all");
  const [importOpen, setImportOpen] = useState(false);
  const [hasSavedLocalState, setHasSavedLocalState] = useState(() => Boolean(loadSavedTimetable()));
  const captureRef = useRef<HTMLDivElement | null>(null);

  const selectedCards = useMemo(() => buildSelectedCourseCards(timetable), [timetable]);
  const colorByShareKey = useMemo(
    () => new Map(selectedCards.map((card) => [card.shareKey, card.color])),
    [selectedCards],
  );
  const visibleEvents = timetable.events;
  const blocks = useMemo(() => buildTimetableBlocks(visibleEvents, selectedWeekId), [selectedWeekId, visibleEvents]);
  const examCards = useMemo(() => buildExamCards(visibleEvents), [visibleEvents]);
  const visibleEndMinutes = getLatestEndMinutes(blocks);
  const timeSlots = buildTimeSlots(visibleEndMinutes);
  const weekItems = buildWeekOptions(timetable.semesterWeeks);

  const nextViewToggle = viewMode === "class"
    ? { label: "Exam Cal", icon: <CalendarIcon className="h-4 w-4" />, onClick: () => setViewMode("exam") }
    : { label: "Timetable", icon: <GridIcon className="h-4 w-4" />, onClick: () => setViewMode("class") };
  const nextOrientationToggle = orientation === "horizontal"
    ? { label: "Vertical", icon: <RowsIcon className="h-4 w-4" />, onClick: () => setOrientation("vertical") }
    : { label: "Horizontal", icon: <ColumnsIcon className="h-4 w-4" />, onClick: () => setOrientation("horizontal") };

  function buildShareQuery()
  {
    return encodeShareUrlState(sharedState).split("?")[1] ?? "";
  }

  function triggerDownload(path: string, fileName: string)
  {
    const anchor = document.createElement("a");
    anchor.href = `${path}?${buildShareQuery()}`;
    anchor.download = fileName;
    anchor.click();
  }

  async function handlePngExport()
  {
    if (!captureRef.current)
    {
      return;
    }

    await exportElementToPng(captureRef.current, `suss-shared-timetable-${sharedState.semesterId}.png`);
  }

  function handleImport()
  {
    const current = loadSavedTimetable();
    importSharedTimetableToLocalStorage(sharedState, current);
    setImportOpen(false);
    router.push("/planner");
  }

  return (
    <>
      <div className="border-b border-[var(--outline-variant)] bg-[var(--primary-fixed)] px-4 py-3 md:px-[16px]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-[12px] font-semibold leading-4 text-[var(--primary)]">
            Shared timetable view. Your saved local planner is unchanged until you choose to import this selection.
          </p>
          <div className="flex flex-wrap gap-2">
            {hasSavedLocalState ? (
              <ActionButton variant="ghost" icon={<ShareIcon className="h-4 w-4" />} label="Go back to saved timetable" onClick={() => router.push("/planner")} />
            ) : null}
            <ActionButton variant="primary" icon={<ShareIcon className="h-4 w-4" />} label="Import timetable" onClick={() => setImportOpen(true)} />
          </div>
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${orientation === "horizontal" ? "md:flex-col" : "md:flex-row"}`}>
        <section className={`flex min-h-0 w-full flex-1 flex-col ${orientation === "horizontal" ? "md:w-full" : "md:w-[70%]"}`}>
          <div className="flex flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
            <SelectorRail
              items={weekItems}
              selectedId={String(selectedWeekId)}
              onSelect={(id) => setSelectedWeekId(id === "all" ? "all" : Number(id))}
              onPrev={() => {
                const values: Array<number | "all"> = ["all", ...timetable.semesterWeeks.map((week) => week.weekId)];
                const index = values.findIndex((value) => value === selectedWeekId);
                if (index > 0)
                {
                  setSelectedWeekId(values[index - 1]);
                }
              }}
              onNext={() => {
                const values: Array<number | "all"> = ["all", ...timetable.semesterWeeks.map((week) => week.weekId)];
                const index = values.findIndex((value) => value === selectedWeekId);
                if (index >= 0 && index < values.length - 1)
                {
                  setSelectedWeekId(values[index + 1]);
                }
              }}
              variant="week"
              subtle
            />
          </div>

          <div className="bg-[var(--surface-container-lowest)] px-[16px] pt-3">
            {timetable.unresolvedSelections.length > 0 ? (
              <div className="mb-3 rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-3 py-2 text-[12px] font-medium leading-4 text-[var(--error)]">
                Some class identifiers in this shared link no longer match the current database.
              </div>
            ) : null}
            {timetable.clashes.length > 0 ? (
              <div className="mb-3 rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-4 py-3">
                <p className="text-[12px] font-semibold leading-4 text-[var(--error)]">Detected timetable clashes</p>
                <div className="mt-2 space-y-2 text-[11px] leading-[14px] text-[var(--on-surface)]">
                  {timetable.clashes.slice(0, 4).map((clash) => (
                    <div key={clash.clashKey}>
                      <div className="font-semibold">{formatEventDate(clash.eventDate)} · {formatTimeRange(clash.startTime, clash.endTime)}</div>
                      <div className="text-[var(--on-surface-variant)]">{clash.events.map((event) => `${event.courseCode} ${formatClassGroupLabel(event.groupCode)}`).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)] px-[16px] pb-[16px] pt-1">
            <div ref={captureRef} className={`min-h-0 flex-1 ${viewMode === "class" ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}>
              {viewMode === "class" ? (
                <TimetableCanvas
                  blocks={blocks}
                  blockColorByKey={colorByShareKey}
                  isHorizontal={orientation === "horizontal"}
                  timeSlots={timeSlots}
                  visibleEndMinutes={visibleEndMinutes}
                  showAllWeeks={selectedWeekId === "all"}
                  activeShareKey={null}
                  onBlockClick={() => undefined}
                  showCurrentTime={false}
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {examCards.map((card) => (
                    <article key={card.id} className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: colorByShareKey.get(card.shareKey) ?? "#3556b8" }} />
                        <span className="text-[12px] font-bold leading-4 text-[var(--on-surface)]">{card.courseCode} · {formatClassGroupLabel(card.groupCode)}</span>
                      </div>
                      <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">{card.courseName ?? "Untitled course"}</p>
                      <p className="mt-3 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{formatEventDate(card.eventDate)}</p>
                      <p className="text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{formatTimeRange(card.startTime, card.endTime)}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className={`flex min-h-0 w-full flex-col border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] ${orientation === "horizontal" ? "md:w-full md:border-l-0 md:border-t" : "md:w-[30%] md:border-l md:border-t-0"}`}>
          <div className="flex h-16 shrink-0 items-center justify-between bg-[var(--surface-container-lowest)] px-[16px]">
            <h3 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Shared Courses</h3>
            <span className="rounded-[0.75rem] bg-[color:rgb(0_48_93_/_0.1)] px-2 py-1 text-[11px] font-medium leading-[14px] text-[var(--primary)]">
              {selectedCards.length} Selected
            </span>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-[16px] pb-[16px] pt-2">
            <div className={`grid gap-2 ${orientation === "horizontal" ? "grid-cols-4" : "grid-cols-2"}`}>
              <ActionButton variant="ghost" icon={nextOrientationToggle.icon} label={nextOrientationToggle.label} onClick={nextOrientationToggle.onClick} />
              <ActionButton variant="ghost" icon={nextViewToggle.icon} label={nextViewToggle.label} onClick={nextViewToggle.onClick} />
              <ActionButton variant="ghost" icon={<DownloadIcon className="h-4 w-4" />} label="PDF" onClick={() => triggerDownload("/api/export/pdf", `suss-shared-${sharedState.semesterId}.pdf`)} />
              <ActionButton variant="ghost" icon={<CalendarIcon className="h-4 w-4" />} label="ICS" onClick={() => triggerDownload("/api/export/ics", `suss-shared-${sharedState.semesterId}.ics`)} />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <ActionButton variant="ghost" icon={<GridIcon className="h-4 w-4" />} label="PNG" onClick={() => void handlePngExport()} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-container-lowest)] px-[16px] pb-[16px]">
            <div className={orientation === "horizontal" ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "space-y-3"}>
              {selectedCards.map((record) => (
                <article key={record.shareKey} className="group relative overflow-hidden rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 shadow-sm">
                  <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: record.color }} />
                  <div className="pl-2">
                    <h4 className="truncate text-[12px] font-bold leading-4 text-[var(--on-surface)]">{record.courseCode}</h4>
                    <p className="mt-1 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{record.courseName ?? "Untitled course"}</p>
                    <p className="mt-1 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{formatClassGroupLabel(record.groupCode)} · {record.creditUnits?.toFixed(1) ?? "0.0"} CU</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={importOpen}
        title="Import shared timetable"
        description="Importing will replace your currently saved local planner state. This cannot be undone automatically."
        onClose={() => setImportOpen(false)}
        footer={(
          <>
            <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => setImportOpen(false)} />
            <ActionButton variant="primary" icon={<ShareIcon className="h-4 w-4" />} label="Confirm import" onClick={handleImport} />
          </>
        )}
      />
    </>
  );
}
