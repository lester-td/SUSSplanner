"use client";

import { getActiveSemesters } from "@/lib/timetable/semester-visibility";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  BookIcon,
  CalendarIcon,
  CalendarWeekIcon,
  ColumnsIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  ListIcon,
  PinIcon,
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
import { CampusLabel } from "@/components/timetable/campus-label";
import { ClassScheduleModalContent, formatClassScheduleTitle } from "@/components/timetable/class-schedule-modal-content";
import { ExamCalendar, ExamCalendarOverviewRail } from "@/components/timetable/exam-calendar";
import { SelectorRail } from "@/components/timetable/selector-rail";
import { TimetableAlerts } from "@/components/timetable/timetable-alerts";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { TimetableExportCard } from "@/components/timetable/timetable-export-card";
import { printTimetablePdf } from "@/lib/export/pdf-client";
import { getPdfClassSessionEvents } from "@/lib/export/class-sessions";
import { buildExportCourses, getTimetableExportFileName } from "@/lib/export/timetable-model";
import { exportElementToPng } from "@/lib/export/png";
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
  getCourseContinuationDisplay,
  getFollowingContinuationSemesters,
} from "@/lib/timetable/course-continuation";
import {
  TIMETABLE_STORAGE_KEY,
  TIMETABLE_UPDATED_EVENT,
  loadSavedTimetable,
  getSavedSemesterState,
  saveTimetableToLocalStorage,
  upsertClassInSavedTimetable,
  removeClassFromSavedTimetable,
} from "@/lib/timetable/local-storage";
import {
  buildSharedClassIdentifier,
  encodeShareUrlState,
} from "@/lib/timetable/share-url";
import { filterClassesForSemester, filterEventsForSemester, filterTimetableForSemester } from "@/lib/timetable/semester-events";
import { resolveTimetableOpeningWeek } from "@/lib/timetable/opening-week";
import { getTimetableActionAvailability } from "@/lib/timetable/timetable-actions";
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
  defaultOrientation: TimetableOrientation,
): PlannerStorageState
{
  return {
    semesterId,
    selectedClasses: [],
    hiddenClasses: [],
    courseColorsByCourseCode: {},
    selectedWeekId: "all",
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
    ...current.filter((item) => item.courseCode !== incoming.courseCode || item.originSemesterId !== undefined),
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

function toClassSelection(group: CourseClassRecord): SharedClassIdentifier
{
  return {
    courseCode: group.courseCode,
    scheduleType: group.scheduleType,
    groupCodeType: group.groupCodeType,
    groupCode: group.groupCode,
  };
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
  allSemesters,
  currentSemesterId,
  currentWeekId,
}: {
  semesters: SemesterOption[];
  allSemesters: SemesterRecord[];
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
  const [selectedClasses, setSelectedClasses] = useState<SharedClassIdentifier[]>([]);
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([]);
  const [courseColorsByCourseCode, setCourseColorsByCourseCode] = useState<Record<string, string>>({});
  const [courseHasAlternativesByCode, setCourseHasAlternativesByCode] = useState<Record<string, boolean>>({});
  const [selectedWeekId, setSelectedWeekId] = useState<number | "all">("all");
  const [shareMessage, setShareMessage] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"PDF" | "ICS" | "PNG" | null>(null);
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
  const alternateExportCaptureRef = useRef<HTMLDivElement | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const activeSemesterIdRef = useRef(semesterId);
  activeSemesterIdRef.current = semesterId;
  const pickerRequestRef = useRef(0);
  const deferredSearch = useDeferredValue(searchInput);

  const semesterChoices = getActiveSemesters(semesters);
  const selectedSemester = semesterChoices.find((semester) => semester.semesterId === semesterId) ?? semesterChoices[0] ?? null;
  const semesterWeeks = selectedSemester?.weeks ?? [];
  const selectableWeeks = buildSelectableWeeks(semesterWeeks, timetableData.events);

  useEffect(() => {
    const settings = readAppSettings();
    const saved = loadSavedTimetable();
    const savedSemesterExists = Boolean(saved && semesters.some((semester) => semester.semesterId === saved.semesterId));
    const semesterIdToLoad = savedSemesterExists && saved
      ? saved.semesterId
      : currentSemesterId || getActiveSemesters(semesters)[0]?.semesterId || 0;
    const savedSemesterState = savedSemesterExists && saved
      ? saved
      : getSavedSemesterState(saved, semesterIdToLoad);
    const next = savedSemesterState ?? createDefaultSemesterState(semesterIdToLoad, settings.timetableOrientation);

    setAppSettings(settings);
    setSemesterId(semesterIdToLoad);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    setCourseColorsByCourseCode(next.courseColorsByCourseCode ?? {});
    setSelectedWeekId(resolveTimetableOpeningWeek({
      openingView: settings.timetableOpeningView,
      semesterId: semesterIdToLoad,
      currentSemesterId,
      currentWeekId,
      semesterWeeks: semesters.find((semester) => semester.semesterId === semesterIdToLoad)?.weeks ?? [],
      lastViewedWeekId: savedSemesterState?.selectedWeekId,
    }));
    setOrientation(saved?.orientation ?? settings.timetableOrientation);
    setViewMode(saved?.viewMode ?? "class");
    setReady(true);
  }, [currentSemesterId, currentWeekId, semesters]);

  useEffect(() => {
    const refreshSettings = () => setAppSettings(readAppSettings());
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEY)
      {
        refreshSettings();
      }
    };

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, refreshSettings);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, refreshSettings);
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

    const courseCodes = [...new Set(selectedClasses.filter((selection) => selection.originSemesterId === undefined).map((selection) => selection.courseCode))];
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
        if (controller.signal.aborted || activeSemesterIdRef.current !== semesterId) return;
        if (!selectedSemester) return;
        setTimetableData(filterTimetableForSemester(payload.timetable, selectedSemester, semesterWeeks));
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
      .then((payload) => {
        if (!controller.signal.aborted && activeSemesterIdRef.current === semesterId) setSearchResults(payload.courses);
      })
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
  const { canShare, canDownload, canReset } = getTimetableActionAvailability(
    selectedClasses,
    ready && selectedClasses.length > 0 && timetableData.semester?.semesterId === semesterId ? selectedCards.length : 0,
  );
  const themePalette = useMemo(() => getSettingsThemePalette(appSettings), [appSettings]);
  const defaultColorByCourseCode = useMemo(
    () => buildThemedCourseColorMap(selectedCards, themePalette),
    [selectedCards, themePalette],
  );
  const continuationByShareKey = useMemo(() => {
    const saved = ready ? loadSavedTimetable() : null;

    return new Map(selectedCards.flatMap((card) => {
      const display = getCourseContinuationDisplay({
        selection: card.identifier,
        semesterId,
        semesterStates: saved?.semesterStates,
        semesters: allSemesters,
      });

      return display ? [[card.shareKey, display] as const] : [];
    }));
  }, [ready, selectedCards, selectedClasses, semesterId, allSemesters]);
  const colorByShareKey = useMemo(
    () => new Map(selectedCards.map((card) => [
      card.shareKey,
      resolveThemeColorPreference(courseColorsByCourseCode[card.courseCode], themePalette)
        ?? defaultColorByCourseCode.get(card.courseCode)
        ?? card.color,
    ])),
    [courseColorsByCourseCode, defaultColorByCourseCode, selectedCards, themePalette],
  );
  const exportCourses = useMemo(
    () => buildExportCourses(
      selectedCards.map((card) => ({
        ...card,
        continuationLabel: continuationByShareKey.get(card.shareKey)?.cardLines.join(" · "),
      })),
      colorByShareKey,
      hiddenClasses,
    ),
    [selectedCards, colorByShareKey, continuationByShareKey, hiddenClasses],
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
    () => new Map(selectedClasses.filter((selection) => selection.originSemesterId === undefined).map((selection) => [selection.courseCode, buildSharedClassIdentifier(selection)])),
    [selectedClasses],
  );
  const visibleEvents = useMemo(
    () => (selectedSemester ? filterEventsForSemester(timetableData.events, selectedSemester, semesterWeeks) : [])
      .filter((event) => !hiddenClasses.includes(event.shareKey)),
    [hiddenClasses, selectedSemester, semesterWeeks, timetableData.events],
  );
  const allBlocks = useMemo(
    () => buildTimetableBlocks(visibleEvents, selectedWeekId).map((block) => ({
      ...block,
      continuationLabel: continuationByShareKey.get(block.shareKey)?.blockText,
    })),
    [continuationByShareKey, selectedWeekId, visibleEvents],
  );
  const pickerPreviewEvents = useMemo(
    () => selectedSemester ? filterEventsForSemester(buildPreviewEvents(classPickerClasses), selectedSemester, semesterWeeks) : [],
    [classPickerClasses, selectedSemester, semesterWeeks],
  );
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
  const undatedExams = useMemo(
    () => exportCourses.filter((course) => course.examStatus === "undated" && !course.hidden),
    [exportCourses],
  );
  const examCards = useMemo(
    () => buildExamCards(visibleEvents).filter((card) => !hiddenClasses.includes(card.shareKey)),
    [hiddenClasses, visibleEvents],
  );
  const examOverviewSubtitle = formatExamCalendarOverviewSubtitle(timetableData.semesterWeeks) ?? "No exam period loaded";
  const visibleEndMinutes = getLatestEndMinutes(displayedBlocks);
  const timeSlots = buildTimeSlots(visibleEndMinutes);
  const totalCredits = selectedCards.reduce((sum, card) => sum + (card.creditUnits ?? 0), 0);
  const weekItems = buildWeekOptions(selectableWeeks);
  const semesterItems = semesterChoices.map((semester) => ({
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

  function removeClass(shareKey: string)
  {
    const selection = selectedClasses.find((item) => buildSharedClassIdentifier(item) === shareKey);
    if (!selection) return;
    const next = removeClassFromSavedTimetable(loadSavedTimetable(), semesterId, selection);
    saveTimetableToLocalStorage(next);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    closeClassPicker();
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
    pickerRequestRef.current += 1;
    setClassPickerCourse(null);
    setClassPickerClasses([]);
    setClassPickerError("");
    setClassPickerLoading(false);
  }

  function addClassSelection(selection: SharedClassIdentifier, continuationSemesterIds: number[] = [])
  {
    if (selection.originSemesterId !== undefined) return;
    const next = upsertClassInSavedTimetable(loadSavedTimetable(), semesterId, selection, continuationSemesterIds);
    saveTimetableToLocalStorage(next);
    setSelectedClasses((current) => replaceSelectionForCourse(current, selection));
    setHiddenClasses(next.hiddenClasses);
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
    const savedSemesterState = getSavedSemesterState(saved, nextSemesterId);
    const next = savedSemesterState ?? createDefaultSemesterState(nextSemesterId, appSettings.timetableOrientation);

    activeSemesterIdRef.current = nextSemesterId;
    setTimetableData({ semester: null, semesterWeeks: [], selections: [], events: [], clashes: [], unresolvedSelections: [] });
    setScheduleCourse(null);
    setSemesterId(nextSemesterId);
    setSelectedClasses(next.selectedClasses);
    setHiddenClasses(next.hiddenClasses);
    setCourseColorsByCourseCode(next.courseColorsByCourseCode ?? {});
    setSelectedWeekId(resolveTimetableOpeningWeek({
      openingView: appSettings.timetableOpeningView,
      semesterId: nextSemesterId,
      currentSemesterId,
      currentWeekId,
      semesterWeeks: semesters.find((semester) => semester.semesterId === nextSemesterId)?.weeks ?? [],
      lastViewedWeekId: savedSemesterState?.selectedWeekId,
    }));
    setSearchInput("");
    setSearchResults([]);
    setPlannerNotice("");
    closeClassPicker();
  }

  function openClassPicker(course: ClassPickerCourse)
  {
    const requestId = ++pickerRequestRef.current;
    const requestSemesterId = semesterId;
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
      .then((payload) => {
        if (requestId !== pickerRequestRef.current || requestSemesterId !== activeSemesterIdRef.current) return;
        setClassPickerClasses(selectedSemester ? filterClassesForSemester(payload.classes, selectedSemester, semesterWeeks) : []);
      })
      .catch((error: unknown) => {
        if (requestId === pickerRequestRef.current) setClassPickerError(error instanceof Error ? error.message : "Unable to load class groups.");
      })
      .finally(() => {
        if (requestId === pickerRequestRef.current) setClassPickerLoading(false);
      });
  }

  async function handleSearchResultClick(course: CourseSearchResult)
  {
    const requestSemesterId = semesterId;
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
      if (requestSemesterId !== activeSemesterIdRef.current) return;
      const preferredGroupType = appSettings.timetableStudyMode === "full-time" ? "TG" : "CRN";
      const firstClass = pickPreferredClass(selectedSemester ? filterClassesForSemester(payload.classes, selectedSemester, semesterWeeks) : [], preferredGroupType, visibleEvents);

      if (!firstClass)
      {
        showPlannerBanner("No class groups are available for this course in the selected semester.");
        return;
      }

      const continuationSemesters = getFollowingContinuationSemesters({
        courseCode: course.courseCode,
        semesterId,
        offeredSemesters: course.scheduledSemesters ?? course.offeredSemesters,
        semesters: allSemesters,
        continuationSemesterIds: firstClass.continuationSemesterIds,
      });
      addClassSelection(toClassSelection(firstClass), continuationSemesters.map((item) => item.semesterId));
    }
    catch (error: unknown)
    {
      if (requestSemesterId !== activeSemesterIdRef.current) return;
      showPlannerBanner(error instanceof Error ? error.message : "Unable to load class groups.");
    }
  }

  async function handleShare()
  {
    if (!canShare) return;
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

  async function triggerDownload(path: string, fileName: string)
  {
    if (!canDownload || exportingFormat !== null) return;
    setDownloadOpen(false);
    setExportingFormat("ICS");
    try
    {
      const response = await fetch(`${path}?${buildShareQuery(semesterId, selectedClasses)}`);
      if (!response.ok) throw new Error("Unable to download the calendar file.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    catch
    {
      showPlannerBanner("Unable to download the calendar file.");
    }
    finally
    {
      setExportingFormat(null);
    }
  }

  async function waitForExportLayout()
  {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function handlePngExport()
  {
    if (!canDownload || exportingFormat !== null || !exportCaptureRef.current)
    {
      return;
    }

    setDownloadOpen(false);
    setExportingFormat("PNG");
    try
    {
      await waitForExportLayout();
      await exportElementToPng(
        exportCaptureRef.current,
        getTimetableExportFileName(selectedSemester, "png"),
      );
    }
    catch
    {
      showPlannerBanner("Unable to download the PNG image.");
    }
    finally
    {
      setExportingFormat(null);
    }
  }

  function handlePdfExport()
  {
    if (!canDownload || exportingFormat !== null) return;
    const timetableCard = viewMode === "class" ? exportCaptureRef.current : alternateExportCaptureRef.current;
    const examCalendarCard = viewMode === "exam" ? exportCaptureRef.current : alternateExportCaptureRef.current;
    if (!timetableCard || !examCalendarCard) return;
    setDownloadOpen(false);
    setExportingFormat("PDF");
    const opened = printTimetablePdf(
      timetableCard,
      examCalendarCard,
      selectedSemester,
      getPdfClassSessionEvents(timetableData, hiddenClasses),
      timetableData.clashes.filter((clash) => clash.events.every((event) => !hiddenClasses.includes(event.shareKey))),
      getTimetableExportFileName(selectedSemester, "pdf"),
      () => setExportingFormat(null),
    );
    if (!opened)
    {
      setExportingFormat(null);
      showPlannerBanner("Unable to open the PDF print dialog.");
    }
  }

  function resetPlanner()
  {
    if (!canReset) return;
    setSelectedClasses((current) => current.filter((item) => item.originSemesterId !== undefined));
    setHiddenClasses([]);
    setCourseColorsByCourseCode({});
    setSearchInput("");
    setPlannerNotice("");
    setDownloadOpen(false);
    setConfirmResetOpen(false);
    closeClassPicker();
    saveTimetableToLocalStorage({
      semesterId,
      selectedClasses: selectedClasses.filter((item) => item.originSemesterId !== undefined),
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
  const thisWeek = semesterId === currentSemesterId
    ? selectableWeeks.find((week) => week.weekId === currentWeekId)
    : undefined;

  return (
    <>
      <div className={`timetable-page flex min-h-0 flex-1 flex-col ${orientation === "horizontal" ? "md:flex-col" : "md:flex-row"}`}>
        <section className={`flex min-h-0 w-full flex-1 flex-col ${orientation === "horizontal" ? "md:w-full" : "md:w-[70%]"}`}>
          <div className="timetable-toolbar elev-1 flex flex-col border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
            <SelectorRail
              items={semesterItems}
              selectedId={String(semesterId)}
              onSelect={(id) => handleSemesterChange(Number(id))}
              onPrev={() => {
                const index = semesterChoices.findIndex((semester) => semester.semesterId === semesterId);
                if (index > 0)
                {
                  handleSemesterChange(semesterChoices[index - 1].semesterId);
                }
              }}
              onNext={() => {
                const index = semesterChoices.findIndex((semester) => semester.semesterId === semesterId);
                if (index >= 0 && index < semesterChoices.length - 1)
                {
                  handleSemesterChange(semesterChoices[index + 1].semesterId);
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
            semester={selectedSemester}
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
                    if (block.originSemesterId !== undefined) return;
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
                <ExamCalendar cards={examCards} colorByShareKey={colorByShareKey} undatedExams={undatedExams} />
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
          </div>

          <div className="shrink-0 bg-[var(--surface-container-lowest)] px-2.5 py-1.5 sm:px-3">
            <label className="relative z-20 block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                className="elev-1 w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-1.5 pl-10 pr-4 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:py-2 sm:text-[14px]"
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
                <ActionButton variant="primary" icon={<ShareIcon className="h-[18px] w-[18px]" />} label="Share" onClick={handleShare} stretch disabled={!canShare} />
                <div className="relative" data-download-popover-root>
                  <ActionButton
                    variant="ghost"
                    icon={exportingFormat ? <span aria-hidden="true" className="h-[18px] w-[18px] motion-safe:animate-spin rounded-full border-2 border-current border-r-transparent" /> : <DownloadIcon className="h-[18px] w-[18px]" />}
                    label={exportingFormat ? "Loading…" : "Download"}
                    onClick={() => setDownloadOpen((current) => !current)}
                    stretch
                    disabled={!canDownload || exportingFormat !== null}
                  />
                  <span className="sr-only" role="status" aria-live="polite">{exportingFormat ? `Preparing ${exportingFormat} export` : ""}</span>
                  {downloadOpen && canDownload ? (
                    <div className="elev-3 absolute left-0 top-full z-30 mt-1.5 w-full min-w-[9.5rem] rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
                      />
                      <div className="grid grid-cols-1 gap-1.5">
                        <ActionButton variant="ghost" icon={<DownloadIcon className="h-[18px] w-[18px]" />} label="PDF" onClick={() => void handlePdfExport()} />
                        <ActionButton variant="ghost" icon={<CalendarIcon className="h-[18px] w-[18px]" />} label="ICS" onClick={() => void triggerDownload("/api/export/ics", `suss-planner-${semesterId}-${viewMode}.ics`)} />
                        <ActionButton variant="ghost" icon={<GridIcon className="h-[18px] w-[18px]" />} label="PNG" onClick={() => void handlePngExport()} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <ActionButton variant="ghost" icon={nextViewToggle.icon} label={nextViewToggle.label} onClick={nextViewToggle.onClick} stretch />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <ActionButton
                  variant={selectedWeekId === "all" ? "primary" : "ghost"}
                  icon={<CalendarWeekIcon className="h-[18px] w-[18px]" />}
                  label={selectedWeekId === "all" ? "This Week" : "Äll Weeks"}
                  onClick={() => setSelectedWeekId((current) => current === "all" ? thisWeek?.weekId ?? "all" : "all")}
                  stretch
                  disabled={selectedWeekId === "all" && !thisWeek}
                />
                <ActionButton variant="ghost" icon={nextOrientationToggle.icon} label={nextOrientationToggle.label} onClick={nextOrientationToggle.onClick} stretch />
                <ActionButton variant="ghost" icon={<RefreshIcon className="h-[18px] w-[18px]" />} label="Reset" onClick={() => setConfirmResetOpen(true)} stretch disabled={!canReset} />
              </div>
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
                const continuation = continuationByShareKey.get(record.shareKey);
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
                          <div className="relative z-10 mt-0.5" data-color-popover-root>
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
                              href={`/courses/${record.courseCode}?semesterId=${semesterId}`}
                              className="inline min-w-0 text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                            >
                              <span className="text-[14px] font-extrabold leading-5 sm:text-[15px]">{record.courseCode}</span>{" "}
                              <span className="text-[14px] font-normal leading-5 sm:text-[15px]">
                                {record.courseName ?? "Untitled course"}
                              </span>
                            </Link>
                          </div>
                        </div>
                        {continuation ? (
                          <div className="mt-1 pl-6 text-[11px] font-semibold leading-4 text-[var(--on-surface)] sm:text-[12px]">
                            {continuation.cardLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-1 space-y-1 text-[12px] font-medium leading-4 text-[var(--on-surface-variant)] sm:text-[13px] sm:leading-5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <ListIcon className="h-4 w-4 shrink-0" />
                            <span className="shrink-0 font-semibold text-[var(--on-surface)]">Group:</span>
                            <span className="truncate">{formatClassGroupLabel(record.groupCode)}</span>
                          </div>
                          {record.campuses.length > 0 ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <PinIcon className="h-4 w-4 shrink-0" />
                              <span className="shrink-0 font-semibold text-[var(--on-surface)]">Campus:</span>
                              <CampusLabel campuses={record.campuses} />
                            </div>
                          ) : null}
                          <div className="flex min-w-0 items-center gap-1.5">
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {record.examStatus !== "dated" ? (
                              <span className="truncate font-bold text-[var(--on-surface)]">{record.examDateLabel}</span>
                            ) : (
                              <>
                                <span className="shrink-0 font-semibold text-[var(--on-surface)]">Exam:</span>
                                <span className="truncate">{record.examDateLabel}{record.examTimeLabel ? `, ${record.examTimeLabel}` : ""}</span>
                              </>
                            )}
                          </div>
                          {record.examGuidance ? (
                            <div className="pl-5 text-[11px] leading-4">{record.examGuidance}</div>
                          ) : null}
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

      <TimetableExportCard
        ref={exportCaptureRef}
        semester={selectedSemester}
        weekLabel={selectedWeekId === "all" ? "All weeks" : selectedWeekRecord?.label ?? "Selected week"}
        viewMode={viewMode}
        orientation={orientation}
        blocks={allBlocks}
        examCards={examCards}
        colorByShareKey={colorByShareKey}
        courses={exportCourses}
        dayDateByDay={dayDateByDay}
        showAllWeeks={selectedWeekId === "all"}
      />

      <TimetableExportCard
        ref={alternateExportCaptureRef}
        semester={selectedSemester}
        weekLabel={selectedWeekId === "all" ? "All weeks" : selectedWeekRecord?.label ?? "Selected week"}
        viewMode={viewMode === "class" ? "exam" : "class"}
        orientation={orientation}
        blocks={allBlocks}
        examCards={examCards}
        colorByShareKey={colorByShareKey}
        courses={exportCourses}
        dayDateByDay={dayDateByDay}
        showAllWeeks={selectedWeekId === "all"}
      />

      <Modal
        open={Boolean(scheduleCourse)}
        title={scheduleCourse ? formatClassScheduleTitle(formatClassGroupLabel(scheduleCourse.groupCode), scheduleCourse.events) : "Class Schedule"}
        headerIcon={<CalendarWeekIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />}
        onClose={() => setScheduleCourse(null)}
        maxWidthClassName="max-w-2xl"
        showCloseButton
      >
        {scheduleCourse ? (
          <ClassScheduleModalContent
            courseCode={scheduleCourse.courseCode}
            courseName={scheduleCourse.courseName}
            courseLabel={scheduleCourse.courseLabel}
            events={scheduleCourse.events}
            selectedSemesterId={semesterId}
          />
        ) : null}
      </Modal>

      <Modal
        open={confirmResetOpen}
        title="Reset planner"
        description="Clear courses starting in this semester? Their future continuations will also be removed. Courses carried from earlier semesters remain."
        onClose={() => setConfirmResetOpen(false)}
        bodyClassName="py-4"
        footer={(
          <>
            <ActionButton variant="ghost" icon={<XIcon className="h-4 w-4" />} label="Cancel" onClick={() => setConfirmResetOpen(false)} />
            <ActionButton variant="primary" icon={<RefreshIcon className="h-4 w-4" />} label="Reset" onClick={resetPlanner} disabled={!canReset} />
          </>
        )}
      >
        <div className="h-1" />
      </Modal>
    </>
  );
}
