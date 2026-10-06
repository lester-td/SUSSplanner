"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragStartEvent } from "@dnd-kit/core";

import {
  BackupIcon,
  BookIcon,
  ContinueIcon,
  ChevronRightIcon,
  EditIcon,
  DownloadIcon,
  ListIcon,
  PlusIcon,
  RefreshIcon,
  SchoolIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/planner/icons";
import {
  CourseCard,
  CourseDragOverlay,
  DroppableArticle,
  SEMESTER_DROP_ID_PREFIX,
  getCourseDropTarget,
  getPlannerDropZoneClass,
} from "@/components/planner/semester-planner/drag-drop";
import {
  buildSemesterOptions,
  formatCreditCount,
  formatCredits,
  formatOfferedSemesters,
  sortCourses,
} from "@/components/planner/semester-planner/formatting";
import { SemesterPlannerPanel } from "@/components/planner/semester-planner/panel";
import { PlannerMobileCourseRow, PlannerMobileSheet, usePlannerMobileScrollLock } from "@/components/planner/semester-planner/mobile";
import { PlannerPopover } from "@/components/planner/semester-planner/popover";
import { SemesterPlannerPreviewSummary, SemesterPlannerSharePreview } from "@/components/planner/semester-planner/share-preview";
import { ActionButton } from "@/components/ui/actions";
import { CourseModeSwitch } from "@/components/ui/course-mode-switch";
import { Modal } from "@/components/ui/modal";
import { openSemesterPlannerPrintView } from "@/lib/export/semester-planner-print";
import {
  SEMESTER_PLANNER_UPDATED_EVENT,
  createCatalogSemesterPlannerCourse,
  createManualSemesterPlannerCourse,
  defaultSemesterPlannerState,
  loadSemesterPlannerState,
  normalizeSemesterPlannerState,
  parseSemesterPlannerBackup,
  saveSemesterPlannerState,
  serializeSemesterPlannerBackup,
} from "@/lib/planner/storage";
import type { SemesterPlannerCourse, SemesterPlannerState } from "@/lib/planner/types";
import { decodeSemesterPlannerShareUrl, encodeSemesterPlannerShareUrl } from "@/lib/planner/share-url";
import type { CourseSearchResult, SemesterRecord } from "@/lib/timetable/types";

type SearchResponse = {
  courses: CourseSearchResult[];
};

type MobilePanel = "add" | "bank" | "course" | "destination" | "remove";

const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0)
  {
    return pointerCollisions;
  }

  return rectIntersection(args);
};

const MOBILE_DRAG_SCROLL_EDGE_SIZE = 96;
const MOBILE_DRAG_SCROLL_MAX_SPEED = 18;

function getDragClientY(event: Event)
{
  if ("clientY" in event && typeof event.clientY === "number")
  {
    return event.clientY;
  }

  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent)
  {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch?.clientY ?? null;
  }

  return null;
}

