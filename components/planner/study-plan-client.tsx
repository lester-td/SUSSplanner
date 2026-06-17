"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

import {
  BookIcon,
  CalendarWeekIcon,
  DownloadIcon,
  EditIcon,
  EditCalendarIcon,
  LayersIcon,
  ListIcon,
  PlusIcon,
  RefreshIcon,
  SchoolIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";
import { openStudyPlanPrintView } from "@/lib/export/study-plan-print";
import {
  STUDY_PLAN_UPDATED_EVENT,
  createCatalogStudyPlanCourse,
  createManualStudyPlanCourse,
  defaultStudyPlanState,
  loadStudyPlanState,
  normalizeStudyPlanState,
  parseStudyPlanBackup,
  saveStudyPlanState,
  serializeStudyPlanBackup,
} from "@/lib/planner/storage";
import type { StudyPlanCourse, StudyPlanState } from "@/lib/planner/types";
import type { CourseSearchResult, SemesterRecord } from "@/lib/timetable/types";

type SearchResponse = {
  courses: CourseSearchResult[];
};

type DragTranslate = {
  x: number;
  y: number;
};

const GHOST_CATCHUP_RATE = 0.09;

function formatCredits(value: number)
{
  return `${Number(value.toFixed(1)).toString()} CU`;
}

function formatCreditCount(value: number)
{
  return `${Number(value.toFixed(1)).toString()} Credit Units`;
}

function buildSemesterOptions(numSemesters: number)
{
  return Array.from({ length: numSemesters }, (_, index) => index);
}

function formatOfferedSemesters(course: CourseSearchResult)
{
  const labels = course.offeredSemesters
    .slice(0, 3)
    .map((semester) => semester.semesterName.replace(/^Semester\s+/i, "Sem "));

  return labels.length > 0 ? labels.join(" • ") : "Semester offering unavailable";
}

function sortCourses(courses: StudyPlanCourse[])
{
  return [...courses].sort((left, right) => left.courseCode.localeCompare(right.courseCode));
}

function useCatchingGhostTransform(transform: DragTranslate | null, active: boolean)
{
  const [ghostTransform, setGhostTransform] = useState<DragTranslate | null>(null);
  const activeRef = useRef(active);
  const frameRef = useRef<number | null>(null);
  const currentRef = useRef<DragTranslate>({ x: 0, y: 0 });
  const targetRef = useRef<DragTranslate>({ x: 0, y: 0 });
  const hasGhostRef = useRef(false);

  activeRef.current = active;

  useEffect(() => {
    if (!active || !transform)
    {
      if (frameRef.current !== null)
      {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      currentRef.current = { x: 0, y: 0 };
      targetRef.current = { x: 0, y: 0 };
      hasGhostRef.current = false;
      setGhostTransform(null);
      return;
    }

    targetRef.current = { x: transform.x, y: transform.y };

    if (!hasGhostRef.current)
    {
      hasGhostRef.current = true;
      setGhostTransform({ ...currentRef.current });
    }

    if (frameRef.current !== null)
    {
      return;
    }

    const animate = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      const next = {
        x: current.x + ((target.x - current.x) * GHOST_CATCHUP_RATE),
        y: current.y + ((target.y - current.y) * GHOST_CATCHUP_RATE),
      };

      currentRef.current = next;
      setGhostTransform(next);

      frameRef.current = activeRef.current
        ? window.requestAnimationFrame(animate)
        : null;
    };

    frameRef.current = window.requestAnimationFrame(animate);
  }, [active, transform]);

  useEffect(() => () => {
    if (frameRef.current !== null)
    {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  return ghostTransform;
}

export function StudyPlanClient({
  semesters,
}: {
  semesters: SemesterRecord[];
})
{
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<StudyPlanState>(defaultStudyPlanState());
  const [isCustomCourse, setIsCustomCourse] = useState(false);
  const [showAllModules, setShowAllModules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSemesterId, setSearchSemesterId] = useState<number | "all">("all");
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualCredits, setManualCredits] = useState("");
  const [manualSemesterSpan, setManualSemesterSpan] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [editingCredits, setEditingCredits] = useState("5");
  const [editingSemesterSpan, setEditingSemesterSpan] = useState("1");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [importedPlan, setImportedPlan] = useState<StudyPlanState | null>(null);
  const [importedPlanFileName, setImportedPlanFileName] = useState("");
  const [notice, setNotice] = useState("");
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(searchQuery);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
  );

  useEffect(() => {
    setPlan(loadStudyPlanState() ?? defaultStudyPlanState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    saveStudyPlanState(plan);
  }, [plan, ready]);

  useEffect(() => {
    const syncPlanState = () => {
      const saved = loadStudyPlanState();
      if (saved)
      {
        setPlan(saved);
      }
    };

    window.addEventListener("storage", syncPlanState);
    window.addEventListener(STUDY_PLAN_UPDATED_EVENT, syncPlanState);

    return () => {
      window.removeEventListener("storage", syncPlanState);
      window.removeEventListener(STUDY_PLAN_UPDATED_EVENT, syncPlanState);
    };
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!backupMenuOpen)
    {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-backup-popover-root]"))
      {
        setBackupMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [backupMenuOpen]);

  useEffect(() => {
    if (!deferredSearch.trim())
    {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      q: deferredSearch.trim(),
      limit: "10",
    });

    if (searchSemesterId !== "all")
    {
      params.append("semesterIds", String(searchSemesterId));
    }

    setSearchLoading(true);
    fetch(`/api/courses/search?${params.toString()}`, {
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
        if ((error as { name?: string })?.name !== "AbortError")
        {
          console.error("Failed to search planner courses.", error);
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted)
        {
          setSearchLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredSearch, searchSemesterId]);

  const sortedCourses = useMemo(() => sortCourses(plan.courses), [plan.courses]);
  const unassignedCourses = useMemo(
    () => sortedCourses.filter((course) => course.assignedSemester === null),
    [sortedCourses],
  );
  const bankCourses = useMemo(
    () => (showAllModules ? sortedCourses : unassignedCourses),
    [showAllModules, sortedCourses, unassignedCourses],
  );
  const assignedCredits = useMemo(
    () => sortedCourses
      .filter((course) => course.assignedSemester !== null)
      .reduce((sum, course) => sum + course.creditUnits, 0),
    [sortedCourses],
  );
  const creditProgressPercent = useMemo(() => {
    if (plan.totalCreditsGoal <= 0)
    {
      return 0;
    }
    return (assignedCredits / plan.totalCreditsGoal) * 100;
  }, [assignedCredits, plan.totalCreditsGoal]);
  const creditProgressBarPercent = useMemo(
    () => Math.min(100, Math.max(0, creditProgressPercent)),
    [creditProgressPercent],
  );
  const isOverTargetCredits = useMemo(
    () => plan.totalCreditsGoal > 0 && assignedCredits > plan.totalCreditsGoal,
    [assignedCredits, plan.totalCreditsGoal],
  );
  const semesterIndexes = useMemo(
    () => buildSemesterOptions(plan.numSemesters),
    [plan.numSemesters],
  );
  const selectedCodes = useMemo(
    () => new Set(sortedCourses.map((course) => course.courseCode.trim().toUpperCase())),
    [sortedCourses],
  );
  const searchDropdownResults = useMemo(
    () => searchResults.filter((course) => !selectedCodes.has(course.courseCode.trim().toUpperCase())),
    [searchResults, selectedCodes],
  );
  const editingCourse = useMemo(
    () => sortedCourses.find((course) => course.id === editingCourseId && course.source === "manual") ?? null,
    [editingCourseId, sortedCourses],
  );
  const draggedCourse = useMemo(
    () => sortedCourses.find((course) => course.id === draggedCourseId) ?? null,
    [draggedCourseId, sortedCourses],
  );

  useEffect(() => {
    if (!editingCourse)
    {
      return;
    }

    setEditingCode(editingCourse.courseName || editingCourse.courseCode);
    setEditingCredits(String(editingCourse.creditUnits));
    setEditingSemesterSpan(String(editingCourse.semesterSpan));
  }, [editingCourse]);

  function showNoticeMessage(message: string)
  {
    setNotice(message);
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(""), 2800);
  }

  function updatePlan(updater: (current: StudyPlanState) => StudyPlanState)
  {
    setPlan((current) => normalizeStudyPlanState(updater(current)));
  }

  function removeCourse(courseId: string)
  {
    updatePlan((current) => ({
      ...current,
      courses: current.courses.filter((course) => course.id !== courseId),
    }));
  }

  function deleteCourseFromBank(course: StudyPlanCourse)
  {
    removeCourse(course.id);
    if (editingCourseId === course.id)
    {
      setEditingCourseId(null);
    }
    showNoticeMessage(`${course.courseCode} deleted from planner.`);
  }

  function resetPlan()
  {
    setPlan(defaultStudyPlanState());
    showNoticeMessage("Planner reset.");
  }

  function exportPlan()
  {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([serializeStudyPlanBackup(plan)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `sussplanner-semester-plan-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    setBackupMenuOpen(false);
    showNoticeMessage("Semester plan exported.");
  }

  function openPlanPdf()
  {
    if (!openStudyPlanPrintView(plan))
    {
      showNoticeMessage("Unable to open PDF view. Allow pop-ups and try again.");
    }
  }

  async function selectImportFile(file: File | undefined)
  {
    if (!file)
    {
      return;
    }

    if (file.size > 1_000_000)
    {
      showNoticeMessage("Import failed: backup file is too large.");
      return;
    }

    try
    {
      setImportedPlan(parseStudyPlanBackup(await file.text()));
      setImportedPlanFileName(file.name);
    }
    catch (error)
    {
      console.error("Failed to import planner backup.", error);
      showNoticeMessage("Import failed: select a valid SUSSPlanner semester plan backup.");
    }
  }

  function confirmPlanImport()
  {
    if (!importedPlan)
    {
      return;
    }

    setPlan(importedPlan);
    setImportedPlan(null);
    setImportedPlanFileName("");
    showNoticeMessage("Semester plan imported.");
  }

  function addSemester()
  {
    updatePlan((current) => ({
      ...current,
      numSemesters: Math.min(20, current.numSemesters + 1),
    }));
  }

  function canDeleteSemester(semesterIndex: number)
  {
    const hasOccupancy = plan.courses.some((course) => (
      course.assignedSemester !== null
      && course.assignedSemester <= semesterIndex
      && (course.assignedSemester + course.semesterSpan) > semesterIndex
    ));

    return plan.numSemesters > 1 && !hasOccupancy;
  }

  function deleteSemester(semesterIndex: number)
  {
    if (!canDeleteSemester(semesterIndex))
    {
      showNoticeMessage("Only empty semesters can be deleted.");
      return;
    }

    updatePlan((current) => ({
      ...current,
      numSemesters: current.numSemesters - 1,
      courses: current.courses.map((course) => {
        if (course.assignedSemester === null || course.assignedSemester < semesterIndex)
        {
          return course;
        }

        return {
          ...course,
          assignedSemester: Math.max(0, course.assignedSemester - 1),
        };
      }),
    }));
  }

  function moveCourseToSemester(courseId: string, assignedSemester: number | null)
  {
    const course = plan.courses.find((item) => item.id === courseId);
    if (!course)
    {
      return;
    }

    if (assignedSemester === null)
    {
      updatePlan((current) => ({
        ...current,
        courses: current.courses.map((item) => item.id === courseId
          ? { ...item, assignedSemester: null }
          : item),
      }));
      return;
    }

    const latestValidSemester = Math.max(0, plan.numSemesters - course.semesterSpan);
    const nextAssignedSemester = Math.min(assignedSemester, latestValidSemester);

    updatePlan((current) => ({
      ...current,
      courses: current.courses.map((item) => item.id === courseId
        ? { ...item, assignedSemester: nextAssignedSemester }
        : item),
    }));

    if (nextAssignedSemester !== assignedSemester)
    {
      showNoticeMessage(`Moved ${course.courseCode} to the latest valid semester for a ${course.semesterSpan}-semester span.`);
    }
  }

  function addManualCourse()
  {
    const customLabel = manualCode.trim();
    const creditUnits = manualCredits.trim() === "" ? 0 : Number.parseFloat(manualCredits);
    const semesterSpan = manualSemesterSpan.trim() === "" ? 1 : Number.parseInt(manualSemesterSpan, 10);

    if (!customLabel)
    {
      showNoticeMessage("Enter course code or course name.");
      return;
    }

    if (!Number.isFinite(creditUnits) || creditUnits < 0)
    {
      showNoticeMessage("Credit units must be 0 or more.");
      return;
    }

    if (!Number.isInteger(semesterSpan) || semesterSpan < 1)
    {
      showNoticeMessage("Semester span must be at least 1.");
      return;
    }

    const nextCourse = createManualStudyPlanCourse({
      courseCode: customLabel.toUpperCase(),
      courseName: customLabel,
      creditUnits,
      semesterSpan: Math.min(semesterSpan, plan.numSemesters),
    });

    updatePlan((current) => ({
      ...current,
      courses: [...current.courses, nextCourse],
    }));
    setManualCode("");
    setManualCredits("");
    setManualSemesterSpan("");
    showNoticeMessage("Custom module added to planner bank.");
  }

  function saveEditedCustomCourse()
  {
    if (!editingCourse)
    {
      return;
    }

    const customLabel = editingCode.trim();
    const creditUnits = Number.parseFloat(editingCredits);
    const semesterSpan = Number.parseInt(editingSemesterSpan, 10);

    if (!customLabel)
    {
      showNoticeMessage("Enter a course code or course name first.");
      return;
    }

    if (!Number.isFinite(creditUnits) || creditUnits < 0)
    {
      showNoticeMessage("Credit units must be 0 or more.");
      return;
    }

    if (!Number.isInteger(semesterSpan) || semesterSpan < 1)
    {
      showNoticeMessage("Semester span must be at least 1.");
      return;
    }

    updatePlan((current) => ({
      ...current,
      courses: current.courses.map((course) => course.id === editingCourse.id
        ? {
            ...course,
            courseCode: customLabel.toUpperCase(),
            courseName: customLabel,
            creditUnits,
            semesterSpan: Math.min(semesterSpan, current.numSemesters),
          }
        : course),
    }));
    setEditingCourseId(null);
    showNoticeMessage("Custom module updated.");
  }

  function handleCourseDragStart(event: DragStartEvent)
  {
    setDraggedCourseId(String(event.active.id));
  }

  function handleCourseDragEnd(event: DragEndEvent)
  {
    const courseId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    setDraggedCourseId(null);

    if (!overId)
    {
      return;
    }

    if (overId === "course-bank")
    {
      moveCourseToSemester(courseId, null);
      return;
    }

    if (overId === "trash-zone")
    {
      const course = plan.courses.find((item) => item.id === courseId);
      removeCourse(courseId);

      if (course)
      {
        showNoticeMessage(`${course.courseCode} deleted from planner.`);
      }
      return;
    }

    if (overId.startsWith("semester-"))
    {
      moveCourseToSemester(courseId, Number.parseInt(overId.slice("semester-".length), 10));
    }
  }

  function handleSearchResultClick(course: CourseSearchResult)
  {
    const normalizedCode = course.courseCode.trim().toUpperCase();
    if (selectedCodes.has(normalizedCode))
    {
      return;
    }

    const catalogCourse = createCatalogStudyPlanCourse(course);
    updatePlan((current) => ({
      ...current,
      courses: [...current.courses, catalogCourse],
    }));
    setSearchQuery("");
  }

  return (
    <div className="px-3 pb-6 pt-8 md:px-[16px]">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[1rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {isCustomCourse ? (
                <BookIcon className="h-7 w-7 text-[var(--primary)]" />
                ) : (
                <SearchIcon className="h-7 w-7 text-[var(--primary)]" />
                )}
                <div>
                <h2 className="text-[28px] font-medium leading-9 tracking-[-0.02em] text-[var(--on-surface)]">Add a Course</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomCourse((current) => !current)}
                className="relative inline-grid h-[34px] grid-cols-2 self-start overflow-hidden rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-[2px]"
                aria-pressed={isCustomCourse}
                aria-label={`Add course mode: ${isCustomCourse ? "Custom" : "Search"}. Click to toggle.`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute bottom-[2px] left-[2px] top-[2px] w-[calc(50%-2px)] rounded-[0.3rem] bg-[var(--primary)] shadow-sm transition-transform duration-300 ease-out ${isCustomCourse ? "translate-x-full" : "translate-x-0"}`}
                />
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex min-w-[4.25rem] items-center justify-center rounded-[0.3rem] px-2.5 py-2 text-[12px] font-semibold leading-4 transition-colors duration-300 ${!isCustomCourse ? "text-[var(--on-primary)]" : "text-[var(--on-surface-variant)]"}`}
                >
                  Search
                </span>
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex min-w-[4.25rem] items-center justify-center rounded-[0.3rem] px-2.5 py-2 text-[12px] font-semibold leading-4 transition-colors duration-300 ${isCustomCourse ? "text-[var(--on-primary)]" : "text-[var(--on-surface-variant)]"}`}
                >
                  Custom
                </span>
              </button>
            </div>

            {!isCustomCourse ? (
              <div className="mt-3">
                <label className="sr-only" htmlFor="study-plan-offered-in">Offered In</label>
                <select
                  id="study-plan-offered-in"
                  value={searchSemesterId === "all" ? "" : String(searchSemesterId)}
                  onChange={(event) => setSearchSemesterId(event.target.value ? Number.parseInt(event.target.value, 10) : "all")}
                  className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="">Any Semester</option>
                  {semesters.map((semester) => (
                    <option key={semester.semesterId} value={semester.semesterId}>
                      {semester.semesterName} ({semester.academicYear})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {isCustomCourse ? (
              <div className="mt-3 grid gap-3">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Course Code or Course Name  (E.g. 'NCO101' or 'Work Attachment')"
                  className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={manualCredits}
                    onChange={(event) => setManualCredits(event.target.value)}
                    placeholder="Credit units"
                    className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                  />
                  <input
                    type="number"
                    min="1"
                    max={plan.numSemesters}
                    value={manualSemesterSpan}
                    onChange={(event) => setManualSemesterSpan(event.target.value)}
                    placeholder="Semester span"
                    className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={addManualCourse}
                  className="inline-flex items-center justify-center gap-2 rounded-[0.75rem] bg-[var(--primary)] px-4 py-2.5 text-[13px] font-semibold leading-5 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)]"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Custom Module
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <label className="relative z-30 block">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by Course Code or Title..."
                    className="w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-2.5 pl-10 pr-4 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                  />
                  {searchQuery.trim() ? (
                    <div className="elev-3 absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[28rem] overflow-y-auto rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
                      {searchDropdownResults.map((course) => (
                        <button
                          key={course.courseCode}
                          type="button"
                          className="block w-full rounded-[0.6rem] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-container-high)]"
                          onClick={() => handleSearchResultClick(course)}
                        >
                          <div className="min-w-0">
                            <span className="text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
                              {course.courseCode}
                            </span>
                            <p className="mt-0.5 truncate text-[12px] leading-5 text-[var(--on-surface)]">
                              {course.courseName ?? "Untitled course"}
                            </p>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-4 text-[var(--on-surface-variant)]">
                            <span className="inline-flex items-center gap-1">
                              <BookIcon className="h-3.5 w-3.5" />
                              {formatCredits(course.creditUnits ?? 0)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <SchoolIcon className="h-3.5 w-3.5" />
                              {course.schoolName ?? "School unavailable"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              {formatOfferedSemesters(course)}
                            </span>
                          </div>
                        </button>
                      ))}

                      {searchLoading ? (
                        <div className="px-3 py-2 text-[11px] leading-[14px] text-[var(--on-surface-variant)]">Searching…</div>
                      ) : null}

                      {!searchLoading && searchDropdownResults.length === 0 ? (
                        <div className="rounded-[0.5rem] border border-dashed border-[var(--outline-variant)] px-4 py-3 text-center text-[11px] font-medium leading-4 text-[var(--on-surface-variant)]">
                          No matching courses
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </label>
              </div>
            )}
          </div>

          <div className="rounded-[1rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-5 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarWeekIcon className="h-7 w-7 text-[var(--primary)]" />
                  <h1 className="text-[28px] font-extrabold leading-9 tracking-[-0.02em] text-[var(--on-surface)]">Semester Planner</h1>
                </div>
                <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[var(--on-surface-variant)]">
                  Forecast your courses and credit units fulfilment
                </p>
              </div>

              <div className="flex flex-col items-start gap-1.5 self-start md:items-end">
                <div className="flex gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={openPlanPdf}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[0.6rem] bg-[var(--primary)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-[var(--on-primary)] shadow-[var(--shadow-elev-1)] transition-colors hover:bg-[var(--primary-container)]"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetConfirmOpen(true)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[0.6rem] border border-[var(--error)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-[var(--error)] transition-colors hover:bg-[var(--error-container)]"
                  >
                    <RefreshIcon className="h-3.5 w-3.5" />
                    Reset Planner
                  </button>
                </div>
                <div className="relative self-start md:self-end" data-backup-popover-root>
                  <button
                    type="button"
                    onClick={() => setBackupMenuOpen((current) => !current)}
                    aria-expanded={backupMenuOpen}
                    aria-haspopup="menu"
                    className="inline-flex items-center gap-1.5 rounded-[0.5rem] border border-transparent px-2 py-1.5 text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-colors hover:border-[var(--outline-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    Backup Plan
                  </button>
                  {backupMenuOpen ? (
                    <div className="elev-3 absolute right-auto top-full z-30 mt-1.5 w-[17rem] rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-2 md:right-0">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-[7px] left-5 h-3 w-3 rotate-45 border-l border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] md:left-auto md:right-5"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={exportPlan}
                          className="inline-flex items-center justify-center gap-1.5 rounded-[0.55rem] border border-[var(--brand-divider)] bg-[var(--surface-container)] px-2.5 py-2 text-[11px] font-bold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          Export
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBackupMenuOpen(false);
                            importFileInputRef.current?.click();
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-[0.55rem] border border-[var(--brand-divider)] bg-[var(--surface-container)] px-2.5 py-2 text-[11px] font-bold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]"
                        >
                          <UploadIcon className="h-4 w-4" />
                          Import
                        </button>
                      </div>
                      <p className="mt-2 border-t border-[var(--outline-variant)] px-1 pt-2 text-[10px] leading-4 text-[var(--on-surface-variant)]">
                        Export a restorable JSON backup, or import one to replace your current semester plan after confirmation.
                      </p>
                    </div>
                  ) : null}
                </div>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    void selectImportFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Target Credits</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={plan.totalCreditsGoal}
                  onChange={(event) => updatePlan((current) => ({
                    ...current,
                    totalCreditsGoal: Math.max(0, Number(event.target.value) || 0),
                  }))}
                  className="w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Semesters</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={plan.numSemesters}
                  onChange={(event) => updatePlan((current) => ({
                    ...current,
                    numSemesters: Math.max(1, Math.min(20, Number.parseInt(event.target.value, 10) || 1)),
                  }))}
                  className="w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </label>
            </div>

            <div className="mt-4 rounded-[0.85rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-semibold text-[var(--on-surface)]">Credits Allocated</span>
                <span className={`text-[12px] font-semibold ${isOverTargetCredits ? "text-[var(--error)]" : "text-[var(--on-surface-variant)]"}`}>
                  {formatCredits(assignedCredits)} / {formatCredits(plan.totalCreditsGoal)}
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                <div
                  className={`h-full rounded-full transition-all ${isOverTargetCredits ? "bg-[var(--error)]" : "bg-[var(--primary)]"}`}
                  style={{ width: `${creditProgressBarPercent}%` }}
                />
              </div>
              <p className={`mt-2 text-[11px] font-medium ${isOverTargetCredits ? "text-[var(--error)]" : "text-[var(--on-surface-variant)]"}`}>
                {plan.totalCreditsGoal > 0
                  ? `${Number(creditProgressPercent.toFixed(1))}% of target credits allocated`
                  : "Set a target credits value to track allocation progress."}
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <SummaryStat icon={<CalendarWeekIcon className="h-5 w-5" />} label="Assigned" value={formatCredits(assignedCredits)} />
              <SummaryStat icon={<EditCalendarIcon className="h-5 w-5" />} label="Planned" value={formatCredits(plan.totalCreditsGoal)} />
              <SummaryStat icon={<ListIcon className="h-5 w-5" />} label="Total Courses" value={String(sortedCourses.length)} />
            </div>
          </div>
        </section>

        {notice ? (
          <div className="rounded-[0.85rem] border border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] px-4 py-3 text-[13px] font-medium leading-5 text-[var(--primary)]">
            {notice}
          </div>
        ) : null}

        <DndContext
          autoScroll={{
            activator: AutoScrollActivator.Pointer,
            layoutShiftCompensation: false,
          }}
          sensors={sensors}
          onDragStart={handleCourseDragStart}
          onDragEnd={handleCourseDragEnd}
        >
        <section className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className={`space-y-4 lg:sticky lg:top-[90px] lg:max-h-[calc(100vh-110px)] lg:self-start lg:pr-1 ${
            draggedCourseId ? "lg:overflow-visible" : "lg:overflow-y-auto"
          }`}>
            <DroppableDiv
              id="course-bank"
              className={(isOver) => `rounded-[1rem] border px-4 py-4 transition-all ${
                isOver
                  ? "border-[var(--primary)] bg-[var(--brand-chip-bg)] shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                  : "border-[var(--brand-divider)] bg-[var(--surface-container-low)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Module Bank</h2>
                  {showAllModules || draggedCourseId ? (
                    <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                      {showAllModules ? "(Edit Mode)" : "Drop here to send a module back to the bank."}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllModules((current) => !current)}
                  className="inline-flex min-w-[8.75rem] shrink-0 justify-center self-start rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-1 text-[12px] font-semibold leading-5 whitespace-nowrap text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:text-[var(--primary)]"
                >
                  {showAllModules ? "Show Available" : "Show All"}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {bankCourses.length === 0 ? (
                  <p className="rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] px-3 py-4 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    {showAllModules ? "No modules added yet." : "All courses have been assigned."}
                  </p>
                ) : null}

                {bankCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    ghost={showAllModules && course.assignedSemester !== null}
                    isDragging={draggedCourseId === course.id}
                    draggable={course.assignedSemester === null}
                    onEdit={course.source === "manual" ? () => setEditingCourseId(course.id) : undefined}
                    onDelete={showAllModules ? () => deleteCourseFromBank(course) : undefined}
                  />
                ))}
              </div>
            </DroppableDiv>

            <DroppableDiv
              id="trash-zone"
              className={(isOver) => `rounded-[1rem] border-2 border-dashed px-4 py-5 text-center transition-all ${
                isOver
                  ? "scale-[1.03] border-red-500 bg-red-500/10 text-red-400 shadow-[0_12px_30px_rgba(239,68,68,0.15)]"
                  : draggedCourseId
                    ? "border-red-400 bg-red-500/6 text-red-300"
                    : "border-red-500/60 bg-transparent text-red-300/90"
              }`}
            >
              {(isOver) => (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <TrashIcon className={`h-5 w-5 transition-transform ${isOver ? "scale-110" : ""}`} />
                    <span className="text-[15px] font-semibold leading-6">
                      {isOver ? "Release to delete course" : "Drag here to delete course"}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 opacity-80">
                    This action cannot be undone.
                  </p>
                </>
              )}
            </DroppableDiv>
          </aside>

          <section className="space-y-4">
            <div className="space-y-3">
              {semesterIndexes.map((semesterIndex) => {
                const startingCourses = sortedCourses.filter((course) => course.assignedSemester === semesterIndex);
                const continuedCourses = sortedCourses.filter((course) => (
                  course.assignedSemester !== null
                  && course.assignedSemester < semesterIndex
                  && (course.assignedSemester + course.semesterSpan) > semesterIndex
                ));
                const semesterCreditUnits = startingCourses.reduce((sum, course) => sum + course.creditUnits, 0);

                return (
                  <DroppableArticle
                    key={semesterIndex}
                    id={`semester-${semesterIndex}`}
                    className={(isOver) => `rounded-[1rem] border px-4 py-4 transition-all ${
                      isOver
                        ? "border-[var(--primary)] bg-[var(--brand-chip-bg)] shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                        : "border-[var(--brand-divider)] bg-[var(--surface-container-low)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">
                          Semester {semesterIndex + 1}
                        </h2>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[16px] font-bold leading-6 text-[var(--primary)]">
                          {formatCreditCount(semesterCreditUnits)}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteSemester(semesterIndex)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[0.5rem] text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                          aria-label={`Delete semester ${semesterIndex + 1}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {continuedCourses.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {continuedCourses.map((course) => (
                          <span
                            key={`${course.id}-continued-${semesterIndex}`}
                            className="rounded-[999px] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-1 text-[11px] font-medium leading-4 text-[var(--on-surface-variant)]"
                          >
                            {course.courseCode} continues
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {startingCourses.length === 0 ? (
                        <p className="rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] px-3 py-5 text-[12px] leading-5 text-[var(--on-surface-variant)] sm:col-span-2 xl:col-span-3">
                          {draggedCourseId ? "Drop module here." : "Move modules here from the planner bank."}
                        </p>
                      ) : null}

                      {startingCourses.map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          isDragging={draggedCourseId === course.id}
                          draggable
                          onEdit={course.source === "manual" ? () => setEditingCourseId(course.id) : undefined}
                        />
                      ))}
                    </div>
                  </DroppableArticle>
                );
              })}

              <article className="rounded-[1rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface-variant)]">
                    New Semester
                  </h2>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={addSemester}
                    className="flex w-full items-center justify-center gap-2 rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-5 text-[12px] font-semibold leading-5 text-[var(--primary)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)]"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Add Semester</span>
                  </button>
                </div>
              </article>
            </div>
          </section>
        </section>
        <DragOverlay
          dropAnimation={null}
          style={{ zIndex: 9999 }}
          adjustScale={false}
        >
          {draggedCourse ? <CourseDragOverlay course={draggedCourse} /> : null}
        </DragOverlay>
        </DndContext>
      </div>

      <Modal
        open={importedPlan !== null}
        title="Import Semester Plan?"
        description={`Importing ${importedPlanFileName || "this backup"} will replace your current semester plan.`}
        onClose={() => {
          setImportedPlan(null);
          setImportedPlanFileName("");
        }}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              onClick={() => {
                setImportedPlan(null);
                setImportedPlanFileName("");
              }}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPlanImport}
              className="rounded-[0.7rem] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)]"
            >
              Replace Current Plan
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[var(--on-surface-variant)]">
          The backup contains {importedPlan?.courses.length ?? 0} modules across {importedPlan?.numSemesters ?? 0} semesters. Export your current plan first if you may need it later.
        </p>
      </Modal>

      <Modal
        open={resetConfirmOpen}
        title="Reset Planner?"
        description="This will clear all modules, semester assignments, and planner settings."
        onClose={() => setResetConfirmOpen(false)}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                resetPlan();
                setResetConfirmOpen(false);
              }}
              className="rounded-[0.7rem] bg-red-500 px-3 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-red-400"
            >
              Reset Planner
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[var(--on-surface-variant)]">
          You can&apos;t undo this reset. If you only want to rearrange modules, use drag and drop instead.
        </p>
      </Modal>

      <Modal
        open={editingCourse !== null}
        title="Edit Custom Module"
        description="Update the combined module label, credit units, or semester span for this custom module."
        onClose={() => setEditingCourseId(null)}
        maxWidthClassName="max-w-lg"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setEditingCourseId(null)}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEditedCustomCourse}
              className="rounded-[0.7rem] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)]"
            >
              Save Changes
            </button>
          </>
        )}
      >
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[12px] font-semibold leading-5 text-[var(--on-surface-variant)]">
              Course Code or Course Name
            </span>
            <input
              type="text"
              value={editingCode}
              onChange={(event) => setEditingCode(event.target.value)}
              placeholder="E.g. NCO101 or Work Attachment"
              className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold leading-5 text-[var(--on-surface-variant)]">
                Credit Units
              </span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editingCredits}
                onChange={(event) => setEditingCredits(event.target.value)}
                placeholder="Credit units"
                className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold leading-5 text-[var(--on-surface-variant)]">
                Semester Span
              </span>
              <input
                type="number"
                min="1"
                max={plan.numSemesters}
                value={editingSemesterSpan}
                onChange={(event) => setEditingSemesterSpan(event.target.value)}
                placeholder="Semester span"
                className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
})
{
  return (
    <div className="rounded-[0.85rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] px-3 py-3">
      <div className="flex items-center gap-2 text-[var(--primary)]">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{label}</span>
      </div>
      <p className="mt-2 text-[18px] font-semibold leading-6 text-[var(--on-surface)]">{value}</p>
    </div>
  );
}

function CourseCard({
  course,
  draggable = false,
  ghost = false,
  isDragging = false,
  onEdit,
  onDelete,
}: {
  course: StudyPlanCourse;
  draggable?: boolean;
  ghost?: boolean;
  isDragging?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
})
{
  const draggableId = draggable ? course.id : `static-${course.id}`;
  const {
    attributes,
    isDragging: isDndDragging,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id: draggableId,
    disabled: !draggable,
    data: {
      course,
      assignedSemester: course.assignedSemester,
    },
  });
  const active = isDragging || isDndDragging;
  const catchingTransform = useCatchingGhostTransform(transform, active);
  const displayedTransform = catchingTransform ?? transform;
  const activeTransform = active ? " rotate(1deg) scale(1.05)" : "";
  const style: CSSProperties = {
    pointerEvents: isDndDragging ? "none" : "auto",
    transform: displayedTransform
      ? `translate3d(${displayedTransform.x}px, ${displayedTransform.y}px, 0)${activeTransform}`
      : active
        ? activeTransform.trim()
        : undefined,
    transformOrigin: "center",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={`rounded-[0.85rem] border px-3 py-2.5 ${active ? "transition-colors duration-200" : "transition-all duration-200"} ${
        draggable ? "cursor-grab active:cursor-grabbing select-none touch-none" : ""
      } ${
        active
          ? "border-[var(--primary)] bg-[var(--brand-chip-bg)] opacity-50 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
          : ghost
            ? "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] opacity-55"
            : "border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] hover:border-[var(--outline-variant)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
                {course.courseCode}
              </p>
              {course.semesterSpan > 1 ? (
                <span className="shrink-0 rounded-[999px] border border-[var(--outline-variant)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                  {course.semesterSpan} sem
                </span>
              ) : null}
            </div>
            <span className="shrink-0 text-[12px] font-semibold leading-5 text-[var(--primary)]">
              {formatCredits(course.creditUnits)}
            </span>
          </div>
          <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-5 text-[var(--on-surface-variant)]">
            {course.courseName}
            {ghost ? " (assigned)" : ""}
          </p>
        </div>

        {onEdit || onDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[0.5rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                aria-label={`Edit ${course.courseCode}`}
              >
                <EditIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[0.5rem] border border-red-500/30 text-red-400 transition-colors hover:border-red-400/70 hover:bg-red-500/10 hover:text-red-300"
                aria-label={`Delete ${course.courseCode}`}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CourseDragOverlay({
  course,
}: {
  course: StudyPlanCourse;
})
{
  return (
    <article className="pointer-events-none rounded-[0.85rem] border-2 border-[var(--primary)] bg-[var(--surface-container-lowest)] px-3 py-2.5 opacity-95 shadow-[0_16px_32px_rgba(15,23,42,0.2)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
            {course.courseCode}
          </p>
          <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-5 text-[var(--on-surface-variant)]">
            {course.courseName}
          </p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold leading-5 text-[var(--primary)]">
          {formatCredits(course.creditUnits)}
        </span>
      </div>
    </article>
  );
}

function DroppableDiv({
  children,
  className,
  id,
}: {
  children: ReactNode | ((isOver: boolean) => ReactNode);
  className: (isOver: boolean) => string;
  id: string;
})
{
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={className(isOver)}>
      {typeof children === "function" ? children(isOver) : children}
    </div>
  );
}

function DroppableArticle({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className: (isOver: boolean) => string;
  id: string;
})
{
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <article ref={setNodeRef} className={className(isOver)}>
      {children}
    </article>
  );
}
