"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  BookIcon,
  CalendarIcon,
  ColumnsIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  RefreshIcon,
  RowsIcon,
  SchoolIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
  XIcon,
} from "@/components/planner/icons";
import { ActionButton, IconButton } from "@/components/ui/actions";
import { Modal } from "@/components/ui/modal";
import { ClassScheduleModalContent } from "@/components/timetable/class-schedule-modal-content";
import { SelectorRail } from "@/components/timetable/selector-rail";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { exportElementToPng } from "@/lib/export/png";
import {
  buildTimeSlots,
  formatClassGroupLabel,
  formatEventDate,
  formatTimeRange,
  getCurrentWeekChip,
} from "@/lib/timetable/date-utils";
import {
  loadSavedTimetable,
  saveTimetableToLocalStorage,
} from "@/lib/timetable/local-storage";
import {
  buildSharedClassIdentifier,
  encodeShareUrlState,
} from "@/lib/timetable/share-url";
import {
  buildExamCards,
  buildSelectedCourseCards,
  buildTimetableBlocks,
  buildWeekOptions,
  getLatestEndMinutes,
} from "@/lib/timetable/timetable-utils";
import type {
  CourseClassRecord,
  CourseSearchResult,
  PlannerStorageState,
  SemesterRecord,
  SemesterWeekRecord,
  SharedClassIdentifier,
  TimetableData,
  TimetableEventRecord,
  TimetableOrientation,
} from "@/lib/timetable/types";

type SemesterOption = SemesterRecord & {
  weeks: SemesterWeekRecord[];
};

type SearchResponse = {
  courses: CourseSearchResult[];
};

type ClassesResponse = {
  classes: CourseClassRecord[];
};

type ClassPickerCourse = Pick<CourseSearchResult, "courseCode" | "courseName">;

const GROUP_PREVIEW_COLORS = [
  "#3556b8",
  "#cf5b22",
  "#008b7b",
  "#8f4bc4",
  "#7a8f2d",
  "#c14953",
  "#2e6f95",
  "#a76318",
];

function buildShareQuery(semesterId: number, selectedClasses: SharedClassIdentifier[])
{
  return encodeShareUrlState({ semesterId, selectedClasses }).split("?")[1] ?? "";
}

function buildPreviewEvents(classes: CourseClassRecord[]): TimetableEventRecord[]
{
  return classes.flatMap((group) => {
    const shareKey = buildSharedClassIdentifier({
      courseCode: group.courseCode,
      scheduleType: group.scheduleType,
      groupCodeType: group.groupCodeType,
      groupCode: group.groupCode,
    });

    return group.events.map((event) => ({
      ...event,
      courseName: group.courseName,
      schoolName: group.schoolName,
      shareKey,
    } satisfies TimetableEventRecord));
  });
}

function defaultStorageState(
  semesters: SemesterOption[],
  currentSemesterId: number,
  currentWeekId: number | null,
): PlannerStorageState
{
  const semesterId = currentSemesterId || semesters[0]?.semesterId || 0;
  return {
    semesterId,
    selectedClasses: [],
    hiddenClasses: [],
    selectedWeekId: currentWeekId && currentSemesterId === semesterId ? currentWeekId : "all",
    orientation: "vertical",
    viewMode: "class",
  };
}

function replaceSelectionForCourse(
  current: SharedClassIdentifier[],
  incoming: SharedClassIdentifier,
)
{
  return [
    ...current.filter((item) => item.courseCode !== incoming.courseCode),
    incoming,
  ];
}