export function SemesterPlannerClient({
  semesters,
}: {
  semesters: SemesterRecord[];
})
{
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | null>(null);
  const [mobileCourseId, setMobileCourseId] = useState<string | null>(null);
  const [expandedSemesters, setExpandedSemesters] = useState<Set<number>>(() => new Set([0]));
  const [scrollToSemester, setScrollToSemester] = useState<number | null>(null);
  const [plan, setPlan] = useState<SemesterPlannerState>(defaultSemesterPlannerState());
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
  const [importedPlan, setImportedPlan] = useState<SemesterPlannerState | null>(null);
  const [importedPlanFileName, setImportedPlanFileName] = useState("");
  const [importedPlanSource, setImportedPlanSource] = useState<"backup" | "shared">("backup");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  usePlannerMobileScrollLock(isMobile && (editingCourseId !== null || resetConfirmOpen || importedPlan !== null || shareOpen));
  const noticeTimeoutRef = useRef<number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const searchAnchorRef = useRef<HTMLLabelElement | null>(null);
  const backupAnchorRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mobileDragScrollFrameRef = useRef<number | null>(null);
  const mobileDragPointerYRef = useRef<number | null>(null);
  const mobileDragTrackingCleanupRef = useRef<(() => void) | null>(null);
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
    setPlan(loadSemesterPlannerState() ?? defaultSemesterPlannerState());
    setReady(true);
  }, []);

  useEffect(() => {
    let request = 0;
    let disposed = false;
    const readSharedPlan = async () => {
      const currentRequest = ++request;
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.slice(1));
      if (!params.has("plan")) return;
      try
      {
        const incoming = await decodeSemesterPlannerShareUrl(params.get("plan") ?? "");
        if (disposed || currentRequest !== request || window.location.hash !== hash) return;
        setImportedPlan(incoming);
        setImportedPlanFileName("");
        setImportedPlanSource("shared");
        setMobilePanel(null);
        setShareOpen(false);
      }
      catch (error)
      {
        if (disposed || currentRequest !== request || window.location.hash !== hash) return;
        showNoticeMessage(typeof DecompressionStream === "undefined" && error instanceof Error
          ? error.message
          : "Unable to open shared plan. The link is invalid or unsupported.");
        clearSharedPlanHash();
      }
    };
    void readSharedPlan();
    window.addEventListener("hashchange", readSharedPlan);
    return () => {
      disposed = true;
      request++;
      window.removeEventListener("hashchange", readSharedPlan);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updateMobile = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobilePanel(null);
    };
    updateMobile();
    media.addEventListener("change", updateMobile);
    return () => media.removeEventListener("change", updateMobile);
  }, []);

  useEffect(() => {
    if (mobilePanel !== null || scrollToSemester === null) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`planner-mobile-semester-${scrollToSemester}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      setScrollToSemester(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobilePanel, scrollToSemester]);

  useEffect(() => {
    if (isMobile) return;
    const updateSidebarHeight = () => {
      const sidebar = sidebarRef.current;
      if (sidebar)
      {
        sidebar.style.setProperty("--planner-sidebar-visible-top", `${Math.max(80, sidebar.getBoundingClientRect().top)}px`);
      }
    };

    updateSidebarHeight();
    window.addEventListener("scroll", updateSidebarHeight);
    window.addEventListener("resize", updateSidebarHeight);

    return () => {
      window.removeEventListener("scroll", updateSidebarHeight);
      window.removeEventListener("resize", updateSidebarHeight);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    saveSemesterPlannerState(plan);
  }, [plan, ready]);

  useEffect(() => {
    const syncPlanState = () => {
      const saved = loadSemesterPlannerState();
      if (saved)
      {
        setPlan(saved);
      }
    };

    window.addEventListener("storage", syncPlanState);
    window.addEventListener(SEMESTER_PLANNER_UPDATED_EVENT, syncPlanState);

    return () => {
      window.removeEventListener("storage", syncPlanState);
      window.removeEventListener(SEMESTER_PLANNER_UPDATED_EVENT, syncPlanState);
    };
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }

    if (mobileDragScrollFrameRef.current !== null)
    {
      window.cancelAnimationFrame(mobileDragScrollFrameRef.current);
    }

    mobileDragTrackingCleanupRef.current?.();
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
  const mobileCourse = sortedCourses.find((course) => course.id === mobileCourseId) ?? null;
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

  function stopMobileDragAutoScroll()
  {
    mobileDragPointerYRef.current = null;
    mobileDragTrackingCleanupRef.current?.();
    mobileDragTrackingCleanupRef.current = null;

    if (mobileDragScrollFrameRef.current !== null)
    {
      window.cancelAnimationFrame(mobileDragScrollFrameRef.current);
      mobileDragScrollFrameRef.current = null;
    }
  }

  function startMobileDragAutoScroll(event: Event)
  {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches)
    {
      return;
    }

    stopMobileDragAutoScroll();
    updateMobileDragAutoScroll(getDragClientY(event));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateMobileDragAutoScroll(moveEvent.clientY);
    };
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touch = moveEvent.touches[0] ?? moveEvent.changedTouches[0];
      if (touch)
      {
        updateMobileDragAutoScroll(touch.clientY);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });

    mobileDragTrackingCleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("touchmove", handleTouchMove, { capture: true });
    };
  }

  function updateMobileDragAutoScroll(pointerY: number | null)
  {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches)
    {
      stopMobileDragAutoScroll();
      return;
    }

    mobileDragPointerYRef.current = pointerY;

    if (pointerY === null || mobileDragScrollFrameRef.current !== null)
    {
      return;
    }

    const scroll = () => {
      const currentPointerY = mobileDragPointerYRef.current;

      if (currentPointerY === null)
      {
        mobileDragScrollFrameRef.current = null;
        return;
      }

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const scrollTop = window.scrollY;
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const topDistance = currentPointerY;
      const bottomDistance = viewportHeight - currentPointerY;
      let scrollAmount = 0;

      if (topDistance < MOBILE_DRAG_SCROLL_EDGE_SIZE)
      {
        const edgeRatio = (MOBILE_DRAG_SCROLL_EDGE_SIZE - Math.max(0, topDistance)) / MOBILE_DRAG_SCROLL_EDGE_SIZE;
        scrollAmount = -Math.ceil(edgeRatio * MOBILE_DRAG_SCROLL_MAX_SPEED);
      }
      else if (bottomDistance < MOBILE_DRAG_SCROLL_EDGE_SIZE)
      {
        const edgeRatio = (MOBILE_DRAG_SCROLL_EDGE_SIZE - Math.max(0, bottomDistance)) / MOBILE_DRAG_SCROLL_EDGE_SIZE;
        scrollAmount = Math.ceil(edgeRatio * MOBILE_DRAG_SCROLL_MAX_SPEED);
      }

      const maxScrollTop = Math.max(0, documentHeight - viewportHeight);
      const canScrollUp = scrollTop > 0;
      const canScrollDown = scrollTop < maxScrollTop;

      if ((scrollAmount < 0 && canScrollUp) || (scrollAmount > 0 && canScrollDown))
      {
        window.scrollTo({
          top: Math.min(maxScrollTop, Math.max(0, scrollTop + scrollAmount)),
          behavior: "auto",
        });
      }

      mobileDragScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    mobileDragScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }

  function updatePlan(updater: (current: SemesterPlannerState) => SemesterPlannerState)
  {
    setPlan((current) => normalizeSemesterPlannerState(updater(current)));
  }

  function removeCourse(courseId: string)
  {
    updatePlan((current) => ({
      ...current,
      courses: current.courses.filter((course) => course.id !== courseId),
    }));
  }

  function deleteCourseFromBank(course: SemesterPlannerCourse)
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
    setPlan(defaultSemesterPlannerState());
    showNoticeMessage("Planner reset.");
  }

  function exportPlan()
  {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([serializeSemesterPlannerBackup(plan)], { type: "application/json" });
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
    if (!openSemesterPlannerPrintView(plan))
    {
      showNoticeMessage("Unable to open PDF view. Allow pop-ups and try again.");
    }
  }

  async function openPlanShare()
  {
    setShareUrl("");
    setShareMessage("");
    setShareOpen(true);
    try
    {
      const path = await encodeSemesterPlannerShareUrl(plan);
      setShareUrl(new URL(path, window.location.origin).href);
    }
    catch (error)
    {
      setShareMessage(error instanceof Error ? error.message : "Unable to create a share link. Please try again.");
    }
  }

  async function copyPlanShareLink()
  {
    try
    {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Link copied.");
    }
    catch
    {
      setShareMessage("Select and copy the link above.");
    }
  }

  async function sharePlanLink()
  {
    try
    {
      await navigator.share({ title: "Semester Planner", url: shareUrl });
    }
    catch (error)
    {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyPlanShareLink();
    }
  }

  function clearSharedPlanHash()
  {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (!params.has("plan")) return;
    params.delete("plan");
    const remaining = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ""}`);
  }

  function dismissPlanImport()
  {
    if (importedPlanSource === "shared") clearSharedPlanHash();
    setImportedPlan(null);
    setImportedPlanFileName("");
    setImportedPlanSource("backup");
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
      setImportedPlan(parseSemesterPlannerBackup(await file.text()));
      setImportedPlanFileName(file.name);
      setImportedPlanSource("backup");
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
    setExpandedSemesters(new Set([0]));
    showNoticeMessage(importedPlanSource === "shared" ? "Shared plan saved." : "Semester plan imported.");
    dismissPlanImport();
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

  function closeMobilePanel()
  {
    setMobilePanel(null);
    setMobileCourseId(null);
    setSearchQuery("");
  }

  function openMobileDestination(courseId: string)
  {
    setMobileCourseId(courseId);
    setMobilePanel("destination");
  }

  function assignMobileCourse(semesterIndex: number | null)
  {
    if (!mobileCourse) return;
    moveCourseToSemester(mobileCourse.id, semesterIndex);
    showNoticeMessage(semesterIndex === null
      ? `${mobileCourse.courseCode} is in the module bank.`
      : `${mobileCourse.courseCode} assigned to Semester ${semesterIndex + 1}.`);
    if (semesterIndex !== null)
    {
      setExpandedSemesters((current) => new Set(current).add(semesterIndex));
      setScrollToSemester(semesterIndex);
    }
    closeMobilePanel();
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

    const nextCourse = createManualSemesterPlannerCourse({
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
    if (isMobile) openMobileDestination(nextCourse.id);
    else showNoticeMessage("Custom module added to planner bank.");
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
    startMobileDragAutoScroll(event.activatorEvent);
  }

  function handleCourseDragCancel()
  {
    setDraggedCourseId(null);
    stopMobileDragAutoScroll();
  }

  function handleCourseDragEnd(event: DragEndEvent)
  {
    const courseId = String(event.active.id);
    const dropTarget = getCourseDropTarget(event.over ? String(event.over.id) : null);

    setDraggedCourseId(null);
    stopMobileDragAutoScroll();

    if (!dropTarget)
    {
      return;
    }

    if (dropTarget.type === "bank")
    {
      moveCourseToSemester(courseId, null);
      return;
    }

    if (dropTarget.type === "trash")
    {
      const course = plan.courses.find((item) => item.id === courseId);
      removeCourse(courseId);

      if (course)
      {
        showNoticeMessage(`${course.courseCode} deleted from planner.`);
      }
      return;
    }

    if (dropTarget.type === "semester")
    {
      moveCourseToSemester(courseId, dropTarget.semesterIndex);
    }
  }

  function handleSearchResultClick(course: CourseSearchResult)
  {
    const normalizedCode = course.courseCode.trim().toUpperCase();
    if (selectedCodes.has(normalizedCode))
    {
      return;
    }

    const catalogCourse = createCatalogSemesterPlannerCourse(course);
    updatePlan((current) => ({
      ...current,
      courses: [...current.courses, catalogCourse],
    }));
    setSearchQuery("");
    if (isMobile) openMobileDestination(catalogCourse.id);
  }

  const progressPanel = (
    <section aria-labelledby="planner-progress-heading" className="app-aero-panel planner-section planner-progress-panel min-w-0">
      <div className="app-aero-panel-heading">
        <ListIcon className="h-5 w-5 text-[var(--primary)]" />
        <h2 id="planner-progress-heading" className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">Progress</h2>
        <div className="ml-auto">
          <ActionButton variant="ghost" icon={<ShareIcon className="h-4 w-4" />} label="Share" onClick={() => { void openPlanShare(); }} disabled={!ready} />
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Target Credits</span>
            <input
              type="number"
              min="0"
              step="2.5"
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

        <div className="planner-credit-allocation mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Credits Allocated</span>
            <span className={`text-[12px] font-semibold ${isOverTargetCredits ? "text-[var(--error)]" : "text-[var(--on-surface-variant)]"}`}>
              {Number(assignedCredits.toFixed(1))} / {formatCredits(plan.totalCreditsGoal)}
              {plan.totalCreditsGoal > 0 ? ` · ${Number(creditProgressPercent.toFixed(1))}%` : ""}
            </span>
          </div>
          <div className="planner-progress-track mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
            <div
              className={`planner-progress-fill h-full rounded-full transition-all ${isOverTargetCredits ? "planner-progress-fill--error bg-[var(--error)]" : "bg-[var(--primary)]"}`}
              style={{ width: `${creditProgressBarPercent}%` }}
            />
          </div>
          <p className={`mt-2 text-[11px] font-medium ${isOverTargetCredits ? "text-[var(--error)]" : "text-[var(--on-surface-variant)]"}`}>
            {plan.totalCreditsGoal > 0
              ? isOverTargetCredits
                ? `${formatCredits(assignedCredits - plan.totalCreditsGoal)} over target`
                : `${formatCredits(plan.totalCreditsGoal - assignedCredits)} remaining`
              : "Set a target credits value to track allocation progress."}
            {` · ${sortedCourses.length} ${sortedCourses.length === 1 ? "course" : "courses"} added`}
          </p>
        </div>
        <div ref={backupAnchorRef} className="planner-plan-actions relative mt-4 border-t border-[var(--outline-variant)] pt-4">
          <ActionButton
            variant="ghost"
            icon={<DownloadIcon className="h-[18px] w-[18px]" />}
            label="Download PDF"
            onClick={openPlanPdf}
          />
          <div data-backup-popover-root>
            <ActionButton
              variant="ghost"
              icon={<BackupIcon className="h-[18px] w-[18px]" />}
              label="Backup"
              onClick={() => setBackupMenuOpen((current) => !current)}
              aria-expanded={backupMenuOpen}
              aria-controls="semester-planner-backup"
            />
            {backupMenuOpen ? (
              <PlannerPopover anchorRef={backupAnchorRef} id="semester-planner-backup" width={272} backupRoot className="elev-3 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    variant="ghost"
                    icon={<DownloadIcon className="h-[18px] w-[18px]" />}
                    label="Export"
                    onClick={exportPlan}
                    stretch
                  />
                  <ActionButton
                    variant="ghost"
                    icon={<UploadIcon className="h-[18px] w-[18px]" />}
                    label="Import"
                    onClick={() => {
                      setBackupMenuOpen(false);
                      importFileInputRef.current?.click();
                    }}
                    stretch
                  />
                </div>
                <p className="mt-3 border-t border-[var(--outline-variant)] pt-2 text-[11px] leading-4 text-[var(--on-surface-variant)]">
                  Export a restorable JSON backup, or import one to replace your current semester plan after confirmation.
                </p>
              </PlannerPopover>
            ) : null}
          </div>
          <ActionButton
            variant="danger"
            icon={<RefreshIcon className="h-[18px] w-[18px]" />}
            label="Reset"
            onClick={() => setResetConfirmOpen(true)}
          />
        </div>
      </div>
    </section>
  );

  const moduleBankPanel = (
    <SemesterPlannerPanel
      mobile={isMobile}
      onAssignCourse={openMobileDestination}
      onManageCourse={(courseId) => { setMobileCourseId(courseId); setMobilePanel("course"); }}
      courseModeControl={(
        <CourseModeSwitch isCustom={isCustomCourse} onChange={setIsCustomCourse} />
      )}
      addCourseForm={(
        <>
          {!isCustomCourse ? (
            <div>
              <label className="sr-only" htmlFor="semester-planner-offered-in">Offered In</label>
              <select
                id="semester-planner-offered-in"
                value={searchSemesterId === "all" ? "" : String(searchSemesterId)}
                onChange={(event) => setSearchSemesterId(event.target.value ? Number.parseInt(event.target.value, 10) : "all")}
                className="w-full min-w-0 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-normal leading-4 text-[var(--on-surface)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
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
            <div className="grid gap-3">
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
              <ActionButton
                variant="ghost"
                icon={<PlusIcon className="h-[18px] w-[18px]" />}
                label="Add Custom Module"
                onClick={addManualCourse}
                stretch
              />
            </div>
          ) : (
            <div className="mt-3">
              <label ref={searchAnchorRef} className="relative z-20 block">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by Course Code or Title..."
                  className="w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-2.5 pl-10 pr-4 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
                {searchQuery.trim() ? (
                  <PlannerPopover inline={isMobile} anchorRef={searchAnchorRef} className="planner-search-results elev-3 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
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
                  </PlannerPopover>
                ) : null}
              </label>
            </div>
          )}
        </>
      )}
      bankCourses={isMobile ? unassignedCourses : bankCourses}
      draggedCourseId={draggedCourseId}
      showAllModules={showAllModules}
      onDeleteCourse={deleteCourseFromBank}
      onEditCourse={setEditingCourseId}
      onToggleShowAllModules={() => setShowAllModules((current) => !current)}
    />
  );

  return (
    <div className="planner-page">
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
      <div className="grid gap-5 lg:gap-6">
        <header className="pb-1 pt-3 sm:pb-0 md:pt-8">
          <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">
            Semester Planner
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:mt-2 sm:text-[15px] sm:leading-7">
            Forecast your courses and credit units fulfilment
          </p>
        </header>

        {isMobile ? (
          <section className="planner-mobile-progress" aria-label="Progress">
            <div className="planner-mobile-progress-summary">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-bold">Progress</span>
                <span className={`text-[13px] font-semibold ${isOverTargetCredits ? "text-[var(--error)]" : "text-[var(--primary)]"}`}>
                  {formatCredits(assignedCredits)} / {formatCredits(plan.totalCreditsGoal)}
                </span>
              </div>
              <div className="planner-progress-track my-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-container-high)]">
                <div className={`planner-progress-fill h-full rounded-full ${isOverTargetCredits ? "planner-progress-fill--error bg-[var(--error)]" : "bg-[var(--primary)]"}`} style={{ width: `${creditProgressBarPercent}%` }} />
              </div>
              <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--on-surface-variant)]">
                <span>{plan.totalCreditsGoal > 0 ? `${formatCredits(Math.abs(plan.totalCreditsGoal - assignedCredits))} ${isOverTargetCredits ? "over target" : "remaining"}` : "Set a credit target"}</span>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="planner-mobile-text-button gap-1" disabled={!ready} onClick={() => { void openPlanShare(); }}><ShareIcon className="h-3.5 w-3.5" /> Share</button>
                  <button type="button" className="planner-mobile-text-button" aria-expanded={mobileSettingsOpen} aria-controls="planner-mobile-progress-settings" onClick={() => setMobileSettingsOpen((current) => !current)}>
                    Plan settings <ChevronRightIcon className={`ml-1 h-4 w-4 transition-transform ${mobileSettingsOpen ? "rotate-90" : ""}`} />
                  </button>
                </div>
              </div>
            </div>
            <div id="planner-mobile-progress-settings" hidden={!mobileSettingsOpen}>{progressPanel}</div>
          </section>
        ) : null}

        <DndContext
          autoScroll={{
            activator: AutoScrollActivator.Pointer,
            layoutShiftCompensation: false,
          }}
          collisionDetection={pointerFirstCollisionDetection}
          sensors={sensors}
          onDragStart={handleCourseDragStart}
          onDragEnd={handleCourseDragEnd}
          onDragCancel={handleCourseDragCancel}
        >
          <div className="planner-workspace">
            {!isMobile ? <aside ref={sidebarRef} className="planner-sidebar" aria-label="Planner controls">
              <div className="planner-sidebar-scroll">
                {progressPanel}

                {notice ? (
                  <div className="planner-notice rounded-[0.85rem] border border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] px-4 py-3 text-[13px] font-medium leading-5 text-[var(--primary)]">
                    {notice}
                  </div>
                ) : null}

                {moduleBankPanel}

              </div>
            </aside> : null}
            <section className="min-w-0 space-y-3 md:space-y-4">
              <div className="grid items-start gap-3 md:gap-4 lg:grid-cols-2">
                {semesterIndexes.map((semesterIndex) => {
                  const startingCourses = sortedCourses.filter((course) => course.assignedSemester === semesterIndex);
                  const continuedCourses = sortedCourses.filter((course) => (
                    course.assignedSemester !== null
                    && course.assignedSemester < semesterIndex
                    && (course.assignedSemester + course.semesterSpan) > semesterIndex
                  ));
                  const semesterCreditUnits = startingCourses.reduce((sum, course) => sum + course.creditUnits, 0);

                  if (isMobile)
                  {
                    const expanded = expandedSemesters.has(semesterIndex);
                    const courseCount = startingCourses.length + continuedCourses.length;
                    return (
                      <section key={semesterIndex} id={`planner-mobile-semester-${semesterIndex}`} className="planner-mobile-semester">
                        <h2>
                          <button
                            type="button"
                            className="planner-mobile-semester-toggle"
                            aria-expanded={expanded}
                            aria-controls={`planner-mobile-semester-body-${semesterIndex}`}
                            onClick={() => setExpandedSemesters((current) => {
                              const next = new Set(current);
                              if (next.has(semesterIndex)) next.delete(semesterIndex);
                              else next.add(semesterIndex);
                              return next;
                            })}
                          >
                            <span className="flex min-w-0 items-center gap-2 text-left">
                              <span className="whitespace-nowrap text-[15px] font-bold leading-5">Semester {semesterIndex + 1}</span>
                              <span className="whitespace-nowrap text-[11px] font-normal leading-4 text-[var(--on-surface-variant)]">{courseCount} {courseCount === 1 ? "course" : "courses"}</span>
                            </span>
                            <span className="ml-auto shrink-0 text-[12px] font-semibold text-[var(--primary)]">{formatCredits(semesterCreditUnits)}</span>
                            <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          </button>
                        </h2>
                        <div id={`planner-mobile-semester-body-${semesterIndex}`} hidden={!expanded} className="planner-mobile-semester-body">
                          {continuedCourses.map((course) => (
                            <div key={`${course.id}-continued`} className="planner-mobile-continuation">
                              <ContinueIcon className="h-4 w-4 shrink-0" />
                              <div>
                                <p className="text-[13px] font-semibold">{course.courseCode}</p>
                                <p className="text-[12px]">Continues from Semester {(course.assignedSemester ?? 0) + 1}</p>
                              </div>
                              <button type="button" className="planner-mobile-icon-button ml-auto" aria-label={`Actions for ${course.courseCode}`} onClick={() => {
                                setMobileCourseId(course.id);
                                setMobilePanel("course");
                              }}><span aria-hidden="true" className="text-[24px] leading-none">⋯</span></button>
                            </div>
                          ))}
                          {startingCourses.map((course) => (
                            <PlannerMobileCourseRow key={course.id} course={course} onAction={() => {
                              setMobileCourseId(course.id);
                              setMobilePanel("course");
                            }} />
                          ))}
                          {courseCount === 0 ? (
                            <div className="flex items-center justify-between gap-3 px-1.5 py-1">
                              <p className="text-[13px] text-[var(--on-surface-variant)]">No courses assigned yet.</p>
                              {canDeleteSemester(semesterIndex) ? (
                                <button type="button" className="planner-mobile-text-button planner-mobile-text-button--danger" onClick={() => deleteSemester(semesterIndex)}>Delete</button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </section>
                    );
                  }

                  return (
                    <DroppableArticle
                      key={semesterIndex}
                      id={`${SEMESTER_DROP_ID_PREFIX}${semesterIndex}`}
                      className={(isOver) => `${getPlannerDropZoneClass(isOver)} planner-semester-tile`}
                    >
                      <div className="planner-semester-heading flex items-center justify-between gap-2">
                        <div>
                          <h2 className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)] sm:text-[17px]">
                            Semester {semesterIndex + 1}
                          </h2>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[12px] font-bold leading-5 text-[var(--primary)] sm:text-[14px]">
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
                        <div className="planner-semester-course-grid mt-3 grid gap-2">
                          {continuedCourses.map((course) => (
                            <div
                              key={`${course.id}-continued-${semesterIndex}`}
                              className="planner-continuation-card flex min-h-12 items-center gap-2 rounded-[0.75rem] border border-dashed border-[var(--outline-variant)] px-3 py-2 text-[var(--on-surface-variant)]"
                            >
                              <ContinueIcon className="h-4 w-4 shrink-0 opacity-75" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium leading-4">
                                  Continues from Semester {semesterIndex}
                                </p>
                                <p className="truncate text-[12px] font-semibold leading-4">
                                  {course.courseCode}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="planner-semester-course-grid mt-3 grid gap-2 md:mt-4">
                        {startingCourses.length === 0 && continuedCourses.length === 0 ? (
                          <p className="planner-empty-state col-span-full rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] px-3 py-4 text-[12px] leading-5 text-[var(--on-surface-variant)] md:py-5">
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

                {!isMobile ? <article className="planner-drop-zone planner-new-semester rounded-[1rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-3 py-3 md:px-4 md:py-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface-variant)]">
                      New Semester
                    </h2>
                  </div>

                  <div className="mt-3 md:mt-4">
                    <button
                      type="button"
                      onClick={addSemester}
                      className="planner-empty-state planner-add-semester flex w-full items-center justify-center gap-2 rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-4 text-[12px] font-semibold leading-5 text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-high)] md:py-5"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>Add Semester</span>
                    </button>
                  </div>
                </article> : (
                  <button type="button" className="planner-mobile-add-semester" onClick={addSemester} disabled={plan.numSemesters >= 20}>
                    <PlusIcon className="h-4 w-4" /> Add Semester
                  </button>
                )}
              </div>
            </section>
          </div>
          {isMobile && mobilePanel ? (
            <PlannerMobileSheet
              title={mobilePanel === "add" ? "Add Course" : mobilePanel === "bank" ? `Module Bank (${unassignedCourses.length})` : mobilePanel === "destination" ? "Choose semester" : mobilePanel === "remove" ? "Remove course?" : mobileCourse?.courseCode ?? "Course actions"}
              description={mobileCourse && mobilePanel !== "add" && mobilePanel !== "bank" ? `${mobileCourse.courseName} · ${formatCredits(mobileCourse.creditUnits)}${mobileCourse.semesterSpan > 1 ? ` · ${mobileCourse.semesterSpan} consecutive semesters` : ""}` : undefined}
              onClose={closeMobilePanel}
            >
              {mobilePanel === "add" ? <>
                {notice ? <p role="status" className="mb-3 text-[13px] text-[var(--primary)]">{notice}</p> : null}
                {moduleBankPanel}
              </> : null}
              {mobilePanel === "bank" ? (
                <>
                  <button type="button" className="planner-mobile-primary-button mb-4" onClick={() => { setNotice(""); setMobilePanel("add"); }}><PlusIcon className="h-4 w-4" /> Add Course</button>
                  {unassignedCourses.length === 0 ? <p className="py-5 text-[14px] text-[var(--on-surface-variant)]">All courses have been assigned. Add a course to continue planning.</p> : null}
                  {unassignedCourses.map((course) => <PlannerMobileCourseRow key={course.id} course={course} assign onAction={() => openMobileDestination(course.id)} onMenu={() => { setMobileCourseId(course.id); setMobilePanel("course"); }} />)}
                </>
              ) : null}
              {mobilePanel === "destination" && mobileCourse ? (
                <div className="space-y-2">
                  {semesterIndexes.map((semesterIndex) => {
                    const credits = sortedCourses.filter((course) => course.assignedSemester === semesterIndex).reduce((sum, course) => sum + course.creditUnits, 0);
                    const fits = semesterIndex + mobileCourse.semesterSpan <= plan.numSemesters;
                    return (
                      <button key={semesterIndex} type="button" className="planner-mobile-destination" disabled={!fits} onClick={() => assignMobileCourse(semesterIndex)}>
                        <span className="text-left">
                          <span className="block font-semibold">Semester {semesterIndex + 1}</span>
                          <span className="block text-[12px] text-[var(--on-surface-variant)]">{fits ? mobileCourse.assignedSemester === semesterIndex ? "Current semester" : "Assign here" : `Needs ${mobileCourse.semesterSpan} consecutive semesters`}</span>
                        </span>
                        <span className="shrink-0 text-[13px] text-[var(--primary)]">{formatCredits(credits)}</span>
                      </button>
                    );
                  })}
                  <button type="button" className="planner-mobile-destination" onClick={() => assignMobileCourse(null)}>
                    <span className="font-semibold">{mobileCourse.assignedSemester === null ? "Keep in Module Bank" : "Return to Module Bank"}</span>
                    <BookIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : null}
              {mobilePanel === "course" && mobileCourse ? (
                <>
                  <p className="planner-mobile-course-location mb-3 text-[13px] font-semibold text-[var(--on-surface-variant)]">
                    {mobileCourse.assignedSemester === null
                      ? "Currently in Module Bank"
                      : mobileCourse.semesterSpan > 1
                        ? `Currently in Semesters ${mobileCourse.assignedSemester + 1}–${mobileCourse.assignedSemester + mobileCourse.semesterSpan}`
                        : `Currently in Semester ${mobileCourse.assignedSemester + 1}`}
                  </p>
                  <div className="planner-mobile-course-actions space-y-2">
                    <button type="button" className="planner-mobile-destination" onClick={() => setMobilePanel("destination")}>Move to semester <ChevronRightIcon className="h-4 w-4" /></button>
                    <button type="button" className="planner-mobile-destination" onClick={() => assignMobileCourse(null)}>Return to Module Bank <BookIcon className="h-4 w-4" /></button>
                    {mobileCourse.source === "manual" ? <button type="button" className="planner-mobile-destination" onClick={() => {
                      setEditingCourseId(mobileCourse.id);
                      closeMobilePanel();
                    }}>Edit custom course <EditIcon className="h-4 w-4" /></button> : null}
                    <button type="button" className="planner-mobile-destination text-[var(--error)]" onClick={() => setMobilePanel("remove")}>Remove course <TrashIcon className="h-4 w-4" /></button>
                  </div>
                </>
              ) : null}
              {mobilePanel === "remove" && mobileCourse ? (
                <>
                  <p className="mb-5 text-[14px] text-[var(--on-surface-variant)]">This removes the course from your plan, including its semester assignment.</p>
                  <div className="flex justify-end gap-3">
                    <button type="button" className="planner-mobile-text-button" onClick={() => setMobilePanel("course")}>Cancel</button>
                    <button type="button" className="planner-mobile-text-button planner-mobile-text-button--danger" onClick={() => {
                      deleteCourseFromBank(mobileCourse);
                      closeMobilePanel();
                    }}>Remove course</button>
                  </div>
                </>
              ) : null}
            </PlannerMobileSheet>
          ) : null}
          <DragOverlay
            dropAnimation={null}
            style={{ zIndex: 9999 }}
            adjustScale={false}
          >
            {draggedCourse ? <CourseDragOverlay course={draggedCourse} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {isMobile ? (
        <>
          {notice ? <div className="planner-mobile-notice" role="status">{notice}</div> : null}
          <nav className="planner-mobile-toolbar" aria-label="Planner actions">
            <button type="button" className="planner-mobile-primary-button" onClick={() => { setNotice(""); setSearchQuery(""); setMobilePanel("add"); }}><PlusIcon className="h-5 w-5" /> Add Course</button>
            <button type="button" className="planner-mobile-bank-button" onClick={() => setMobilePanel("bank")}><BookIcon className="h-5 w-5" /> Module Bank ({unassignedCourses.length})</button>
          </nav>
        </>
      ) : null}

      <Modal
        open={shareOpen}
        title="Share semester plan"
        description="Share a copy of your current plan."
        onClose={() => setShareOpen(false)}
        maxWidthClassName="max-w-md"
        footer={(
          <div className="flex w-full flex-wrap justify-end gap-2">
            <ActionButton variant="ghost" icon={<ShareIcon className="h-4 w-4" />} label="Copy link" onClick={() => { void copyPlanShareLink(); }} disabled={!shareUrl} />
            {isMobile && typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
              <ActionButton variant="primary" icon={<ShareIcon className="h-4 w-4" />} label="Share" onClick={() => { void sharePlanLink(); }} disabled={!shareUrl} />
            ) : null}
          </div>
        )}
        showCloseButton
      >
        {shareUrl ? (
          <label className="block space-y-2 text-[13px] font-medium">
            <span>Share link</span>
            <input type="url" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="w-full min-w-0 rounded-[0.5rem] border border-[var(--control-border)] bg-[var(--control-surface)] px-3 py-2 text-[16px] font-normal text-[var(--on-surface)]" />
          </label>
        ) : !shareMessage ? <p role="status" className="text-[13px]">Creating share link…</p> : null}
        {shareMessage ? <p role="status" className="mt-3 text-[13px] text-[var(--on-surface-variant)]">{shareMessage}</p> : null}
      </Modal>

      <Modal
        open={importedPlan !== null}
        title={importedPlanSource === "shared" ? "Save shared plan?" : "Import Semester Plan?"}
        description={importedPlanSource === "shared" ? "Saving this shared plan will replace your current semester plan on this device." : `Importing ${importedPlanFileName || "this backup"} will replace your current semester plan.`}
        onClose={dismissPlanImport}
        maxWidthClassName={importedPlanSource === "shared" ? "max-w-3xl" : "max-w-md"}
        headerContent={importedPlanSource === "shared" && importedPlan ? <SemesterPlannerPreviewSummary plan={importedPlan} /> : undefined}
        footer={(
          <>
            <button
              type="button"
              onClick={dismissPlanImport}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPlanImport}
              className="planner-primary-action rounded-[0.7rem] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-4 text-on-primary transition-colors hover:bg-[var(--primary-container)]"
            >
              {importedPlanSource === "shared" ? "Save shared plan" : "Replace Current Plan"}
            </button>
          </>
        )}
      >
        {importedPlanSource === "shared" && importedPlan ? <SemesterPlannerSharePreview plan={importedPlan} /> : (
          <p className="text-[13px] leading-6 text-[var(--on-surface-variant)]">
            The backup contains {importedPlan?.courses.length ?? 0} modules across {importedPlan?.numSemesters ?? 0} semesters. Export your current plan first if you may need it later.
          </p>
        )}
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
              className="app-danger-action rounded-[0.7rem] bg-red-500 px-3 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-red-400"
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
              className="planner-primary-action rounded-[0.7rem] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-4 text-on-primary transition-colors hover:bg-[var(--primary-container)]"
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
