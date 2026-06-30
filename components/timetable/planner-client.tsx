"use client";

import Link from "next/link";
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
import { ExamCalendar, ExamCalendarOverviewRail } from "@/components/timetable/exam-calendar";
import { SelectorRail } from "@/components/timetable/selector-rail";
import { TimetableAlerts } from "@/components/timetable/timetable-alerts";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { exportPngDataUrlToPdf } from "@/lib/export/pdf-client";
import { exportElementToPng, renderElementToPngDataUrl } from "@/lib/export/png";
import {
  APP_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_UPDATED_EVENT,
  DEFAULT_APP_SETTINGS,
  getSettingsThemePalette,
  readAppSettings,
  type SettingsState,
} from "@/lib/settings/app-settings";
import {
  buildTimeSlots,
  formatClassGroupLabel,
  getCurrentWeekChip,
} from "@/lib/timetable/date-utils";
import {
  TIMETABLE_STORAGE_KEY,
  TIMETABLE_STUDY_MODE_STORAGE_KEY,
  TIMETABLE_STUDY_MODE_UPDATED_EVENT,
  TIMETABLE_UPDATED_EVENT,
  loadSavedTimetable,
  getSavedSemesterState,
  readTimetableStudyMode,
  saveTimetableToLocalStorage,
  saveTimetableStudyMode,
  type TimetableStudyMode,
} from "@/lib/timetable/local-storage";
import {
  buildSharedClassIdentifier,
  encodeShareUrlState,
} from "@/lib/timetable/share-url";
import {
  buildExamCards,
  buildSelectableWeeks,
  buildSelectedCourseCards,
  buildTimetableBlocks,
  buildWeekOptions,
  formatExamCalendarOverviewSubtitle,
  getCourseColor,
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

type ClassCountsResponse = {
  counts: Record<string, number>;
};

type ClassPickerCourse = Pick<CourseSearchResult, "courseCode" | "courseName">;
type SortMode = "code" | "credit" | "exam";

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

function createDefaultSemesterState(
  semesterId: number,
  currentSemesterId: number,
  currentWeekId: number | null,
  semesterWeeks: SemesterWeekRecord[],
  defaultOrientation: TimetableOrientation,
): PlannerStorageState
{
  const currentWeek = semesterWeeks.find((week) => week.weekId === currentWeekId) ?? null;
  const selectedWeekId = semesterId === currentSemesterId
    && currentWeek?.weekType === "TEACHING"
    && currentWeek.weekNo >= 1
    && currentWeek.weekNo <= 12
    ? currentWeek.weekId
    : "all";

  return {
    semesterId,
    selectedClasses: [],
    hiddenClasses: [],
    courseColorsByCourseCode: {},
    selectedWeekId,
    orientation: defaultOrientation,
    viewMode: "class",
  };
}

function formatSemesterRailMonthYear(semester: SemesterOption)
{
  return semester.semesterName;
}

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

function compareCourseClassRecords(left: CourseClassRecord, right: CourseClassRecord)
{
  if (left.groupCodeType !== right.groupCodeType)
  {
    return left.groupCodeType.localeCompare(right.groupCodeType);
  }
  return left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true, sensitivity: "base" });
}

function toMinutes(timeValue: string)
{
  const [hour, minute] = timeValue.split(":").map((value) => Number.parseInt(value, 10));
  return (hour * 60) + minute;
}

function hasClashWithEvents(candidate: CourseClassRecord, existingEvents: TimetableEventRecord[])
{
  for (const candidateEvent of candidate.events)
  {
    const candidateStart = toMinutes(candidateEvent.startTime);
    const candidateEnd = toMinutes(candidateEvent.endTime);

    for (const existingEvent of existingEvents)
    {
      if (candidateEvent.eventDate !== existingEvent.eventDate)
      {
        continue;
      }

      const existingStart = toMinutes(existingEvent.startTime);
      const existingEnd = toMinutes(existingEvent.endTime);
      if (candidateStart < existingEnd && existingStart < candidateEnd)
      {
        return true;
      }
    }
  }

  return false;
}

function pickPreferredClass(
  classes: CourseClassRecord[],
  preferredGroupType: "TG" | "CRN",
  existingEvents: TimetableEventRecord[],
)
{
  const sorted = [...classes].sort(compareCourseClassRecords);
  const preferred = sorted.filter((group) => group.groupCodeType === preferredGroupType);
  const fallback = sorted.filter((group) => group.groupCodeType !== preferredGroupType);

  const preferredNoClash = preferred.find((group) => !hasClashWithEvents(group, existingEvents));
  if (preferredNoClash)
  {
    return preferredNoClash;
  }

  const fallbackNoClash = fallback.find((group) => !hasClashWithEvents(group, existingEvents));
  if (fallbackNoClash)
  {
    return fallbackNoClash;
  }

  return preferred[0] ?? fallback[0] ?? null;
}

