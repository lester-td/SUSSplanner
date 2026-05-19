"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  BookIcon,
  LayersIcon,
  ListIcon,
  RefreshIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
} from "@/components/planner/icons";
import {
  buildCourseSearchParams,
  extractCourseLevelNumber,
  type CourseSearchFilters,
} from "@/lib/timetable/course-search";
import type { CourseSearchResult, SemesterRecord } from "@/lib/timetable/types";

type SearchResponse = {
  courses: CourseSearchResult[];
};

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
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const deferredQuery = useDeferredValue(filters.q);
  const levelOptions = useMemo(() => buildLevelOptions(courseLevels), [courseLevels]);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const requestQuery = useMemo(() => buildCourseSearchParams({
    ...filters,
    q: deferredQuery,
    limit: 40,
  }).toString(), [
    deferredQuery,
    filters.availableAsGspOnly,
    filters.courseLevels.join("|"),
    filters.postgraduateOnly,
    filters.scheduleTypes.join("|"),
    filters.schoolNames.join("|"),
    filters.semesterIds.join("|"),
  ]);

  useEffect(() => {
    if (!deferredQuery.trim())
    {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/courses/search?${requestQuery}`, {
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
      .then((payload) => setResults(payload.courses))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError")
        {
          return;
        }
        setResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted)
        {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [deferredQuery, requestQuery]);

  function resetCheckboxFilters()
  {
    setFilters((current) => ({
      ...current,
      semesterIds: [],
      scheduleTypes: [],
      postgraduateOnly: false,
      availableAsGspOnly: false,
      schoolNames: [],
      courseLevels: [],
    }));
  }

  return (
    <div className="px-4 py-6 md:px-[16px]">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="space-y-4">
          <div className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[var(--on-surface)]">Course Search</h1>
              </div>
              <div className="text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                {loading ? "Searching..." : `${results.length} matches`}
              </div>
            </div>

            <label className="relative mt-5 block">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Search by course code, course title, or school"
                className="w-full rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-3 pl-12 pr-4 text-[15px] leading-6 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>
          </div>

          {!deferredQuery.trim() ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[0.9rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-8 text-center text-[var(--on-surface-variant)]">
              <BookIcon className="mb-3 h-8 w-8" />
              <p className="text-[16px] font-semibold leading-6 text-[var(--on-surface)]">Start typing to search courses</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="rounded-[0.9rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-8 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              No courses matched the current query and checkbox filters.
            </div>
          ) : (
            <div className="divide-y divide-[color:rgb(6_55_100_/_0.12)] rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
              {results.map((course) => {
                const semesterIndicators = buildSemesterIndicators(course);

                return (
                <article key={course.courseCode} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 text-[18px] font-bold leading-7 tracking-[-0.02em]">
                      <Link
                        href={`/courses/${course.courseCode}`}
                        className="inline items-baseline break-normal text-[var(--primary)] transition-colors hover:text-[var(--on-surface)]"
                      >
                        <span className="mr-2">{renderHighlightedText(course.courseCode, filters.q, course.courseCode)}</span>
                        <span className="text-[var(--on-surface)]">
                          {renderHighlightedText(course.courseName, filters.q, "Untitled course")}
                        </span>
                      </Link>
                    </h2>
                    {semesterIndicators.length > 0 ? (
                      <span className="shrink-0 text-right text-[13px] font-semibold leading-6 text-[var(--on-surface-variant)]">
                        {semesterIndicators.join(" \u2022 ")}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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

                  <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                    {renderHighlightedText(course.courseSynopsis, filters.q, "No synopsis available.")}
                  </p>
                </article>
              );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-[color:rgb(6_55_100_/_0.12)] lg:pl-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-[var(--primary)]" />
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Search Settings</h2>
              </div>
              <button
                type="button"
                onClick={resetCheckboxFilters}
                className="inline-flex items-center gap-1 rounded-[0.4rem] border border-[var(--outline-variant)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                Reset all
              </button>
            </div>

            <div className="space-y-3">
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

              <FilterGroup title="Level of Course">
                {levelOptions.map((levelOption) => (
                  <CheckboxRow
                    key={levelOption.value}
                    label={levelOption.label}
                    checked={filters.courseLevels.includes(levelOption.value)}
                    onChange={() => setFilters((current) => ({
                      ...current,
                      courseLevels: toggleInList(current.courseLevels, levelOption.value),
                    }))}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Postgraduate Courses">
                <CheckboxRow
                  label="Postgraduate courses only"
                  checked={filters.postgraduateOnly}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    postgraduateOnly: !current.postgraduateOnly,
                  }))}
                />
              </FilterGroup>

              <FilterGroup title="Available as GSP/UNE">
                <CheckboxRow
                  label="Available as GSP/UNE only"
                  checked={filters.availableAsGspOnly}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    availableAsGspOnly: !current.availableAsGspOnly,
                  }))}
                />
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
        </aside>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
})
{
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{title}</h3>
        {action}
      </div>
      {children ? <div className="space-y-0.5">{children}</div> : null}
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
    <label className="flex cursor-pointer items-start gap-2 rounded-[0.6rem] px-1.5 py-1 transition-colors hover:bg-[var(--surface-container-low)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-[1px] h-4 w-4 rounded border border-[var(--outline-variant)] accent-[var(--primary)]"
      />
      <span className="text-[13px] leading-4 text-[var(--on-surface)]">{label}</span>
    </label>
  );
}
