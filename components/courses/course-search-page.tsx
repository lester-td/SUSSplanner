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
  schools,
  courseLevels,
  initialFilters,
}: {
  semesters: SemesterRecord[];
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
  const shouldJumpToPageTopRef = useRef(false);
  const levelOptions = useMemo(() => buildLevelOptions(courseLevels), [courseLevels]);
  const filteredCourses = useMemo(() => filterCourses(allCourses, filters), [allCourses, filters]);

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
        <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-divider)] pb-2">
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
                label={`${semester.semesterName} (${semester.academicYear})`}
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
            {schools.map((school) => (
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
    <div className="px-3 pb-24 pt-8 md:px-[16px] lg:pb-3">
      <div className="mx-auto grid max-w-7xl gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="space-y-2.5 lg:pr-4">
          <div className="pb-3">
            <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[var(--on-surface)]">Course Search</h1>
              </div>
              <div className="text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                {loading ? "Loading courses..." : `${filteredCourses.length} courses found`}
              </div>
            </div>

            <label className="relative mt-4 block">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Search by course code, course title, or descriptions"
                className="elev-1 w-full rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-3 pl-12 pr-4 text-[15px] leading-6 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
          </div>

          {hasActiveCourseFilters(filters) && filteredCourses.length === 0 && !loading ? (
            <div className="elev-1 rounded-[0.9rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-6 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              No courses matched the current query and checkbox filters.
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-divider)] border-y border-[var(--brand-divider)]">
              {pageResults.map((course) => {
                const semesterIndicators = buildSemesterIndicators(course);

                return (
                <article key={course.courseCode} className="relative px-4 py-3">
                  <div className="pr-28 sm:pr-32">
                    <h2 className="min-w-0 flex-1 text-[18px] font-bold leading-7 tracking-[-0.02em]">
                      <Link
                        href={`/courses/${course.courseCode}`}
                        className="inline items-baseline break-normal text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      >
                        <span>{renderHighlightedText(course.courseCode, filters.q, course.courseCode)}</span>{" "}
                        <span>{renderHighlightedText(course.courseName, filters.q, "Untitled course")}</span>
                      </Link>
                    </h2>
                  </div>

                  <div className="absolute right-4 top-3">
                    <AddToSemesterPlannerButton course={course} compact />
                  </div>

                  <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {semesterIndicators.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarIcon className="h-4 w-4 shrink-0" />
                          <span>{semesterIndicators.join(" \u00b7 ")}</span>
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1.5">
                        <SchoolIcon className="h-4 w-4 shrink-0" />
                        {renderHighlightedText(course.schoolName, filters.q, "School unavailable")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BookIcon className="h-4 w-4 shrink-0" />
                        {course.creditUnits?.toFixed(1) ?? "0.0"} CU
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ListIcon className="h-4 w-4 shrink-0" />
                        {formatCourseLevel(course.courseLevel)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <LayersIcon className="h-4 w-4 shrink-0" />
                        {course.isPostgraduate ? "Postgraduate" : "Undergraduate"}
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
                </article>
              );
              })}
            </div>
          )}

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

        <aside className="hidden border-l border-[var(--brand-divider)] pl-2.5 lg:sticky lg:top-[90px] lg:mt-0 lg:block lg:max-h-[calc(100dvh-110px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          {renderFilterSettings()}
        </aside>
      </div>

      {filtersOpen ? (
        <button
          type="button"
          aria-label="Close search filters"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setFiltersOpen(false)}
        />
      ) : null}

      <div
        id="course-filter-drawer"
        aria-hidden={!filtersOpen}
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[min(78dvh,42rem)] overflow-hidden border-t border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-2xl transition-transform duration-200 ease-out lg:hidden ${
          filtersOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <div className="max-h-[min(78dvh,42rem)] overflow-y-auto px-4 pb-24 pt-4">
          {filtersOpen ? renderFilterSettings() : null}
        </div>
      </div>

      <button
        type="button"
        aria-controls="course-filter-drawer"
        aria-expanded={filtersOpen}
        aria-label={filtersOpen ? "Close search filters" : "Open search filters"}
        onClick={() => setFiltersOpen((open) => !open)}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_30px_rgb(0_0_0/0.22)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-ring-soft)] lg:hidden"
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
      className="grid gap-2 pt-2 text-[12px] leading-4 text-[var(--on-surface-variant)] sm:grid-cols-[1fr_auto_1fr] sm:items-center"
    >
      <div className="font-medium sm:justify-self-start">
        Showing {startItem}-{endItem} of {totalItems}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-1 sm:justify-self-center">
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
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
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

      <div aria-hidden="true" className="hidden sm:block" />
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
    <label className="flex cursor-pointer items-start gap-1.5 rounded-[0.5rem] px-1.5 py-0.5 transition-colors hover:bg-[var(--brand-chip-bg)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-[1px] h-3.5 w-3.5 rounded border border-[var(--outline-variant)] accent-[var(--primary)]"
      />
      <span className="text-[12px] leading-4 text-[var(--on-surface)]">{label}</span>
    </label>
  );
}