function buildDayDateByDay(week: SemesterWeekRecord | null)
{
  if (!week)
  {
    return {};
  }

  const baseDate = new Date(`${week.startDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime()))
  {
    return {};
  }

  const formatter = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });
  const mapping: Record<number, string> = {};
  for (let day = 1; day <= 7; day += 1)
  {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + (day - 1));
    mapping[day] = formatter.format(date);
  }
  return mapping;
}

function sortSelectedCards(
  cards: ReturnType<typeof buildSelectedCourseCards>,
  sortMode: SortMode,
)
{
  return [...cards].sort((left, right) => {
    if (sortMode === "credit")
    {
      const leftCredit = left.creditUnits ?? Number.POSITIVE_INFINITY;
      const rightCredit = right.creditUnits ?? Number.POSITIVE_INFINITY;
      const creditDiff = leftCredit - rightCredit;
      if (creditDiff !== 0)
      {
        return creditDiff;
      }
    }

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

function buildThemedCourseColorMap(
  cards: ReturnType<typeof buildSelectedCourseCards>,
  palette: readonly string[],
)
{
  const colorMap = new Map<string, string>();
  let colorIndex = 0;

  for (const card of cards)
  {
    if (colorMap.has(card.courseCode))
    {
      continue;
    }

    colorMap.set(card.courseCode, palette[colorIndex % palette.length] ?? card.color);
    colorIndex += 1;
  }

  return colorMap;
}

const THEME_COLOR_PREFERENCE_PREFIX = "theme-color:";

function buildThemeColorPreference(colorIndex: number)
{
  return `${THEME_COLOR_PREFERENCE_PREFIX}${colorIndex}`;
}

function resolveThemeColorPreference(
  colorPreference: string | undefined,
  palette: readonly string[],
)
{
  if (!colorPreference)
  {
    return null;
  }

  if (!colorPreference.startsWith(THEME_COLOR_PREFERENCE_PREFIX))
  {
    return null;
  }

  const colorIndex = Number.parseInt(colorPreference.slice(THEME_COLOR_PREFERENCE_PREFIX.length), 10);
  if (!Number.isFinite(colorIndex) || colorIndex < 0)
  {
    return null;
  }

  return palette[colorIndex % palette.length] ?? null;
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
  const [appSettings, setAppSettings] = useState<SettingsState>(DEFAULT_APP_SETTINGS);
  const [semesterId, setSemesterId] = useState<number>(currentSemesterId);
  const [orientation, setOrientation] = useState<TimetableOrientation>(DEFAULT_APP_SETTINGS.timetableOrientation);
  const [viewMode, setViewMode] = useState<"class" | "exam">("class");
  const [sortMode, setSortMode] = useState<SortMode>("code");
  const [searchInput, setSearchInput] = useState("");
  const [studyMode, setStudyMode] = useState<TimetableStudyMode>("full-time");
  const [selectedClasses, setSelectedClasses] = useState<SharedClassIdentifier[]>([]);
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);
  const [courseColorsByCourseCode, setCourseColorsByCourseCode] = useState<Record<string, string>>({});
  const [courseHasAlternativesByCode, setCourseHasAlternativesByCode] = useState<Record<string, boolean>>({});
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
  const [, setClassPickerLoading] = useState(false);
  const [classPickerClasses, setClassPickerClasses] = useState<CourseClassRecord[]>([]);
  const [, setClassPickerError] = useState("");
  const [scheduleCourse, setScheduleCourse] = useState<ReturnType<typeof buildSelectedCourseCards>[number] | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [colorPickerCourseCode, setColorPickerCourseCode] = useState<string | null>(null);
  const exportCaptureRef = useRef<HTMLDivElement | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const deferredSearch = useDeferredValue(searchInput);

  const selectedSemester = semesters.find((semester) => semester.semesterId === semesterId) ?? semesters[0] ?? null;
  const semesterWeeks = selectedSemester?.weeks ?? [];
  const selectableWeeks = buildSelectableWeeks(semesterWeeks, timetableData.events);

  useEffect(() => {
    const settings = readAppSettings();
    const saved = loadSavedTimetable();
    const savedSemesterExists = Boolean(saved && semesters.some((semester) => semester.semesterId === saved.semesterId));
    const semesterIdToLoad = savedSemesterExists && saved
      ? saved.semesterId
      : currentSemesterId || semesters[0]?.semesterId || 0;
    const next = savedSemesterExists && saved
      ? saved
      : getSavedSemesterState(saved, semesterIdToLoad)
        ?? createDefaultSemesterState(
          semesterIdToLoad,
          currentSemesterId,
          currentWeekId,
          semesters.find((semester) => semester.semesterId === semesterIdToLoad)?.weeks ?? [],
          settings.timetableOrientation,
        );

    setAppSettings(settings);
    setSemesterId(semesterIdToLoad);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    setCourseColorsByCourseCode(next.courseColorsByCourseCode ?? {});
    setSelectedWeekId(next.selectedWeekId);
    setOrientation(saved?.orientation ?? settings.timetableOrientation);
    setViewMode(saved?.viewMode ?? "class");
    setStudyMode(readTimetableStudyMode());
    setReady(true);
  }, [currentSemesterId, currentWeekId, semesters]);

  useEffect(() => {
    const refreshSettings = () => setAppSettings(readAppSettings());
    const refreshStudyMode = () => setStudyMode(readTimetableStudyMode());
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEY)
      {
        refreshSettings();
      }

      if (event.key === TIMETABLE_STUDY_MODE_STORAGE_KEY)
      {
        refreshStudyMode();
      }
    };

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, refreshSettings);
    window.addEventListener(TIMETABLE_STUDY_MODE_UPDATED_EVENT, refreshStudyMode);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, refreshSettings);
      window.removeEventListener(TIMETABLE_STUDY_MODE_UPDATED_EVENT, refreshStudyMode);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const syncSavedTimetable = () => {
      const saved = loadSavedTimetable();
      if (!saved || !semesters.some((semester) => semester.semesterId === saved.semesterId))
      {
        return;
      }

      const next = getSavedSemesterState(saved, saved.semesterId) ?? saved;
      setSemesterId(saved.semesterId);
      setSelectedClasses(next.selectedClasses);
      setHiddenClasses(next.hiddenClasses);
      setCourseColorsByCourseCode(next.courseColorsByCourseCode ?? {});
      setSelectedWeekId(next.selectedWeekId);
      setOrientation(saved.orientation ?? appSettings.timetableOrientation);
      setViewMode(saved.viewMode ?? "class");
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === TIMETABLE_STORAGE_KEY)
      {
        syncSavedTimetable();
      }
    };

    window.addEventListener(TIMETABLE_UPDATED_EVENT, syncSavedTimetable);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(TIMETABLE_UPDATED_EVENT, syncSavedTimetable);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [appSettings.timetableOrientation, semesters]);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    const payload: PlannerStorageState = {
      semesterId,
      selectedClasses,
      hiddenClasses,
      courseColorsByCourseCode,
      selectedWeekId,
      orientation,
      viewMode,
    };
    saveTimetableToLocalStorage(payload);
  }, [courseColorsByCourseCode, hiddenClasses, orientation, ready, selectedClasses, selectedWeekId, semesterId, viewMode]);

  useEffect(() => {
    if (!ready || !semesterId)
    {
      setCourseHasAlternativesByCode({});
      return;
    }

    const courseCodes = [...new Set(selectedClasses.map((selection) => selection.courseCode))];
    if (courseCodes.length === 0)
    {
      setCourseHasAlternativesByCode({});
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      semesterId: String(semesterId),
      courseCodes: courseCodes.join(","),
    });

    fetch(`/api/classes/counts?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
        {
          throw new Error("Unable to load class counts.");
        }
        return response.json() as Promise<ClassCountsResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted)
        {
          return;
        }

        setCourseHasAlternativesByCode(Object.fromEntries(
          courseCodes.map((courseCode) => [courseCode, (payload.counts[courseCode] ?? 0) > 1]),
        ));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError")
        {
          return;
        }
        setCourseHasAlternativesByCode({});
      });

    return () => controller.abort();
  }, [ready, selectedClasses, semesterId]);

  useEffect(() => {
    if (!ready || !semesterId)
    {
      return;
    }

    if (selectedClasses.length === 0)
    {
      setTimetableData({
        semester: selectedSemester
          ? {
              semesterId: selectedSemester.semesterId,
              academicYear: selectedSemester.academicYear,
              semesterNo: selectedSemester.semesterNo,
              semesterName: selectedSemester.semesterName,
            }
          : null,
        semesterWeeks,
        selections: [],
        events: [],
        clashes: [],
        unresolvedSelections: [],
      });
      return;
    }

    const controller = new AbortController();
    fetch(`/api/classes?${buildShareQuery(semesterId, selectedClasses)}`, {
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
  }, [ready, selectedClasses, selectedSemester, semesterId, semesterWeeks]);

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
    });
    params.append("semesterIds", String(semesterId));

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
  const themePalette = useMemo(() => getSettingsThemePalette(appSettings), [appSettings]);
  const defaultColorByCourseCode = useMemo(
    () => buildThemedCourseColorMap(selectedCards, themePalette),
    [selectedCards, themePalette],
  );
  const colorByShareKey = useMemo(
    () => new Map(selectedCards.map((card) => [
      card.shareKey,
      resolveThemeColorPreference(courseColorsByCourseCode[card.courseCode], themePalette)
        ?? defaultColorByCourseCode.get(card.courseCode)
        ?? card.color,
    ])),
    [courseColorsByCourseCode, defaultColorByCourseCode, selectedCards, themePalette],
  );
  const colorByCourseCode = useMemo(
    () => new Map(selectedCards.map((card) => [
      card.courseCode,
      resolveThemeColorPreference(courseColorsByCourseCode[card.courseCode], themePalette)
        ?? defaultColorByCourseCode.get(card.courseCode)
        ?? card.color,
    ])),
    [courseColorsByCourseCode, defaultColorByCourseCode, selectedCards, themePalette],
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
    new Map(classPickerClasses.map((group) => {
      const identifier: SharedClassIdentifier = {
        courseCode: group.courseCode,
        scheduleType: group.scheduleType,
        groupCodeType: group.groupCodeType,
        groupCode: group.groupCode,
      };
      return [
        buildSharedClassIdentifier(identifier),
        colorByCourseCode.get(group.courseCode)
          ?? defaultColorByCourseCode.get(group.courseCode)
          ?? getCourseColor(group.courseCode),
      ] as const;
    }))
  ), [classPickerClasses, colorByCourseCode, defaultColorByCourseCode]);
  const displayedBlocks = useMemo(() => {
    if (!classPickerCourse)
    {
      return allBlocks;
    }

    const selectedShareKey = selectedShareKeyByCourseCode.get(classPickerCourse.courseCode);
    const alternativeBlocks = selectedShareKey
      ? pickerBlocks.filter((block) => block.shareKey !== selectedShareKey)
      : pickerBlocks;

    return [...allBlocks, ...alternativeBlocks];
  }, [allBlocks, classPickerCourse, pickerBlocks, selectedShareKeyByCourseCode]);
  const displayedBlockColors = useMemo(() => {
    if (!classPickerCourse)
    {
      return colorByShareKey;
    }

    const merged = new Map(colorByShareKey);
    for (const [shareKey, color] of pickerColorByShareKey)
    {
      merged.set(shareKey, color);
    }
    return merged;
  }, [classPickerCourse, colorByShareKey, pickerColorByShareKey]);
  const examCards = useMemo(
    () => buildExamCards(visibleEvents).filter((card) => !hiddenClasses.includes(card.shareKey)),
    [hiddenClasses, visibleEvents],
  );
  const examOverviewSubtitle = formatExamCalendarOverviewSubtitle(timetableData.semesterWeeks) ?? "No exam period loaded";
  const visibleEndMinutes = getLatestEndMinutes(displayedBlocks);
  const timeSlots = buildTimeSlots(visibleEndMinutes);
  const totalCredits = selectedCards.reduce((sum, card) => sum + (card.creditUnits ?? 0), 0);
  const weekItems = buildWeekOptions(selectableWeeks);
  const semesterItems = semesters.map((semester) => ({
    id: String(semester.semesterId),
    title: formatSemesterRailMonthYear(semester),
    subtitle: `AY ${formatAcademicYearShort(semester.academicYear)} • ${formatSemesterRailTag(semester.semesterNo)}`,
  }));
  const showCurrentTime = semesterId === currentSemesterId
    && currentWeekId !== null
    && (selectedWeekId === "all" || selectedWeekId === currentWeekId);
  const selectedWeekRecord = selectedWeekId === "all"
    ? null
    : semesterWeeks.find((week) => week.weekId === selectedWeekId) ?? null;
  const dayDateByDay = useMemo(
    () => (selectedWeekId === "all" ? {} : buildDayDateByDay(selectedWeekRecord)),
    [selectedWeekId, selectedWeekRecord],
  );
  const activePickerShareKey = classPickerCourse
    ? selectedShareKeyByCourseCode.get(classPickerCourse.courseCode) ?? null
    : null;

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null)
    {
      window.clearTimeout(noticeTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!downloadOpen && !colorPickerCourseCode)
    {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element))
      {
        return;
      }

      if (downloadOpen && !target.closest("[data-download-popover-root]"))
      {
        setDownloadOpen(false);
      }

      if (colorPickerCourseCode && !target.closest("[data-color-popover-root]"))
      {
        setColorPickerCourseCode(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [colorPickerCourseCode, downloadOpen]);

  function toggleHidden(shareKey: string)
  {
    setHiddenClasses((current) => current.includes(shareKey)
      ? current.filter((value) => value !== shareKey)
      : [...current, shareKey]);
  }

  function toggleStudyMode()
  {
    setStudyMode((current) => {
      const next = current === "full-time" ? "part-time" : "full-time";
      saveTimetableStudyMode(next);
      return next;
    });
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
    saveTimetableToLocalStorage({
      semesterId,
      selectedClasses,
      hiddenClasses,
      courseColorsByCourseCode,
      selectedWeekId,
      orientation,
      viewMode,
    });

    const saved = loadSavedTimetable();
    const next = getSavedSemesterState(saved, nextSemesterId)
      ?? createDefaultSemesterState(
        nextSemesterId,
        currentSemesterId,
        currentWeekId,
        semesters.find((semester) => semester.semesterId === nextSemesterId)?.weeks ?? [],
        appSettings.timetableOrientation,
      );

    setSemesterId(nextSemesterId);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    setCourseColorsByCourseCode(next.courseColorsByCourseCode ?? {});
    setSelectedWeekId(next.selectedWeekId);
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

    fetch(`/api/classes?${params.toString()}`)
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

  async function handleSearchResultClick(course: CourseSearchResult)
  {
    const offeredInSelectedSemester = course.offeredSemesters.some((semester) => semester.semesterId === semesterId);

    if (!offeredInSelectedSemester)
    {
      showPlannerBanner(`${course.courseCode} is not offered in ${selectedSemester?.semesterName ?? "the selected semester"}.`);
      return;
    }

    try
    {
      const params = new URLSearchParams({
        courseCode: course.courseCode,
        semesterId: String(semesterId),
      });
      const response = await fetch(`/api/classes?${params.toString()}`);
      if (!response.ok)
      {
        throw new Error("Unable to load class groups.");
      }
      const payload = await response.json() as ClassesResponse;
      const preferredGroupType = studyMode === "full-time" ? "TG" : "CRN";
      const firstClass = pickPreferredClass(payload.classes, preferredGroupType, visibleEvents);

      if (!firstClass)
      {
        showPlannerBanner("No class groups are available for this course in the selected semester.");
        return;
      }

      setSearchInput("");
      setSearchResults([]);
      addClassSelection({
        courseCode: firstClass.courseCode,
        scheduleType: firstClass.scheduleType,
        groupCodeType: firstClass.groupCodeType,
        groupCode: firstClass.groupCode,
      });
    }
    catch (error: unknown)
    {
      showPlannerBanner(error instanceof Error ? error.message : "Unable to load class groups.");
    }
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

  async function waitForExportLayout()
  {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function handlePngExport()
  {
    if (!exportCaptureRef.current)
    {
      return;
    }

    setDownloadOpen(false);
    await waitForExportLayout();
    await exportElementToPng(
      exportCaptureRef.current,
      `suss-planner-${semesterId}-${viewMode}.png`,
    );
  }

  async function handlePdfExport()
  {
    if (!exportCaptureRef.current)
    {
      return;
    }

    setDownloadOpen(false);
    await waitForExportLayout();
    const pngDataUrl = await renderElementToPngDataUrl(exportCaptureRef.current);
    await exportPngDataUrlToPdf(pngDataUrl, `suss-planner-${semesterId}-${viewMode}.pdf`);
  }

  function resetPlanner()
  {
    setSelectedClasses([]);
    setHiddenClasses([]);
    setCourseColorsByCourseCode({});
    setSearchInput("");
    setPlannerNotice("");
    setDownloadOpen(false);
    setConfirmResetOpen(false);
    closeClassPicker();
    saveTimetableToLocalStorage({
      semesterId,
      selectedClasses: [],
      hiddenClasses: [],
      courseColorsByCourseCode: {},
      selectedWeekId,
      orientation,
      viewMode,
    });
  }

  const nextViewToggle = viewMode === "class"
    ? { label: "Exam Cal", icon: <CalendarIcon className="h-[18px] w-[18px]" />, onClick: () => setViewMode("exam") }
    : { label: "Timetable", icon: <GridIcon className="h-[18px] w-[18px]" />, onClick: () => setViewMode("class") };
  const nextOrientationToggle = orientation === "horizontal"
    ? { label: "Vertical", icon: <ColumnsIcon className="h-[18px] w-[18px]" />, onClick: () => setOrientation("vertical") }
    : { label: "Horizontal", icon: <RowsIcon className="h-[18px] w-[18px]" />, onClick: () => setOrientation("horizontal") };

  return (
    <>
      <div ref={exportCaptureRef} className={`timetable-page flex min-h-0 flex-1 flex-col ${orientation === "horizontal" ? "md:flex-col" : "md:flex-row"}`}>
        <section className={`flex min-h-0 w-full flex-1 flex-col ${orientation === "horizontal" ? "md:w-full" : "md:w-[70%]"}`}>
          <div className="timetable-toolbar elev-1 flex flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
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

          {plannerNotice || timetableData.unresolvedSelections.length > 0 ? (
            <div className="timetable-notice-stack space-y-2 bg-[var(--surface-container-lowest)] px-2.5 pt-2 sm:px-3 sm:pt-2.5">
              {plannerNotice ? (
                <div className="timetable-notice rounded-[0.5rem] border border-[var(--primary)]/20 bg-[var(--primary-fixed)] px-2.5 py-1.5 text-[11px] font-medium leading-4 text-[var(--primary)] sm:text-[12px]">
                  {plannerNotice}
                </div>
              ) : null}
              {timetableData.unresolvedSelections.length > 0 ? (
                <div className="rounded-[0.5rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-2.5 py-1.5 text-[11px] font-medium leading-4 text-[var(--error)] sm:text-[12px]">
                  Some shared or saved class identifiers no longer match the database for this semester.
                </div>
              ) : null}
            </div>
          ) : null}

          <TimetableAlerts
            events={timetableData.events}
            clashes={timetableData.clashes}
          />

          <div className="timetable-canvas-shell flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)] px-1 pb-0.5 sm:pb-1">
            <div className={`min-h-0 flex-1 ${viewMode === "class" ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}>
              {viewMode === "class" ? (
                <TimetableCanvas
                  blocks={displayedBlocks}
                  blockColorByKey={displayedBlockColors}
                  isHorizontal={orientation === "horizontal"}
                  timeSlots={timeSlots}
                  visibleEndMinutes={visibleEndMinutes}
                  showAllWeeks={selectedWeekId === "all"}
                  dayDateByDay={dayDateByDay}
                  activeShareKey={activePickerShareKey}
                  deEmphasisMode={classPickerCourse ? "course-only" : "all"}
                  activeCourseCode={classPickerCourse?.courseCode ?? null}
                  courseCanPickByCode={courseHasAlternativesByCode}
                  isPickMode={Boolean(classPickerCourse)}
                  suppressActiveOutline={Boolean(classPickerCourse)}
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

                    if (!courseHasAlternativesByCode[block.courseCode])
                    {
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

        <aside className={`timetable-side-panel flex min-h-0 w-full flex-col border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] ${orientation === "horizontal" ? "md:w-full md:border-l-0 md:border-t" : "md:w-[30%] md:border-l md:border-t-0"}`}>
          <div className="flex h-12 shrink-0 items-center justify-between bg-[var(--surface-container-lowest)] px-2.5 sm:h-14 sm:px-3">
            <div>
              <h3 className="text-[16px] font-semibold leading-5 text-[var(--on-surface)] sm:text-[18px] sm:leading-6">My Courses</h3>
              <p className="text-[10px] leading-[13px] text-[var(--on-surface-variant)] sm:text-[11px] sm:leading-[14px]">{selectedSemester ? getCurrentWeekChip(selectedSemester, semesterWeeks.find((week) => week.weekId === selectedWeekId) ?? null) : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold leading-4 text-[var(--on-surface-variant)] sm:text-[10px]">FT</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={studyMode === "part-time"}
                  aria-label="Toggle study mode"
                  className="relative h-5 w-9 rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-low)] transition-colors"
                  onClick={toggleStudyMode}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-[var(--primary)] transition-all ${
                      studyMode === "part-time" ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
                <span className="text-[9px] font-semibold leading-4 text-[var(--on-surface-variant)] sm:text-[10px]">PT</span>
              </div>
              <span className="timetable-chip rounded-[0.75rem] bg-[var(--brand-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium leading-[13px] text-[var(--primary)] sm:px-2 sm:text-[11px] sm:leading-[14px]">
                {selectedCards.length} Selected
              </span>
            </div>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-2.5 py-1.5 sm:px-3">
            <label className="relative z-40 block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                className="elev-1 w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-1.5 pl-10 pr-4 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:py-2 sm:text-[14px]"
                placeholder="Search courses"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />

              {searchInput ? (
                <div className="elev-3 absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
                  {searchResults.map((record) => (
                    <button
                      key={record.courseCode}
                      type="button"
                      className="flex w-full items-start rounded-[0.5rem] px-2.5 py-1 text-left transition-colors hover:bg-[var(--surface-container-high)] sm:py-1.5"
                      onClick={() => handleSearchResultClick(record)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] leading-4 text-[var(--on-surface)]">
                          <span className="font-semibold">{record.courseCode}</span>{" "}
                          <span className="font-normal text-[var(--on-surface-variant)]">
                            {record.courseName ?? "Untitled course"}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-tight text-[var(--on-surface-variant)]">
                          {record.offeredSemesters.map((semester) => semester.semesterName).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}

                  {searchLoading ? (
                    <div className="px-2.5 py-1.5 text-[10px] leading-[13px] text-[var(--on-surface-variant)] sm:px-3 sm:py-2 sm:text-[11px] sm:leading-[14px]">Searching…</div>
                  ) : null}

                  {!searchLoading && searchResults.length === 0 ? (
                    <div className="rounded-[0.5rem] border border-dashed border-[var(--outline-variant)] px-3 py-2.5 text-center text-[10px] font-medium leading-4 text-[var(--on-surface-variant)] sm:px-4 sm:py-3 sm:text-[11px]">
                      No matching courses
                    </div>
                  ) : null}
                </div>
              ) : null}
            </label>
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-2.5 pb-2.5 pt-1.5 sm:px-3 sm:pb-3">
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-1">
                <ActionButton variant="primary" icon={<ShareIcon className="h-[18px] w-[18px]" />} label="Share" onClick={handleShare} stretch />
                <div className="relative" data-download-popover-root>
                  <ActionButton
                    variant="ghost"
                    icon={<DownloadIcon className="h-[18px] w-[18px]" />}
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
                        <ActionButton variant="ghost" icon={<DownloadIcon className="h-[18px] w-[18px]" />} label="PDF" onClick={() => void handlePdfExport()} />
                        <ActionButton variant="ghost" icon={<CalendarIcon className="h-[18px] w-[18px]" />} label="ICS" onClick={() => triggerDownload("/api/export/ics", `suss-planner-${semesterId}-${viewMode}.ics`)} />
                        <ActionButton variant="ghost" icon={<GridIcon className="h-[18px] w-[18px]" />} label="PNG" onClick={() => void handlePngExport()} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <ActionButton variant="ghost" icon={nextViewToggle.icon} label={nextViewToggle.label} onClick={nextViewToggle.onClick} stretch />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <ActionButton variant="ghost" icon={nextOrientationToggle.icon} label={nextOrientationToggle.label} onClick={nextOrientationToggle.onClick} stretch />
                <ActionButton variant="ghost" icon={<RefreshIcon className="h-[18px] w-[18px]" />} label="Reset" onClick={() => setConfirmResetOpen(true)} stretch />
              </div>
              {selectedWeekId !== "all" ? (
                <ActionButton
                  variant="ghost"
                  icon={<GridIcon className="h-[18px] w-[18px]" />}
                  label="Show All Weeks"
                  onClick={() => setSelectedWeekId("all")}
                  stretch
                />
              ) : null}
            </div>

            {shareMessage ? (
              <div className="timetable-notice mt-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--primary-fixed)] px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-[var(--primary)] sm:text-[11px]">
                {shareMessage}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-container-lowest)] px-2.5 pb-2.5 sm:px-3 sm:pb-3">
            <div className={orientation === "horizontal" ? "space-y-2 md:grid md:auto-rows-fr md:grid-cols-2 md:items-stretch md:gap-2 md:space-y-0 lg:grid-cols-3 xl:grid-cols-4" : "space-y-2"}>
              {selectedCards.map((record) => {
                const isHidden = hiddenClasses.includes(record.shareKey);
                const recordColor = colorByShareKey.get(record.shareKey) ?? record.color;
                return (
                  <article
                    key={record.shareKey}
                    className={`timetable-selected-card elev-1 group relative rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2 py-1.5 transition-[box-shadow] hover:shadow-md sm:px-2.5 sm:py-2 ${
                      colorPickerCourseCode === record.courseCode ? "overflow-visible" : "overflow-hidden"
                    } ${
                      orientation === "horizontal" ? "md:h-full" : ""
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: recordColor }} />

                    <div className="pl-1.5 pr-12">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className="relative z-30 mt-0.5" data-color-popover-root>
                            <button
                              type="button"
                              aria-label={`Change ${record.courseCode} color`}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-black/10 transition-opacity hover:opacity-80"
                              style={{ backgroundColor: recordColor }}
                              onClick={() => setColorPickerCourseCode((current) => current === record.courseCode ? null : record.courseCode)}
                            />
                            {colorPickerCourseCode === record.courseCode ? (
                              <div className="absolute left-0 top-7 z-20 min-w-[7.25rem] rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-2 shadow-md">
                                <div
                                  aria-hidden="true"
                                  className="pointer-events-none absolute -top-[7px] left-[5px] h-3 w-3 rotate-45 border-l border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
                                />
                                <div className="grid grid-cols-4 gap-1.5">
                                  {themePalette.map((color, colorIndex) => (
                                    <button
                                      key={color}
                                      type="button"
                                      aria-label={`Use color ${color}`}
                                      className={`h-5 w-5 rounded-[4px] border ${recordColor.toLowerCase() === color.toLowerCase() ? "border-[var(--on-surface)]" : "border-black/10"}`}
                                      style={{ backgroundColor: color }}
                                      onClick={() => {
                                        setCourseColorsByCourseCode((current) => ({
                                          ...current,
                                          [record.courseCode]: buildThemeColorPreference(colorIndex),
                                        }));
                                        setColorPickerCourseCode(null);
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                            <Link
                              href={`/courses/${record.courseCode}`}
                              className="inline min-w-0 text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            >
                              <span className="text-[14px] font-extrabold leading-5 sm:text-[15px]">{record.courseCode}</span>{" "}
                              <span className="text-[14px] font-normal leading-5 sm:text-[15px]">
                                {record.courseName ?? "Untitled course"}
                              </span>
                            </Link>
                          </div>
                        </div>
                        <div className="mt-1 space-y-1 text-[12px] font-medium leading-4 text-[var(--on-surface-variant)] sm:text-[13px] sm:leading-5">
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
                      <IconButton label="Remove course" onClick={() => removeClass(record.shareKey)} danger className="!h-7 !w-7 sm:!h-8 sm:!w-8">
                        <TrashIcon className="!h-4 !w-4 sm:!h-5 sm:!w-5" />
                      </IconButton>
                    </div>
                    </div>
                  </article>
                );
              })}

            </div>

            <div className={`border-t border-[var(--brand-divider)] pt-3 ${orientation === "horizontal" ? "mt-2.5" : "mt-2"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-left text-[11px] font-semibold leading-4 text-[var(--on-surface)] sm:text-[12px]">
                  <div className="text-[var(--on-surface-variant)]">Total Credit Units</div>
                  <div className="mt-1 text-[16px] font-bold leading-6 text-[var(--primary)] sm:text-[18px]">{totalCredits.toFixed(1)} CU</div>
                </div>
                <div className="relative shrink-0 w-[8.75rem] sm:w-[9.75rem]">
                  <select
                    value={sortMode}
                    aria-label="Order selected courses"
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-1 text-left text-[13px] font-medium leading-4 text-[var(--on-surface)] outline-none transition-colors hover:bg-[var(--surface-container-high)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:py-1.5 sm:text-[14px]"
                  >
                    <option value="code">Order by Code</option>
                    <option value="exam">Order by Exam</option>
                    <option value="credit">Order by CU</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(scheduleCourse)}
        title="Class Schedule"
        onClose={() => setScheduleCourse(null)}
        maxWidthClassName="max-w-2xl"
        showCloseButton
      >
        {scheduleCourse ? (
          <ClassScheduleModalContent
            courseCode={scheduleCourse.courseCode}
            courseName={scheduleCourse.courseName}
            classGroupLabel={formatClassGroupLabel(scheduleCourse.groupCode)}
            events={scheduleCourse.events}
            selectedSemesterId={semesterId}
          />
        ) : null}
      </Modal>

      <Modal
        open={confirmResetOpen}
        title="Reset planner"
        description="You are about to clear the selected courses for this semester. Are you sure?"
        onClose={() => setConfirmResetOpen(false)}
        bodyClassName="py-4"
        footer={(
          <>
            <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => setConfirmResetOpen(false)} />
            <ActionButton variant="primary" icon={<RefreshIcon className="h-4 w-4" />} label="Reset" onClick={resetPlanner} />
          </>
        )}
      >
        <div className="h-1" />
      </Modal>
    </>
  );
}