function sortSelectedCards(
  cards: ReturnType<typeof buildSelectedCourseCards>,
  sortMode: "code" | "exam",
)
{
  return [...cards].sort((left, right) => {
    if (sortMode === "exam")
    {
      const leftExam = left.events.find((event) => event.eventKind === "EXAM");
      const rightExam = right.events.find((event) => event.eventKind === "EXAM");
      const leftKey = leftExam ? `${leftExam.eventDate}${leftExam.startTime}` : "99999999";
      const rightKey = rightExam ? `${rightExam.eventDate}${rightExam.startTime}` : "99999999";
      const examDiff = leftKey.localeCompare(rightKey);
      if (examDiff !== 0)
      {
        return examDiff;
      }
    }

    return left.courseCode.localeCompare(right.courseCode);
  });
}

export function PlannerClient({
  semesters,
  currentSemesterId,
  currentWeekId,
}: {
  semesters: SemesterOption[];
  currentSemesterId: number;
  currentWeekId: number | null;
})
{
  const [ready, setReady] = useState(false);
  const [semesterId, setSemesterId] = useState<number>(currentSemesterId);
  const [orientation, setOrientation] = useState<TimetableOrientation>("vertical");
  const [viewMode, setViewMode] = useState<"class" | "exam">("class");
  const [sortMode, setSortMode] = useState<"code" | "exam">("code");
  const [searchInput, setSearchInput] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<SharedClassIdentifier[]>([]);
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | "all">("all");
  const [shareMessage, setShareMessage] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [plannerNotice, setPlannerNotice] = useState("");
  const [timetableData, setTimetableData] = useState<TimetableData>({
    semester: null,
    semesterWeeks: [],
    selections: [],
    events: [],
    clashes: [],
    unresolvedSelections: [],
  });
  const [classPickerCourse, setClassPickerCourse] = useState<ClassPickerCourse | null>(null);
  const [classPickerLoading, setClassPickerLoading] = useState(false);
  const [classPickerClasses, setClassPickerClasses] = useState<CourseClassRecord[]>([]);
  const [classPickerError, setClassPickerError] = useState("");
  const [scheduleCourse, setScheduleCourse] = useState<ReturnType<typeof buildSelectedCourseCards>[number] | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const timetableCaptureRef = useRef<HTMLDivElement | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const deferredSearch = useDeferredValue(searchInput);

  const selectedSemester = semesters.find((semester) => semester.semesterId === semesterId) ?? semesters[0] ?? null;
  const semesterWeeks = selectedSemester?.weeks ?? [];

  useEffect(() => {
    const saved = loadSavedTimetable();
    const next = saved ?? defaultStorageState(semesters, currentSemesterId, currentWeekId);
    setSemesterId(next.semesterId || currentSemesterId || semesters[0]?.semesterId || 0);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    setSelectedWeekId(next.selectedWeekId);
    setOrientation(next.orientation);
    setViewMode(next.viewMode);
    setReady(true);
  }, [currentSemesterId, currentWeekId, semesters]);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    const payload: PlannerStorageState = {
      semesterId,
      selectedClasses,
      hiddenClasses,
      selectedWeekId,
      orientation,
      viewMode,
    };
    saveTimetableToLocalStorage(payload);
  }, [hiddenClasses, orientation, ready, selectedClasses, selectedWeekId, semesterId, viewMode]);

  useEffect(() => {
    if (!ready || !semesterId)
    {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/classes?${buildShareQuery(semesterId, selectedClasses)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
        {
          throw new Error("Unable to load timetable data.");
        }
        return response.json() as Promise<{ timetable: TimetableData }>;
      })
      .then((payload) => {
        setTimetableData(payload.timetable);
        setSelectedWeekId((current) => (
          current === "all" || payload.timetable.semesterWeeks.some((week) => week.weekId === current)
            ? current
            : "all"
        ));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError")
        {
          return;
        }
        setTimetableData({
          semester: null,
          semesterWeeks: semesterWeeks,
          selections: [],
          events: [],
          clashes: [],
          unresolvedSelections: [],
        });
      })
    return () => controller.abort();
  }, [ready, selectedClasses, semesterId]);

  useEffect(() => {
    if (!deferredSearch.trim())
    {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    const params = new URLSearchParams({
      q: deferredSearch,
      limit: "8",
    });
    params.append("semesterIds", String(semesterId));

    fetch(`/api/courses/search?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
        {
          throw new Error("Unable to search courses.");
        }
        return response.json() as Promise<SearchResponse>;
      })
      .then((payload) => setSearchResults(payload.courses))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError")
        {
          return;
        }
        setSearchResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted)
        {
          setSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredSearch, semesterId]);

  const selectedCards = useMemo(
    () => sortSelectedCards(buildSelectedCourseCards(timetableData), sortMode),
    [sortMode, timetableData],
  );
  const colorByShareKey = useMemo(
    () => new Map(selectedCards.map((card) => [card.shareKey, card.color])),
    [selectedCards],
  );
  const selectedShareKeyByCourseCode = useMemo(
    () => new Map(selectedClasses.map((selection) => [selection.courseCode, buildSharedClassIdentifier(selection)])),
    [selectedClasses],
  );
  const visibleEvents = useMemo(
    () => timetableData.events.filter((event) => !hiddenClasses.includes(event.shareKey)),
    [hiddenClasses, timetableData.events],
  );
  const allBlocks = useMemo(() => buildTimetableBlocks(visibleEvents, selectedWeekId), [selectedWeekId, visibleEvents]);
  const pickerPreviewEvents = useMemo(() => buildPreviewEvents(classPickerClasses), [classPickerClasses]);
  const pickerBlocks = useMemo(
    () => buildTimetableBlocks(pickerPreviewEvents, selectedWeekId),
    [pickerPreviewEvents, selectedWeekId],
  );
  const pickerColorByShareKey = useMemo(() => (
    new Map(classPickerClasses.map((group, index) => {
      const identifier: SharedClassIdentifier = {
        courseCode: group.courseCode,
        scheduleType: group.scheduleType,
        groupCodeType: group.groupCodeType,
        groupCode: group.groupCode,
      };
      return [buildSharedClassIdentifier(identifier), GROUP_PREVIEW_COLORS[index % GROUP_PREVIEW_COLORS.length]] as const;
    }))
  ), [classPickerClasses]);
  const displayedBlocks = classPickerCourse ? pickerBlocks : allBlocks;
  const displayedBlockColors = classPickerCourse ? pickerColorByShareKey : colorByShareKey;
  const examCards = useMemo(
    () => buildExamCards(visibleEvents).filter((card) => !hiddenClasses.includes(card.shareKey)),
    [hiddenClasses, visibleEvents],
  );
  const visibleEndMinutes = getLatestEndMinutes(displayedBlocks);
  const timeSlots = buildTimeSlots(visibleEndMinutes);
  const totalCredits = selectedCards.reduce((sum, card) => sum + (card.creditUnits ?? 0), 0);
  const weekItems = buildWeekOptions(semesterWeeks);
  const semesterItems = semesters.map((semester) => ({
    id: String(semester.semesterId),
    title: semester.semesterName,
    subtitle: `AY${semester.academicYear}`,
  }));
  const showCurrentTime = semesterId === currentSemesterId && (selectedWeekId === "all" || selectedWeekId === currentWeekId);
  const activePickerShareKey = classPickerCourse
    ? selectedShareKeyByCourseCode.get(classPickerCourse.courseCode) ?? null
    : null;

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }
  }, []);

  function toggleHidden(shareKey: string)
  {
    setHiddenClasses((current) => current.includes(shareKey)
      ? current.filter((value) => value !== shareKey)
      : [...current, shareKey]);
  }

  function removeClass(shareKey: string)
  {
    setSelectedClasses((current) => current.filter((value) => `${value.courseCode}:${value.scheduleType}:${value.groupCodeType}:${value.groupCode}` !== shareKey));
    setHiddenClasses((current) => current.filter((value) => value !== shareKey));
    setClassPickerCourse((current) => (current && shareKey.startsWith(`${current.courseCode}:`) ? null : current));
  }

  function showPlannerBanner(message: string)
  {
    setPlannerNotice(message);
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => setPlannerNotice(""), 3200);
  }

  function closeClassPicker()
  {
    setClassPickerCourse(null);
    setClassPickerClasses([]);
    setClassPickerError("");
    setClassPickerLoading(false);
  }

  function addClassSelection(selection: SharedClassIdentifier)
  {
    setSelectedClasses((current) => replaceSelectionForCourse(current, selection));
    setHiddenClasses((current) => current.filter((value) => !value.startsWith(`${selection.courseCode}:`)));
    closeClassPicker();
    setSearchInput("");
    setSearchResults([]);
    setPlannerNotice("");
  }

  function handleSemesterChange(nextSemesterId: number)
  {
    setSemesterId(nextSemesterId);
    setSelectedClasses([]);
    setHiddenClasses([]);
    setSelectedWeekId(nextSemesterId === currentSemesterId && currentWeekId ? currentWeekId : "all");
    setSearchInput("");
    setSearchResults([]);
    setPlannerNotice("");
    closeClassPicker();
  }

  function openClassPicker(course: ClassPickerCourse)
  {
    setClassPickerCourse(course);
    setClassPickerLoading(true);
    setClassPickerError("");
    setClassPickerClasses([]);

    const params = new URLSearchParams({
      courseCode: course.courseCode,
      semesterId: String(semesterId),
    });

    fetch(`/api/classes?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
        {
          throw new Error("Unable to load class groups.");
        }
        return response.json() as Promise<ClassesResponse>;
      })
      .then((payload) => setClassPickerClasses(payload.classes))
      .catch((error: unknown) => setClassPickerError(error instanceof Error ? error.message : "Unable to load class groups."))
      .finally(() => setClassPickerLoading(false));
  }

  function handleSearchResultClick(course: CourseSearchResult)
  {
    const offeredInSelectedSemester = course.offeredSemesters.some((semester) => semester.semesterId === semesterId);

    if (!offeredInSelectedSemester)
    {
      showPlannerBanner(`${course.courseCode} is not offered in ${selectedSemester?.semesterName ?? "the selected semester"}.`);
      return;
    }

    setSearchInput("");
    setSearchResults([]);
    openClassPicker({
      courseCode: course.courseCode,
      courseName: course.courseName,
    });
  }

  async function handleShare()
  {
    const shareUrl = `${window.location.origin}${encodeShareUrlState({ semesterId, selectedClasses })}`;
    try
    {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Share link copied.");
    }
    catch {
      setShareMessage(shareUrl);
    }
    window.setTimeout(() => setShareMessage(""), 3000);
  }

  function triggerDownload(path: string, fileName: string)
  {
    const anchor = document.createElement("a");
    anchor.href = `${path}?${buildShareQuery(semesterId, selectedClasses)}`;
    anchor.download = fileName;
    anchor.click();
    setDownloadOpen(false);
  }

  async function handlePngExport()
  {
    if (!timetableCaptureRef.current)
    {
      return;
    }

    await exportElementToPng(
      timetableCaptureRef.current,
      `suss-planner-${semesterId}-${viewMode}.png`,
    );
    setDownloadOpen(false);
  }

  function resetPlanner()
  {
    setSelectedClasses([]);
    setHiddenClasses([]);
    setSearchInput("");
    setPlannerNotice("");
    setDownloadOpen(false);
    setConfirmResetOpen(false);
    closeClassPicker();
    saveTimetableToLocalStorage({
      semesterId,
      selectedClasses: [],
      hiddenClasses: [],
      selectedWeekId,
      orientation,
      viewMode,
    });
  }

  const nextViewToggle = viewMode === "class"
    ? { label: "Exam Cal", icon: <CalendarIcon className="h-[18px] w-[18px]" />, onClick: () => setViewMode("exam") }
    : { label: "Timetable", icon: <GridIcon className="h-[18px] w-[18px]" />, onClick: () => setViewMode("class") };
  const nextOrientationToggle = orientation === "horizontal"
    ? { label: "Vertical", icon: <RowsIcon className="h-[18px] w-[18px]" />, onClick: () => setOrientation("vertical") }
    : { label: "Horizontal", icon: <ColumnsIcon className="h-[18px] w-[18px]" />, onClick: () => setOrientation("horizontal") };

  return (
    <>
      <div className={`flex min-h-0 flex-1 flex-col ${orientation === "horizontal" ? "md:flex-col" : "md:flex-row"}`}>
        <section className={`flex min-h-0 w-full flex-1 flex-col ${orientation === "horizontal" ? "md:w-full" : "md:w-[70%]"}`}>
          <div className="elev-1 flex flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
            <SelectorRail
              items={semesterItems}
              selectedId={String(semesterId)}
              onSelect={(id) => handleSemesterChange(Number(id))}
              onPrev={() => {
                const index = semesters.findIndex((semester) => semester.semesterId === semesterId);
                if (index > 0)
                {
                  handleSemesterChange(semesters[index - 1].semesterId);
                }
              }}
              onNext={() => {
                const index = semesters.findIndex((semester) => semester.semesterId === semesterId);
                if (index >= 0 && index < semesters.length - 1)
                {
                  handleSemesterChange(semesters[index + 1].semesterId);
                }
              }}
              variant="semester"
            />
            <SelectorRail
              items={weekItems}
              selectedId={String(selectedWeekId)}
              onSelect={(id) => setSelectedWeekId(id === "all" ? "all" : Number(id))}
              onPrev={() => {
                const values: Array<number | "all"> = ["all", ...semesterWeeks.map((week) => week.weekId)];
                const index = values.findIndex((value) => value === selectedWeekId);
                if (index > 0)
                {
                  setSelectedWeekId(values[index - 1]);
                }
              }}
              onNext={() => {
                const values: Array<number | "all"> = ["all", ...semesterWeeks.map((week) => week.weekId)];
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

          <div className="bg-[var(--surface-container-lowest)] px-3 pt-2.5">
            {plannerNotice ? (
              <div className="mb-2.5 rounded-[0.5rem] border border-[var(--primary)]/20 bg-[var(--primary-fixed)] px-2.5 py-1.5 text-[12px] font-medium leading-4 text-[var(--primary)]">
                {plannerNotice}
              </div>
            ) : null}
            {timetableData.unresolvedSelections.length > 0 ? (
              <div className="mb-2.5 rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-2.5 py-1.5 text-[12px] font-medium leading-4 text-[var(--error)]">
                Some shared or saved class identifiers no longer match the database for this semester.
              </div>
            ) : null}
            {timetableData.clashes.length > 0 ? (
              <div className="mb-2.5 rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-3 py-2.5">
                <p className="text-[12px] font-semibold leading-4 text-[var(--error)]">Detected timetable clashes</p>
                <div className="mt-2 space-y-2 text-[11px] leading-[14px] text-[var(--on-surface)]">
                  {timetableData.clashes.slice(0, 4).map((clash) => (
                    <div key={clash.clashKey}>
                      <div className="font-semibold">{formatEventDate(clash.eventDate)} · {formatTimeRange(clash.startTime, clash.endTime)}</div>
                      <div className="text-[var(--on-surface-variant)]">
                        {clash.events.map((event) => `${event.courseCode} ${formatClassGroupLabel(event.groupCode)}`).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {classPickerCourse ? (
              <div className={`mb-2.5 rounded-[0.5rem] border px-3 py-2.5 ${
                classPickerError
                  ? "border-[var(--error)]/30 bg-[var(--error-container)] text-[var(--error)]"
                  : "border-[var(--primary)]/20 bg-[var(--primary-fixed)] text-[var(--primary)]"
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div>
                    <p className="text-[12px] font-semibold leading-4">
                      {classPickerCourse.courseCode} group selection
                    </p>
                    <p className={`mt-1 text-[12px] leading-4 ${
                      classPickerError ? "text-[var(--error)]" : "text-[var(--primary)]"
                    }`}>
                      {classPickerLoading
                        ? "Loading class group blocks for this course."
                        : classPickerError
                          ? classPickerError
                          : classPickerClasses.length === 0
                            ? "No class groups are available for this course in the selected semester."
                            : "Other course blocks are hidden. Click a timetable block to switch to that class group."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeClassPicker}
                    className="rounded-[0.4rem] border border-current/20 px-3 py-1.5 text-[11px] font-semibold leading-4 transition-opacity hover:opacity-75"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)] px-3 pb-3 pt-1">
            <div ref={timetableCaptureRef} className={`min-h-0 flex-1 ${viewMode === "class" ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}>
              {viewMode === "class" ? (
                <TimetableCanvas
                  blocks={displayedBlocks}
                  blockColorByKey={displayedBlockColors}
                  isHorizontal={orientation === "horizontal"}
                  timeSlots={timeSlots}
                  visibleEndMinutes={visibleEndMinutes}
                  showAllWeeks={selectedWeekId === "all"}
                  activeShareKey={activePickerShareKey}
                  onBlockClick={(block) => {
                    if (classPickerCourse)
                    {
                      const matchingGroup = classPickerClasses.find((group) => {
                        const identifier: SharedClassIdentifier = {
                          courseCode: group.courseCode,
                          scheduleType: group.scheduleType,
                          groupCodeType: group.groupCodeType,
                          groupCode: group.groupCode,
                        };

                        return buildSharedClassIdentifier(identifier) === block.shareKey;
                      });

                      if (matchingGroup)
                      {
                        addClassSelection({
                          courseCode: matchingGroup.courseCode,
                          scheduleType: matchingGroup.scheduleType,
                          groupCodeType: matchingGroup.groupCodeType,
                          groupCode: matchingGroup.groupCode,
                        });
                      }

                      return;
                    }

                    openClassPicker({
                      courseCode: block.courseCode,
                      courseName: block.courseName,
                    });
                  }}
                  showCurrentTime={showCurrentTime}
                />
              ) : (
                <ExamCalendar cards={examCards} colorByShareKey={colorByShareKey} />
              )}
            </div>
          </div>
        </section>

        <aside className={`flex min-h-0 w-full flex-col border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] ${orientation === "horizontal" ? "md:w-full md:border-l-0 md:border-t" : "md:w-[30%] md:border-l md:border-t-0"}`}>
          <div className="flex h-14 shrink-0 items-center justify-between bg-[var(--surface-container-lowest)] px-3">
            <div>
              <h3 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">My Courses</h3>
              <p className="text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{selectedSemester ? getCurrentWeekChip(selectedSemester, semesterWeeks.find((week) => week.weekId === selectedWeekId) ?? null) : ""}</p>
            </div>
            <span className="rounded-[0.75rem] bg-[color:rgb(0_48_93_/_0.1)] px-2 py-0.5 text-[11px] font-medium leading-[14px] text-[var(--primary)]">
              {selectedCards.length} Selected
            </span>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-3 py-1.5">
            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                className="elev-1 w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-2 pl-10 pr-4 text-[14px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                placeholder="Search courses"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />

              {searchInput ? (
                <div className="elev-3 absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
                  {searchResults.map((record) => (
                    <button
                      key={record.courseCode}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-[0.5rem] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-container-high)]"
                      onClick={() => handleSearchResultClick(record)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold leading-4 text-[var(--on-surface)]">
                          {record.courseCode}
                        </span>
                        <span className="block truncate text-[11px] leading-[14px] text-[var(--on-surface-variant)]">
                          {record.courseName ?? "Untitled course"}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {record.offeredSemesters.map((semester) => (
                            <span key={`${record.courseCode}-${semester.semesterId}`} className="rounded-[999px] border border-[var(--outline-variant)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-tight text-[var(--on-surface-variant)]">
                              {semester.semesterName}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-[0.5rem] border ${
                        record.hasAvailableClasses
                          ? "border-[var(--primary)]/20 bg-[var(--primary-fixed)] text-[var(--primary)]"
                          : "border-[var(--outline-variant)] text-[var(--on-surface-variant)]"
                      }`}>
                        {record.hasAvailableClasses ? <PlusIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                      </span>
                    </button>
                  ))}

                  {searchLoading ? (
                    <div className="px-3 py-2 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">Searching…</div>
                  ) : null}

                  {!searchLoading && searchResults.length === 0 ? (
                    <div className="rounded-[0.5rem] border border-dashed border-[var(--outline-variant)] px-4 py-3 text-center text-[11px] font-medium leading-4 text-[var(--on-surface-variant)]">
                      No matching courses
                    </div>
                  ) : null}
                </div>
              ) : null}
            </label>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-3 pb-3 pt-1.5">
            <div className={`grid gap-1.5 ${orientation === "horizontal" ? "grid-cols-5" : "grid-cols-2"}`}>
              <ActionButton variant="ghost" icon={<RefreshIcon className="h-[18px] w-[18px]" />} label="Reset" onClick={() => setConfirmResetOpen(true)} />
              <ActionButton variant="ghost" icon={nextOrientationToggle.icon} label={nextOrientationToggle.label} onClick={nextOrientationToggle.onClick} />
              <ActionButton variant="ghost" icon={<DownloadIcon className="h-[18px] w-[18px]" />} label="Download" onClick={() => setDownloadOpen((current) => !current)} />
              <ActionButton variant="ghost" icon={nextViewToggle.icon} label={nextViewToggle.label} onClick={nextViewToggle.onClick} />
              <ActionButton variant="primary" icon={<ShareIcon className="h-[18px] w-[18px]" />} label="Share / Sync" onClick={handleShare} stretch />
            </div>

            {downloadOpen ? (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <ActionButton variant="ghost" icon={<DownloadIcon className="h-[18px] w-[18px]" />} label="PDF" onClick={() => triggerDownload("/api/export/pdf", `suss-planner-${semesterId}-${viewMode}.pdf`)} />
                <ActionButton variant="ghost" icon={<CalendarIcon className="h-[18px] w-[18px]" />} label="ICS" onClick={() => triggerDownload("/api/export/ics", `suss-planner-${semesterId}-${viewMode}.ics`)} />
                <ActionButton variant="ghost" icon={<GridIcon className="h-[18px] w-[18px]" />} label="PNG" onClick={() => void handlePngExport()} />
              </div>
            ) : null}

            {shareMessage ? (
              <div className="mt-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--primary-fixed)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-[var(--primary)]">
                {shareMessage}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-container-lowest)] px-3 pb-3">
            <div className={orientation === "horizontal" ? "grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "space-y-2"}>
              {selectedCards.map((record) => {
                const isHidden = hiddenClasses.includes(record.shareKey);
                return (
                  <article
                    key={record.shareKey}
                    className="elev-1 group relative overflow-hidden rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-2 transition-[box-shadow] hover:shadow-md"
                  >
                    <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: record.color }} />

                    <div className="pl-1.5 pr-12">
                      <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span aria-hidden="true" className="h-4 w-4 rounded-[4px] border border-black/10" style={{ backgroundColor: record.color }} />
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                              <h4 className="shrink-0 text-[15px] font-extrabold leading-5 text-[var(--on-surface)]">{record.courseCode}</h4>
                              <p className="min-w-0 text-[14px] font-normal leading-5 text-[var(--on-surface)]">
                                {record.courseName ?? "Untitled course"}
                              </p>
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
                        <IconButton label="View class schedule" onClick={() => setScheduleCourse(record)} className="h-8 w-8">
                          <CalendarIcon className="h-5 w-5" />
                        </IconButton>
                        <IconButton label={isHidden ? "Show course" : "Hide course"} onClick={() => toggleHidden(record.shareKey)} className="h-8 w-8">
                          {isHidden ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                        </IconButton>
                        <IconButton label="Remove course" onClick={() => removeClass(record.shareKey)} danger className="h-8 w-8">
                          <TrashIcon className="h-5 w-5" />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}

            </div>

            <div className={`flex items-start justify-between gap-3 border-t border-[var(--outline-variant)] pt-3 ${orientation === "horizontal" ? "mt-2.5" : "mt-2"}`}>
              <div className="text-left text-[12px] font-semibold leading-4 text-[var(--on-surface)]">
                <div className="text-[var(--on-surface-variant)]">Total Credit Units</div>
                <div className="mt-1 text-[18px] font-bold leading-6 text-[var(--primary)]">{totalCredits.toFixed(1)} CU</div>
              </div>
              <SortDropdown sortMode={sortMode} onSelect={setSortMode} />
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(scheduleCourse)}
        title="Class Schedule"
        onClose={() => setScheduleCourse(null)}
        maxWidthClassName="max-w-2xl"
      >
        {scheduleCourse ? (
          <ClassScheduleModalContent
            courseCode={scheduleCourse.courseCode}
            courseName={scheduleCourse.courseName}
            classGroupLabel={formatClassGroupLabel(scheduleCourse.groupCode)}
            events={scheduleCourse.events}
          />
        ) : null}
      </Modal>

      <Modal
        open={confirmResetOpen}
        title="Reset planner"
        description="This clears the selected courses for the current timetable and keeps your current display layout."
        onClose={() => setConfirmResetOpen(false)}
        footer={(
          <>
            <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => setConfirmResetOpen(false)} />
            <ActionButton variant="primary" icon={<RefreshIcon className="h-4 w-4" />} label="Reset" onClick={resetPlanner} />
          </>
        )}
      />
    </>
  );
}

function ExamCalendar({
  cards,
  colorByShareKey,
}: {
  cards: ReturnType<typeof buildExamCards>;
  colorByShareKey: Map<string, string>;
})
{
  if (cards.length === 0)
  {
    return (
      <div className="rounded-[0.5rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-6 text-center text-[14px] leading-5 text-[var(--on-surface-variant)]">
        No exam events for selected courses.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article key={card.id} className="elev-1 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: colorByShareKey.get(card.shareKey) ?? "#3556b8" }} />
            <span className="text-[12px] font-bold leading-4 text-[var(--on-surface)]">{card.courseCode} {card.groupCode}</span>
          </div>
          <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">{card.courseName ?? "Untitled course"}</p>
          <p className="mt-3 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{formatEventDate(card.eventDate)}</p>
          <p className="text-[11px] leading-[14px] text-[var(--on-surface-variant)]">{formatTimeRange(card.startTime, card.endTime)}</p>
        </article>
      ))}
    </div>
  );
}

function SortDropdown({
  sortMode,
  onSelect,
}: {
  sortMode: "code" | "exam";
  onSelect: (mode: "code" | "exam") => void;
})
{
  return (
    <div className="min-w-[10rem] shrink-0">
      <label className="mb-1 block text-left text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]" htmlFor="my-courses-sort-mode">
        Sort by
      </label>
      <select
        id="my-courses-sort-mode"
        value={sortMode}
        onChange={(event) => onSelect(event.target.value as "code" | "exam")}
        className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-1.5 text-[12px] font-semibold leading-4 text-[var(--on-surface)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
      >
        <option value="code">Code</option>
        <option value="exam">Exam</option>
      </select>
    </div>
  );
}
