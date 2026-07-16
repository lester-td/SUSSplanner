"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  BookIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FilterIcon,
  LayersIcon,
  ListIcon,
  RefreshIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "@/components/planner/icons";
import { AddToSemesterPlannerButton } from "@/components/planner/add-to-semester-planner-button";
import { AddToTimetableButton } from "@/components/timetable/add-to-timetable-button";
import {
  buildCourseSearchParams,
  extractCourseLevelNumber,
  type CourseSearchFilters,
} from "@/lib/timetable/course-search";
import type { CourseSearchResult, SemesterRecord } from "@/lib/timetable/types";

type SearchResponse = {
  courses: CourseSearchResult[];
};

const SYNOPSIS_WORD_LIMIT = 100;
const COURSES_PER_PAGE = 10;
const COURSE_CATALOG_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const MOBILE_SEARCH_HEADER_COLLAPSE_SCROLL_THRESHOLD = 24;

let cachedAllCourses: CourseSearchResult[] | null = null;
let cachedAllCoursesFetchedAt = 0;
let pendingAllCoursesRequest: Promise<CourseSearchResult[]> | null = null;

function normalizeSearchTerm(term: string)
{
  return term.trim();
}

function escapeRegExp(value: string)
{
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightSearchTerm(text: string, searchTerm: string)
{
  const normalizedTerm = normalizeSearchTerm(searchTerm);
  if (!normalizedTerm)
  {
    return text;
  }

  const pattern = new RegExp(`(${escapeRegExp(normalizedTerm)})`, "gi");
  const segments = text.split(pattern);
  const lowerTerm = normalizedTerm.toLowerCase();

  return segments.map((segment, index) => (
    segment.toLowerCase() === lowerTerm
      ? (
        <u key={`${segment}-${index}`} className="font-bold underline decoration-[1.5px] underline-offset-2">
          {segment}
        </u>
      )
      : <span key={`${segment}-${index}`}>{segment}</span>
  ));
}

function renderHighlightedText(text: string | null, searchTerm: string, fallback: string)
{
  if (!text)
  {
    return fallback;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized)
  {
    return fallback;
  }

  return highlightSearchTerm(normalized, searchTerm);
}

function truncateWords(text: string | null, maxWords: number)
{
  if (!text)
  {
    return text;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized)
  {
    return normalized;
  }

  const words = normalized.split(" ");
  if (words.length <= maxWords)
  {
    return normalized;
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function formatCourseLevel(courseLevel: string | null)
{
  if (!courseLevel)
  {
    return "Level unavailable";
  }

  const levelNumber = extractCourseLevelNumber(courseLevel);
  return levelNumber === null ? courseLevel : `Level ${levelNumber}`;
}

function readRuntimeString(record: object, ...keys: string[])
{
  const source = record as Record<string, unknown>;

  for (const key of keys)
  {
    const value = source[key];
    if (typeof value === "string" && value.trim())
    {
      return value.trim();
    }
  }

  return null;
}

function uniqueSortedText(values: Array<string | null>)
{
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right));
}

function isLikelyCourseLevelFacet(value: string)
{
  const normalized = value.trim().toLowerCase();
  return /^(?:level\s*)?[1-6](?:00|xx|xxx)?$/.test(normalized);
}

function mostlyLooksLikeCourseLevels(values: string[])
{
  return values.length > 0
    && values.filter(isLikelyCourseLevelFacet).length >= Math.ceil(values.length * 0.75);
}

function mostlyLooksLikeSchools(values: string[])
{
  return values.length > 0
    && values.filter((value) => !isLikelyCourseLevelFacet(value)).length >= Math.ceil(values.length * 0.75);
}

function normalizeCourseSearchFacets({
  schools,
  courseLevels,
  courses,
}: {
  schools: string[];
  courseLevels: string[];
  courses: CourseSearchResult[];
})
{
  let normalizedSchools = schools;
  let normalizedCourseLevels = courseLevels;

  if (mostlyLooksLikeCourseLevels(schools) && mostlyLooksLikeSchools(courseLevels))
  {
    normalizedSchools = courseLevels;
    normalizedCourseLevels = schools;
  }

  if (mostlyLooksLikeCourseLevels(normalizedSchools))
  {
    normalizedSchools = uniqueSortedText(courses.map((course) => course.schoolName));
  }

  if (mostlyLooksLikeSchools(normalizedCourseLevels))
  {
    normalizedCourseLevels = uniqueSortedText(courses.map((course) => course.courseLevel));
  }

  return {
    schools: normalizedSchools,
    courseLevels: normalizedCourseLevels,
  };
}

function formatSemesterFilterLabel(semester: SemesterRecord)
{
  const semesterName = readRuntimeString(semester, "semesterName", "semester_name")
    ?? `Semester ${semester.semesterNo}`;
  const academicYear = readRuntimeString(semester, "academicYear", "academic_year");

  return academicYear ? `${semesterName} (${academicYear})` : semesterName;
}

function buildSemesterIndicators(course: CourseSearchResult)
{
  const bySemesterNo = new Map<number, string>();

  for (const semester of course.offeredSemesters)
  {
    if (semester.semesterNo === 1 && !bySemesterNo.has(1))
    {
      bySemesterNo.set(1, "Sem 1");
    }
    else if (semester.semesterNo === 2 && !bySemesterNo.has(2))
    {
      bySemesterNo.set(2, "Sem 2");
    }
    else if (semester.semesterNo === 3 && !bySemesterNo.has(3))
    {
      bySemesterNo.set(3, "Special Sem");
    }
  }

  return [1, 2, 3].flatMap((semesterNo) => {
    const label = bySemesterNo.get(semesterNo);
    return label ? [label] : [];
  });
}

function toggleInList<T>(values: T[], value: T)
{
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function buildLevelOptions(courseLevels: string[])
{
  const mappedLevels = new Map<number, string>();

  for (const courseLevel of courseLevels)
  {
    const levelNumber = extractCourseLevelNumber(courseLevel);
    if (levelNumber !== null && !mappedLevels.has(levelNumber))
    {
      mappedLevels.set(levelNumber, courseLevel);
    }
  }

  if (mappedLevels.size > 0)
  {
    return [...mappedLevels.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([levelNumber, value]) => ({
        label: String(levelNumber),
        value,
      }));
  }

  return courseLevels.map((courseLevel) => ({
    label: courseLevel,
    value: courseLevel,
  }));
}

const ASSESSMENT_MODE_OPTIONS = [
  "TMA",
  "GBA",
  "Quiz",
  "ECA",
  "Written Exam",
  "Proctored Online Exam",
  "Online Exam",
] as const;

function hasActiveCourseFilters(filters: CourseSearchFilters)
{
  return filters.q.trim().length > 0
    || filters.semesterIds.length > 0
    || filters.scheduleTypes.length > 0
    || filters.undergraduateOnly
    || filters.postgraduateOnly
    || filters.availableAsGspOnly
    || filters.assessmentModes.length > 0
    || filters.schoolNames.length > 0
    || filters.courseLevels.length > 0;
}

function buildPaginationPages(currentPage: number, totalPages: number)
{
  const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const endPage = Math.min(totalPages, startPage + 4);

  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
}

function includesText(value: string | null, searchTerm: string)
{
  return value?.toLowerCase().includes(searchTerm) ?? false;
}

function getSearchRanking(course: CourseSearchResult, searchTerm: string)
{
  if (!searchTerm)
  {
    return 9;
  }

  const courseCode = course.courseCode.toLowerCase();
  const courseName = course.courseName?.toLowerCase() ?? "";
  const schoolName = course.schoolName?.toLowerCase() ?? "";
  const courseSynopsis = course.courseSynopsis?.toLowerCase() ?? "";

  if (courseCode === searchTerm)
  {
    return 0;
  }
  if (courseCode.startsWith(searchTerm))
  {
    return 1;
  }
  if (courseCode.includes(searchTerm))
  {
    return 2;
  }
  if (courseName.startsWith(searchTerm))
  {
    return 3;
  }
  if (courseName.includes(searchTerm))
  {
    return 4;
  }
  if (schoolName.startsWith(searchTerm))
  {
    return 5;
  }
  if (schoolName.includes(searchTerm))
  {
    return 6;
  }
  if (courseSynopsis.startsWith(searchTerm))
  {
    return 7;
  }
  if (courseSynopsis.includes(searchTerm))
  {
    return 8;
  }

  return 9;
}

function filterCourses(courses: CourseSearchResult[], filters: CourseSearchFilters)
{
  const searchTerm = filters.q.trim().toLowerCase();
  const selectedAssessmentModes = new Set(filters.assessmentModes.map((value) => value.trim()).filter(Boolean));

  return courses
    .filter((course) => {
      if (searchTerm
        && !includesText(course.courseCode, searchTerm)
        && !includesText(course.courseName, searchTerm)
        && !includesText(course.schoolName, searchTerm)
        && !includesText(course.courseSynopsis, searchTerm))
      {
        return false;
      }

      if (filters.semesterIds.length > 0
        && !course.offeredSemesters.some((semester) => filters.semesterIds.includes(semester.semesterId)))
      {
        return false;
      }

      if (filters.scheduleTypes.length > 0
        && !course.scheduleTypes.some((scheduleType) => filters.scheduleTypes.includes(scheduleType)))
      {
        return false;
      }

      if (filters.postgraduateOnly && course.isPostgraduate !== true)
      {
        return false;
      }

      if (filters.undergraduateOnly !== filters.postgraduateOnly)
      {
        if (filters.undergraduateOnly && course.isPostgraduate === true)
        {
          return false;
        }

        if (filters.postgraduateOnly && course.isPostgraduate !== true)
        {
          return false;
        }
      }

      if (filters.availableAsGspOnly && !course.availableAsGsp)
      {
        return false;
      }

      if (selectedAssessmentModes.size > 0
        && !course.assessmentModes.some((assessmentMode) => selectedAssessmentModes.has(assessmentMode)))
      {
        return false;
      }

      if (filters.schoolNames.length > 0 && (!course.schoolName || !filters.schoolNames.includes(course.schoolName)))
      {
        return false;
      }

      if (filters.courseLevels.length > 0 && (!course.courseLevel || !filters.courseLevels.includes(course.courseLevel)))
      {
        return false;
      }

      return true;
    })
    .sort((left, right) => (
      getSearchRanking(left, searchTerm) - getSearchRanking(right, searchTerm)
      || left.courseCode.localeCompare(right.courseCode)
    ));
}

async function fetchCourseResults(requestQuery: string, signal?: AbortSignal)
{
  const response = await fetch(`/api/courses/search${requestQuery ? `?${requestQuery}` : ""}`, {
    signal,
  });

  if (!response.ok)
  {
    throw new Error("Unable to search courses.");
  }

  const payload = await response.json() as SearchResponse;
  return payload.courses;
}

function isCachedCatalogFresh(now = Date.now())
{
  return cachedAllCourses !== null
    && now - cachedAllCoursesFetchedAt < COURSE_CATALOG_REFRESH_INTERVAL_MS;
}

function fetchAllCourses()
{
  pendingAllCoursesRequest ??= fetchCourseResults(`refresh=${Date.now()}`)
    .then((courses) => {
      cachedAllCourses = courses;
      cachedAllCoursesFetchedAt = Date.now();
      return courses;
    })
    .finally(() => {
      pendingAllCoursesRequest = null;
    });

  return pendingAllCoursesRequest;
}

function getAllCourses()
{
  return isCachedCatalogFresh()
    ? Promise.resolve(cachedAllCourses)
    : fetchAllCourses();
}

export function CourseSearchPage({
  semesters,
  currentSemesterId,
  schools,
  courseLevels,
  initialFilters,
}: {
  semesters: SemesterRecord[];
  currentSemesterId: number | null;
  schools: string[];
  courseLevels: string[];
  initialFilters: CourseSearchFilters;
})
{
  const [filters, setFilters] = useState(initialFilters);
  const [allCourses, setAllCourses] = useState<CourseSearchResult[]>(cachedAllCourses ?? []);
  const [loading, setLoading] = useState(cachedAllCourses === null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isMobileSearchHeaderCompact, setIsMobileSearchHeaderCompact] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const pageShellRef = useRef<HTMLDivElement | null>(null);
  const shouldJumpToPageTopRef = useRef(false);
  const normalizedFacets = useMemo(
    () => normalizeCourseSearchFacets({ schools, courseLevels, courses: allCourses }),
    [allCourses, courseLevels, schools],
  );
  const levelOptions = useMemo(() => buildLevelOptions(normalizedFacets.courseLevels), [normalizedFacets.courseLevels]);
  const filteredCourses = useMemo(() => filterCourses(allCourses, filters), [allCourses, filters]);

  useLayoutEffect(() => {
    const pageShell = pageShellRef.current;
    const navbar = document.querySelector<HTMLElement>(".app-navbar");
    if (!pageShell || !navbar)
      return undefined;

    const syncNavbarHeight = () => {
      pageShell.style.setProperty("--course-search-navbar-height", `${navbar.getBoundingClientRect().height}px`);
    };

    syncNavbarHeight();
    window.addEventListener("resize", syncNavbarHeight);

    const observer = new ResizeObserver(syncNavbarHeight);
    observer.observe(navbar);

    return () => {
      window.removeEventListener("resize", syncNavbarHeight);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let animationFrameId = 0;

    const syncSearchHeaderState = () => {
      const nextIsMobileViewport = mobileQuery.matches;
      const nextIsCompact = nextIsMobileViewport
        && window.scrollY > MOBILE_SEARCH_HEADER_COLLAPSE_SCROLL_THRESHOLD;

      setIsMobileViewport((current) => (current === nextIsMobileViewport ? current : nextIsMobileViewport));
      setIsMobileSearchHeaderCompact((current) => (current === nextIsCompact ? current : nextIsCompact));
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(syncSearchHeaderState);
    };

    scheduleSync();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    mobileQuery.addEventListener("change", scheduleSync);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      mobileQuery.removeEventListener("change", scheduleSync);
    };
  }, []);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const filterKey = useMemo(() => buildCourseSearchParams(filters).toString(), [
    filters.q,
    filters.assessmentModes.join("|"),
    filters.availableAsGspOnly,
    filters.courseLevels.join("|"),
    filters.undergraduateOnly,
    filters.postgraduateOnly,
    filters.scheduleTypes.join("|"),
    filters.schoolNames.join("|"),
    filters.semesterIds.join("|"),
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterKey]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / COURSES_PER_PAGE));
  const pageResults = useMemo(() => {
    const startIndex = (currentPage - 1) * COURSES_PER_PAGE;
    return filteredCourses.slice(startIndex, startIndex + COURSES_PER_PAGE);
  }, [currentPage, filteredCourses]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!filtersOpen)
    {
      return;
    }

    function handleKeyDown(event: KeyboardEvent)
    {
      if (event.key === "Escape")
      {
        setFiltersOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtersOpen]);

  useLayoutEffect(() => {
    if (!shouldJumpToPageTopRef.current)
    {
      return;
    }

    shouldJumpToPageTopRef.current = false;
    jumpToPageTop();
  }, [currentPage]);

  useEffect(() => {
    let isActive = true;

    function refreshCatalog({ showLoading }: { showLoading: boolean })
    {
      if (showLoading)
      {
        setLoading(true);
      }

      getAllCourses()
        .then((courses) => {
          if (isActive && courses)
          {
            setAllCourses(courses);
          }
        })
        .catch(() => {
          if (isActive && !cachedAllCourses)
          {
            setAllCourses([]);
          }
        })
        .finally(() => {
          if (isActive && showLoading)
          {
            setLoading(false);
          }
        });
    }

    if (cachedAllCourses)
    {
      setAllCourses(cachedAllCourses);
      setLoading(false);

      if (!isCachedCatalogFresh())
      {
        refreshCatalog({ showLoading: false });
      }
    }
    else
    {
      refreshCatalog({ showLoading: true });
    }

    function handlePageActive()
    {
      if (!isCachedCatalogFresh())
      {
        refreshCatalog({ showLoading: cachedAllCourses === null });
      }
    }

    window.addEventListener("focus", handlePageActive);
    document.addEventListener("visibilitychange", handlePageActive);

    return () => {
      isActive = false;
      window.removeEventListener("focus", handlePageActive);
      document.removeEventListener("visibilitychange", handlePageActive);
    };
  }, []);

  function resetCheckboxFilters()
  {
    setFilters((current) => ({
      ...current,
      semesterIds: [],
      scheduleTypes: [],
      undergraduateOnly: false,
      postgraduateOnly: false,
      availableAsGspOnly: false,
      assessmentModes: [],
      schoolNames: [],
      courseLevels: [],
    }));
  }

  function jumpToPageTop()
  {
    const root = document.documentElement;
    const body = document.body;
    const scroller = document.scrollingElement ?? root;
    const previousScrollBehavior = root.style.scrollBehavior;
    const previousBodyScrollBehavior = body.style.scrollBehavior;

    root.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;

    window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousScrollBehavior;
      body.style.scrollBehavior = previousBodyScrollBehavior;
    });
  }

  function renderFilterSettings()
  {
    return (
      <>
        <div className="course-search-filter-header sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[var(--brand-divider)] pb-2 pt-2">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-[18px] w-[18px] text-[var(--primary)]" />
            <h2 className="text-[16px] font-semibold leading-5 text-[var(--on-surface)]">Search Settings</h2>
          </div>
          <button
            type="button"
            onClick={resetCheckboxFilters}
            className="inline-flex items-center gap-1 rounded-[0.35rem] border border-[var(--outline-variant)] px-2 py-1 text-[10px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
          >
            <RefreshIcon className="h-3 w-3" />
            Reset all
          </button>
        </div>

        <div className="divide-y divide-[var(--brand-divider)]">
          <FilterGroup title="Offered In">
            {semesters.map((semester) => (
              <CheckboxRow
                key={semester.semesterId}
                label={formatSemesterFilterLabel(semester)}
                checked={filters.semesterIds.includes(semester.semesterId)}
                onChange={() => setFilters((current) => ({
                  ...current,
                  semesterIds: toggleInList(current.semesterIds, semester.semesterId),
                }))}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Schedule">
            <CheckboxRow
              label="Daytime"
              checked={filters.scheduleTypes.includes("daytime")}
              onChange={() => setFilters((current) => ({
                ...current,
                scheduleTypes: toggleInList(current.scheduleTypes, "daytime"),
              }))}
            />
            <CheckboxRow
              label="Evening"
              checked={filters.scheduleTypes.includes("evening")}
              onChange={() => setFilters((current) => ({
                ...current,
                scheduleTypes: toggleInList(current.scheduleTypes, "evening"),
              }))}
            />
          </FilterGroup>

          <FilterGroup title="Course Level" contentClassName="grid grid-cols-3 gap-y-px">
            {levelOptions.map((levelOption) => (
              <div key={levelOption.value}>
                <CheckboxRow
                  label={levelOption.label}
                  checked={filters.courseLevels.includes(levelOption.value)}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    courseLevels: toggleInList(current.courseLevels, levelOption.value),
                  }))}
                />
              </div>
            ))}
          </FilterGroup>

          <FilterGroup title="Course Type">
            <CheckboxRow
              label="Undergraduate Courses"
              checked={filters.undergraduateOnly}
              onChange={() => setFilters((current) => ({
                ...current,
                undergraduateOnly: !current.undergraduateOnly,
              }))}
            />
            <CheckboxRow
              label="Postgraduate Courses"
              checked={filters.postgraduateOnly}
              onChange={() => setFilters((current) => ({
                ...current,
                postgraduateOnly: !current.postgraduateOnly,
              }))}
            />
            <CheckboxRow
              label="Available as GSP/UNE"
              checked={filters.availableAsGspOnly}
              onChange={() => setFilters((current) => ({
                ...current,
                availableAsGspOnly: !current.availableAsGspOnly,
              }))}
            />
          </FilterGroup>

          <FilterGroup title="Assessments">
            <div className="max-h-80 space-y-px overflow-y-auto pr-1">
              {ASSESSMENT_MODE_OPTIONS.map((assessmentMode) => (
                <CheckboxRow
                  key={assessmentMode}
                  label={assessmentMode}
                  checked={filters.assessmentModes.includes(assessmentMode)}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    assessmentModes: toggleInList(current.assessmentModes, assessmentMode),
                  }))}
                />
              ))}
            </div>
          </FilterGroup>

          <FilterGroup
            title="School"
            action={(
              <button
                type="button"
                onClick={() => setFilters((current) => ({ ...current, schoolNames: [] }))}
                className="text-[11px] font-semibold leading-4 text-[var(--primary)] transition-opacity hover:opacity-75"
              >
                Reset
              </button>
            )}
          >
            {normalizedFacets.schools.map((school) => (
              <CheckboxRow
                key={school}
                label={school}
                checked={filters.schoolNames.includes(school)}
                onChange={() => setFilters((current) => ({
                  ...current,
                  schoolNames: toggleInList(current.schoolNames, school),
                }))}
              />
            ))}
          </FilterGroup>
        </div>
      </>
    );
  }

  return (
    <div ref={pageShellRef} className="course-search-page">
      <div className="mx-auto grid max-w-7xl gap-2.5 md:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="course-search-results-column space-y-1.5 md:space-y-2.5 md:pr-4">
          <div
            aria-hidden={isMobileSearchHeaderCompact}
            className={`overflow-hidden transition-[max-height,opacity] duration-200 ${isMobileSearchHeaderCompact ? "max-h-0 opacity-0" : "max-h-20 opacity-100"} md:max-h-none md:opacity-100`}
          >
            <div className="flex items-baseline justify-between gap-2 md:items-end md:gap-3">
              <div className="min-w-0">
                <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">Course Search</h1>
              </div>
              <div className="shrink-0 whitespace-nowrap text-right text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                {loading ? "Loading courses..." : `${filteredCourses.length} courses found`}
              </div>
            </div>
          </div>

          <div className={`course-search-sticky-header sticky z-30 border-b border-[var(--brand-divider)] transition-[padding-bottom,background-color] duration-200 ${isMobileSearchHeaderCompact ? "pb-2" : "pb-3"} md:pb-3`}>
            <div
              className={`relative block transition-[margin-top] duration-200 ${isMobileViewport ? (isMobileSearchHeaderCompact ? "mt-0" : "mt-0.5") : isMobileSearchHeaderCompact ? "mt-0" : "mt-4"} md:mt-4`}
            >
              <SearchIcon className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] transition-[left,width,height] duration-200 ${isMobileViewport ? "left-3 h-4 w-4" : isMobileSearchHeaderCompact ? "left-3 h-4 w-4" : "left-3.5 h-5 w-5"} md:left-4 md:h-5 md:w-5`} />
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder={isMobileViewport ? "Course code, title, or description" : "Search by course code, course title, or descriptions"}
                className={`elev-1 w-full rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] pr-4 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-[border-color,box-shadow,padding,font-size] duration-200 ${isMobileViewport ? "py-2.5 pl-10 text-[14px]" : isMobileSearchHeaderCompact ? "py-2.5 pl-10 text-[14px]" : "py-3 pl-11 text-[15px]"} md:py-3 md:pl-12 md:text-[15px]`}
              />
            </div>
          </div>

          {hasActiveCourseFilters(filters) && filteredCourses.length === 0 && !loading ? (
            <div className="elev-1 rounded-[0.9rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-6 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              No courses matched the current query and checkbox filters.
            </div>
          ) : pageResults.length > 0 ? (
            <div className="divide-y divide-[var(--brand-divider)] border-b border-[var(--brand-divider)]">
              {pageResults.map((course) => {
                const semesterIndicators = buildSemesterIndicators(course);

                return (
                <article key={course.courseCode} className="px-0.5 py-3 md:px-4">
                  <div className="flex flex-col gap-2">
                    <h2 className="min-w-0 text-[18px] font-bold leading-7 tracking-[-0.02em]">
                      <Link
                        href={`/courses/${course.courseCode}`}
                        className="inline items-baseline break-normal text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      >
                        <span>{renderHighlightedText(course.courseCode, filters.q, course.courseCode)}</span>{" "}
                        <span>{renderHighlightedText(course.courseName, filters.q, "Untitled course")}</span>
                      </Link>
                    </h2>
                  </div>

                  <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <LayersIcon className="h-4 w-4 shrink-0" />
                        {course.isPostgraduate ? "Postgraduate" : "Undergraduate"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ListIcon className="h-4 w-4 shrink-0" />
                        {formatCourseLevel(course.courseLevel)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BookIcon className="h-4 w-4 shrink-0" />
                        {course.creditUnits?.toFixed(1) ?? "0.0"} CU
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <SchoolIcon className="h-4 w-4 shrink-0" />
                        {renderHighlightedText(course.schoolName, filters.q, "School unavailable")}
                      </span>
                    </div>
                  </div>

                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                    {renderHighlightedText(
                      truncateWords(course.courseSynopsis, SYNOPSIS_WORD_LIMIT),
                      filters.q,
                      "No synopsis available.",
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {semesterIndicators.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        <span>{semesterIndicators.join(" \u00b7 ")}</span>
                      </div>
                    ) : null}

                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1">
                      <AddToTimetableButton
                        course={course}
                        compact
                        fallbackSemesterId={currentSemesterId}
                      />
                      <AddToSemesterPlannerButton course={course} compact />
                    </div>
                  </div>
                </article>
              );
              })}
            </div>
          ) : null}

          {filteredCourses.length > 0 ? (
            <CoursePagination
              currentPage={currentPage}
              pageSize={COURSES_PER_PAGE}
              totalItems={filteredCourses.length}
              totalPages={totalPages}
              onPageChange={(page) => {
                shouldJumpToPageTopRef.current = true;
                setCurrentPage(page);
              }}
            />
          ) : null}
        </section>

        <aside className="hidden border-l border-[var(--brand-divider)] pl-2.5 md:sticky md:top-[90px] md:mt-0 md:block md:max-h-[calc(100dvh-150px)] md:self-start md:overflow-x-hidden md:overflow-y-auto md:overscroll-contain md:pr-1">
          {renderFilterSettings()}
        </aside>
      </div>

      {filtersOpen ? (
        <button
          type="button"
          aria-label="Close search filters"
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setFiltersOpen(false)}
        />
      ) : null}

      <div
        id="course-filter-drawer"
        aria-hidden={!filtersOpen}
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[min(78dvh,42rem)] overflow-hidden border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-2xl transition-transform duration-200 ease-out md:hidden ${
          filtersOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="max-h-[min(78dvh,42rem)] overflow-x-hidden overflow-y-auto px-4 pb-24 pt-4">
          {filtersOpen ? renderFilterSettings() : null}
        </div>
      </div>

      <button
        type="button"
        aria-controls="course-filter-drawer"
        aria-expanded={filtersOpen}
        aria-label={filtersOpen ? "Close search filters" : "Open search filters"}
        onClick={() => setFiltersOpen((open) => !open)}
        className={`fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full border shadow-[var(--shadow-elev-3)] transition-[background-color,border-color,color,transform] hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-ring-soft)] md:hidden ${
          filtersOpen
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
            : "border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)]"
        }`}
      >
        {filtersOpen ? <XIcon className="h-7 w-7" /> : <FilterIcon className="h-7 w-7" />}
      </button>
    </div>
  );
}

function CoursePagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
})
{
  const pages = buildPaginationPages(currentPage, totalPages);
  const pageOptions = Array.from({ length: totalPages }, (_, index) => index + 1);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  function goToPage(page: number)
  {
    const nextPage = Math.max(1, Math.min(page, totalPages));
    if (nextPage !== currentPage)
    {
      onPageChange(nextPage);
    }
  }

  return (
    <nav
      aria-label="Courses pagination"
      className="px-0.5 pt-2 text-[12px] leading-4 text-[var(--on-surface-variant)] md:px-4"
    >
      <div className="flex items-center gap-3 md:hidden">
        <div className="min-w-0 font-medium">
          Showing {startItem}-{endItem} of {totalItems}
        </div>

        {totalPages > 1 ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {currentPage > 1 ? (
              <button
                type="button"
                aria-label="First page"
                onClick={() => goToPage(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <ChevronsLeftIcon className="h-4 w-4" />
              </button>
            ) : null}

            {currentPage > 1 ? (
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => goToPage(currentPage - 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            ) : null}

            <label className="relative inline-flex shrink-0">
              <span className="sr-only">Select page</span>
              <select
                aria-label="Select page"
                value={currentPage}
                onChange={(event) => goToPage(Number(event.target.value))}
                className="course-pagination-active h-8 w-[6rem] appearance-none rounded-[0.35rem] border px-2 pr-6 text-center [text-align-last:center] text-[12px] font-semibold leading-4 outline-none md:w-[4.75rem] md:text-[12px]"
              >
                {pageOptions.map((page) => (
                  <option key={page} value={page}>
                    Page {page}
                  </option>
                ))}
              </select>
              <ChevronRightIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-[var(--on-primary)]" />
            </label>

            {currentPage < totalPages ? (
              <button
                type="button"
                aria-label="Next page"
                onClick={() => goToPage(currentPage + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            ) : null}

            {currentPage < totalPages ? (
              <button
                type="button"
                aria-label="Last page"
                onClick={() => goToPage(totalPages)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <ChevronsRightIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="hidden md:flex md:items-center md:gap-3">
        <div className="font-medium">
          Showing {startItem}-{endItem} of {totalItems}
        </div>

        {totalPages > 1 ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {currentPage > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="First page"
                  onClick={() => goToPage(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <ChevronsLeftIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() => goToPage(currentPage - 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
              </>
            ) : null}

            {pages.map((page) => (
              <button
                key={page}
                type="button"
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? "page" : undefined}
                onClick={() => goToPage(page)}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-[0.35rem] border px-2 text-[12px] font-semibold leading-4 transition-colors ${
                  page === currentPage
                    ? "course-pagination-active"
                    : "border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                }`}
              >
                {page}
              </button>
            ))}

            {currentPage < totalPages ? (
              <>
                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() => goToPage(currentPage + 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  aria-label="Last page"
                  onClick={() => goToPage(totalPages)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.35rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <ChevronsRightIcon className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function FilterGroup({
  title,
  action,
  contentClassName,
  children,
}: {
  title: string;
  action?: ReactNode;
  contentClassName?: string;
  children?: ReactNode;
})
{
  return (
    <section className="py-2">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{title}</h3>
        {action}
      </div>
      {children ? <div className={contentClassName ?? "space-y-px"}>{children}</div> : null}
    </section>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
})
{
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-1.5 rounded-[0.5rem] px-1.5 py-0.5 transition-colors hover:bg-[var(--brand-chip-bg)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-[1px] h-3.5 w-3.5 shrink-0 rounded border border-[var(--outline-variant)] accent-[var(--primary)]"
      />
      <span className="min-w-0 break-words text-[12px] leading-4 text-[var(--on-surface)]">{label}</span>
    </label>
  );
}
