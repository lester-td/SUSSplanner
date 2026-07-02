"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CalendarIcon,
  ColumnsIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  ListIcon,
  RowsIcon,
  SchoolIcon,
  UploadIcon,
  XIcon,
} from "@/components/planner/icons";
import { ActionButton, IconButton } from "@/components/ui/actions";
import { Modal } from "@/components/ui/modal";
import { ClassScheduleModalContent } from "@/components/timetable/class-schedule-modal-content";
import { ExamCalendar, ExamCalendarOverviewRail } from "@/components/timetable/exam-calendar";
import { SelectorRail } from "@/components/timetable/selector-rail";
import { TimetableAlerts } from "@/components/timetable/timetable-alerts";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { exportPngDataUrlToPdf } from "@/lib/export/pdf-client";
import { exportElementToPng, renderElementToPngDataUrl } from "@/lib/export/png";
import {
  buildTimeSlots,
  formatClassGroupLabel,
} from "@/lib/timetable/date-utils";
import {
  importSharedTimetableToLocalStorage,
  loadSavedTimetable,
} from "@/lib/timetable/local-storage";
import { encodeShareUrlState } from "@/lib/timetable/share-url";
import {
  buildExamCards,
  buildSelectableWeeks,
  buildSelectedCourseCards,
  buildTimetableBlocks,
  buildWeekOptions,
  formatExamCalendarOverviewSubtitle,
  getLatestEndMinutes,
} from "@/lib/timetable/timetable-utils";
import type {
  SharedTimetableState,
  SemesterRecord,
  TimetableData,
  TimetableOrientation,
} from "@/lib/timetable/types";

function formatAcademicYearShort(academicYear: string)
{
  const match = academicYear.trim().match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (!match)
  {
    return academicYear.trim();
  }

  return `${match[1].slice(-2)}/${match[2].slice(-2)}`;
}

function formatSemesterRailTag(semesterNo: SemesterRecord["semesterNo"])
{
  if (semesterNo === 3)
  {
    return "Special";
  }

  return `Sem ${semesterNo}`;
}

export function ShareClient({
  sharedState,
  timetable,
}: {
  sharedState: SharedTimetableState;
  timetable: TimetableData;
})
{
  const router = useRouter();
  const savedLocalState = useMemo(() => loadSavedTimetable(), []);
  const [orientation, setOrientation] = useState<TimetableOrientation>(() => savedLocalState?.orientation ?? "vertical");
  const [viewMode, setViewMode] = useState<"class" | "exam">("class");
  const [selectedWeekId, setSelectedWeekId] = useState<number | "all">("all");
  const [importOpen, setImportOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [scheduleCourse, setScheduleCourse] = useState<ReturnType<typeof buildSelectedCourseCards>[number] | null>(null);
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);
  const exportCaptureRef = useRef<HTMLDivElement | null>(null);
  const selectedSemester = timetable.semester;

  const selectedCards = useMemo(() => buildSelectedCourseCards(timetable), [timetable]);
  const totalCredits = useMemo(
    () => selectedCards.reduce((sum, record) => sum + (record.creditUnits ?? 0), 0),
    [selectedCards],
  );
  const colorByShareKey = useMemo(
    () => new Map(selectedCards.map((card) => [card.shareKey, card.color])),
    [selectedCards],
  );
  const visibleEvents = useMemo(
    () => timetable.events.filter((event) => !hiddenClasses.includes(event.shareKey)),
    [hiddenClasses, timetable.events],
  );
  const blocks = useMemo(() => buildTimetableBlocks(visibleEvents, selectedWeekId), [selectedWeekId, visibleEvents]);
  const examCards = useMemo(
    () => buildExamCards(visibleEvents).filter((card) => !hiddenClasses.includes(card.shareKey)),
    [hiddenClasses, visibleEvents],
  );
  const examOverviewSubtitle = formatExamCalendarOverviewSubtitle(timetable.semesterWeeks) ?? "No exam period loaded";
  const visibleEndMinutes = getLatestEndMinutes(blocks);
  const timeSlots = buildTimeSlots(visibleEndMinutes);
  const selectableWeeks = buildSelectableWeeks(timetable.semesterWeeks, timetable.events);
  const weekItems = buildWeekOptions(selectableWeeks);
  const semesterRailSubtitle = selectedSemester
    ? `AY${formatAcademicYearShort(selectedSemester.academicYear)} • ${formatSemesterRailTag(selectedSemester.semesterNo)}`
    : "No semester loaded";

  const nextViewToggle = viewMode === "class"
    ? { label: "Exam Cal", icon: <CalendarIcon className="h-4 w-4" />, onClick: () => setViewMode("exam") }
    : { label: "Timetable", icon: <GridIcon className="h-4 w-4" />, onClick: () => setViewMode("class") };
  const nextOrientationToggle = orientation === "horizontal"
    ? { label: "Vertical", icon: <ColumnsIcon className="h-4 w-4" />, onClick: () => setOrientation("vertical") }
    : { label: "Horizontal", icon: <RowsIcon className="h-4 w-4" />, onClick: () => setOrientation("horizontal") };

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

  function toggleHidden(shareKey: string)
  {
    setHiddenClasses((current) => current.includes(shareKey)
      ? current.filter((value) => value !== shareKey)
      : [...current, shareKey]);
  }

  async function handlePngExport()
  {
    if (!exportCaptureRef.current)
    {
      return;
    }

    await exportElementToPng(exportCaptureRef.current, `suss-shared-timetable-${sharedState.semesterId}.png`);
  }

  async function handlePdfExport()
  {
    if (!exportCaptureRef.current)
    {
      return;
    }

    const pngDataUrl = await renderElementToPngDataUrl(exportCaptureRef.current);
    await exportPngDataUrlToPdf(pngDataUrl, `suss-shared-${sharedState.semesterId}.pdf`);
  }

  useEffect(() => {
    if (!downloadOpen)
    {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element))
      {
        return;
      }

      if (!target.closest("[data-download-popover-root]"))
      {
        setDownloadOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [downloadOpen]);

  function handleImport()
  {
    const current = loadSavedTimetable();
    importSharedTimetableToLocalStorage(sharedState, current);
    setImportOpen(false);
    router.push("/timetable");
  }

  return (
    <>
      <div ref={exportCaptureRef} className={`timetable-page flex min-h-0 flex-1 flex-col ${orientation === "horizontal" ? "md:flex-col" : "md:flex-row"}`}>
        <section className={`flex min-h-0 w-full flex-1 flex-col ${orientation === "horizontal" ? "md:w-full" : "md:w-[70%]"}`}>
          <div className="timetable-toolbar elev-1 flex flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
            <div className="flex flex-col gap-3 border-b border-[var(--outline-variant)]/40 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 w-full text-center md:w-auto md:text-left">
                <div className="text-[14px] font-semibold tracking-[0.08em] text-[var(--on-surface-variant)] sm:text-[16px]">
                  Shared Timetable
                </div>
              </div>

              <div className="min-w-0 flex-1 text-center md:text-center">
                <div className="truncate text-[16px] font-semibold leading-5 text-[var(--on-surface)] sm:text-[18px] sm:leading-6">
                  {selectedSemester?.semesterName ?? "No semester loaded"}
                </div>
                <div className="mt-0.5 text-[11px] font-medium leading-4 text-[var(--on-surface-variant)] sm:text-[12px]">
                  {semesterRailSubtitle}
                </div>
              </div>

              <div className="flex w-full gap-1.5 md:w-auto md:min-w-[18rem] md:justify-end">
                <div className="min-w-0 flex-1">
                  <ActionButton variant="primary" icon={<UploadIcon className="h-4 w-4" />} label="Import" onClick={() => setImportOpen(true)} stretch />
                </div>
                <div className="min-w-0 flex-1">
                  <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => router.push("/timetable")} stretch />
                </div>
              </div>
            </div>

            {viewMode === "exam" ? (
              <ExamCalendarOverviewRail subtitle={examOverviewSubtitle} />
            ) : (
              <SelectorRail
                items={weekItems}
                selectedId={String(selectedWeekId)}
                onSelect={(id) => setSelectedWeekId(id === "all" ? "all" : Number(id))}
                onPrev={() => {
                  const values: Array<number | "all"> = ["all", ...selectableWeeks.map((week) => week.weekId)];
                  const index = values.findIndex((value) => value === selectedWeekId);
                  if (index > 0)
                  {
                    setSelectedWeekId(values[index - 1]);
                  }
                }}
                onNext={() => {
                  const values: Array<number | "all"> = ["all", ...selectableWeeks.map((week) => week.weekId)];
                  const index = values.findIndex((value) => value === selectedWeekId);
                  if (index >= 0 && index < values.length - 1)
                  {
                    setSelectedWeekId(values[index + 1]);
                  }
                }}
                variant="week"
                subtle
              />
            )}
          </div>

          {timetable.unresolvedSelections.length > 0 ? (
            <div className="bg-[var(--surface-container-lowest)] px-3 pt-2.5">
              <div className="rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-2.5 py-1.5 text-[12px] font-medium leading-4 text-[var(--error)]">
                Some class identifiers in this shared link no longer match the current database.
              </div>
            </div>
          ) : null}

          <TimetableAlerts
            events={timetable.events}
            clashes={timetable.clashes}
          />

          <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)] px-3 pb-3 pt-1">
            <div className={`min-h-0 flex-1 ${viewMode === "class" ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}>
              {viewMode === "class" ? (
                <TimetableCanvas
                  blocks={blocks}
                  blockColorByKey={colorByShareKey}
                  isHorizontal={orientation === "horizontal"}
                  timeSlots={timeSlots}
                  visibleEndMinutes={visibleEndMinutes}
                  showAllWeeks={selectedWeekId === "all"}
                  dayDateByDay={{}}
                  activeShareKey={null}
                  deEmphasisMode="none"
                  activeCourseCode={null}
                  courseCanPickByCode={{}}
                  isPickMode={false}
                  suppressActiveOutline
                  onBlockClick={() => undefined}
                  showCurrentTime={false}
                />
              ) : (
                <ExamCalendar cards={examCards} colorByShareKey={colorByShareKey} />
              )}
            </div>
          </div>
        </section>

        <aside className={`timetable-side-panel flex min-h-0 w-full flex-col border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] ${orientation === "horizontal" ? "md:w-full md:border-l-0 md:border-t" : "md:w-[30%] md:border-l md:border-t-0"}`}>
          <div className="flex h-14 shrink-0 items-center justify-between bg-[var(--surface-container-lowest)] px-3">
            <h3 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Shared Courses</h3>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-3 pb-3 pt-1.5">
            <div className="flex w-full gap-1.5">
              <div className="min-w-0 flex-1">
                <ActionButton variant="ghost" icon={nextOrientationToggle.icon} label={nextOrientationToggle.label} onClick={nextOrientationToggle.onClick} stretch />
              </div>
              <div className="min-w-0 flex-1">
                <ActionButton variant="ghost" icon={nextViewToggle.icon} label={nextViewToggle.label} onClick={nextViewToggle.onClick} stretch />
              </div>
              <div className="relative min-w-0 flex-1" data-download-popover-root>
                <ActionButton
                  variant="ghost"
                  icon={<DownloadIcon className="h-4 w-4" />}
                  label="Download"
                  onClick={() => setDownloadOpen((current) => !current)}
                  stretch
                />
                {downloadOpen ? (
                  <div className="elev-3 absolute left-0 top-full z-30 mt-1.5 w-full min-w-[9.5rem] rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
                    />
                    <div className="grid grid-cols-1 gap-1.5">
                      <ActionButton variant="ghost" icon={<DownloadIcon className="h-4 w-4" />} label="PDF" onClick={() => void handlePdfExport()} />
                      <ActionButton variant="ghost" icon={<CalendarIcon className="h-4 w-4" />} label="ICS" onClick={() => triggerDownload("/api/export/ics", `suss-shared-${sharedState.semesterId}.ics`)} />
                      <ActionButton variant="ghost" icon={<GridIcon className="h-4 w-4" />} label="PNG" onClick={() => void handlePngExport()} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-container-lowest)] px-3 pb-3">
            <div className={orientation === "horizontal" ? "space-y-2 md:grid md:auto-rows-fr md:grid-cols-2 md:items-stretch md:gap-2 md:space-y-0 lg:grid-cols-3 xl:grid-cols-4" : "space-y-2"}>
              {selectedCards.map((record) => {
                const isHidden = hiddenClasses.includes(record.shareKey);
                const recordColor = colorByShareKey.get(record.shareKey) ?? record.color;
                return (
                  <article
                    key={record.shareKey}
                    className={`timetable-selected-card elev-1 group relative overflow-hidden rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2 py-1.5 transition-[box-shadow] hover:shadow-md sm:px-2.5 sm:py-2 ${
                      orientation === "horizontal" ? "md:h-full" : ""
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1 rounded-l-[0.5rem]" style={{ backgroundColor: recordColor }} />

                    <div className="pl-1.5 pr-11">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div
                            aria-hidden="true"
                            className="relative z-30 mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-black/10"
                            style={{ backgroundColor: recordColor }}
                          />
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                            <Link
                              href={`/courses/${record.courseCode}`}
                              className="inline min-w-0 text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            >
                              <span className="text-[15px] font-extrabold leading-5">{record.courseCode}</span>{" "}
                              <span className="text-[15px] font-normal leading-5">
                                {record.courseName ?? "Untitled course"}
                              </span>
                            </Link>
                          </div>
                        </div>
                        <div className="mt-1 space-y-1 text-[13px] font-medium leading-5 text-[var(--on-surface-variant)]">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <ListIcon className="h-4 w-4 shrink-0" />
                            <span className="shrink-0 font-semibold text-[var(--on-surface)]">Group:</span>
                            <span className="truncate">{formatClassGroupLabel(record.groupCode)}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {record.examDateLabel === "No Exam" || record.examDateLabel === "ECA" ? (
                              <span className="truncate font-bold text-[var(--on-surface)]">{record.examDateLabel}</span>
                            ) : (
                              <>
                                <span className="shrink-0 font-semibold text-[var(--on-surface)]">Exam:</span>
                                <span className="truncate">{record.examDateLabel}{record.examTimeLabel ? `, ${record.examTimeLabel}` : ""}</span>
                              </>
                            )}
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <SchoolIcon className="h-4 w-4 shrink-0" />
                            <span className="shrink-0 font-semibold text-[var(--on-surface)]">Credit Units:</span>
                            <span>{record.creditUnits?.toFixed(1) ?? "0.0"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="absolute right-1.5 top-1.5 flex flex-col items-center gap-0.5">
                        <IconButton label="View class schedule" onClick={() => setScheduleCourse(record)} className="!h-7 !w-7 sm:!h-8 sm:!w-8">
                          <CalendarIcon className="!h-4 !w-4 sm:!h-5 sm:!w-5" />
                        </IconButton>
                        <IconButton label={isHidden ? "Show course" : "Hide course"} onClick={() => toggleHidden(record.shareKey)} className="!h-7 !w-7 sm:!h-8 sm:!w-8">
                          {isHidden ? <EyeOffIcon className="!h-4 !w-4 sm:!h-5 sm:!w-5" /> : <EyeIcon className="!h-4 !w-4 sm:!h-5 sm:!w-5" />}
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`border-t border-[var(--brand-divider)] pt-3 ${orientation === "horizontal" ? "mt-2.5" : "mt-2"}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 text-left text-[11px] font-semibold leading-4 text-[var(--on-surface)] sm:text-[12px]">
                    <div className="text-[var(--on-surface-variant)]">Total Credit Units</div>
                    <div className="mt-1 text-[16px] font-bold leading-6 text-[var(--primary)] sm:text-[18px]">{totalCredits.toFixed(1)} CU</div>
                  </div>
                  <div aria-hidden="true" className="h-10 w-px bg-[var(--brand-divider)]" />
                  <div className="min-w-0 text-left text-[11px] font-semibold leading-4 text-[var(--on-surface)] sm:text-[12px]">
                    <div className="text-[var(--on-surface-variant)]">Total Courses</div>
                    <div className="mt-1 text-[16px] font-bold leading-6 tabular-nums text-[var(--primary)] sm:text-[18px]">{selectedCards.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={importOpen}
        title="Import shared timetable"
        description="Importing will replace the saved timetable for this semester. This cannot be undone."
        onClose={() => setImportOpen(false)}
        footer={(
          <>
            <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => setImportOpen(false)} />
            <ActionButton variant="primary" icon={<UploadIcon className="h-4 w-4" />} label="Confirm import" onClick={handleImport} />
          </>
        )}
      >
        <div className="h-2" />
      </Modal>

      <Modal
        open={Boolean(scheduleCourse)}
        title="Class Schedule"
        onClose={() => setScheduleCourse(null)}
        showCloseButton
        maxWidthClassName="max-w-4xl"
        bodyClassName="pb-5"
      >
        {scheduleCourse ? (
          <ClassScheduleModalContent
            courseCode={scheduleCourse.courseCode}
            courseName={scheduleCourse.courseName}
            classGroupLabel={formatClassGroupLabel(scheduleCourse.groupCode)}
            events={scheduleCourse.events}
            selectedSemesterId={selectedSemester?.semesterId ?? null}
          />
        ) : null}
      </Modal>
    </>
  );
}
