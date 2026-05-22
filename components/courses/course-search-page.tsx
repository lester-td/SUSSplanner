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

const SYNOPSIS_WORD_LIMIT = 100;

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
    filters.ecaOnly,
    filters.postgraduateOnly,
    filters.scheduleTypes.join("|"),
    filters.schoolNames.join("|"),
    filters.semesterIds.join("|"),
    filters.writtenExamOnly,
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
      writtenExamOnly: false,
      ecaOnly: false,
      schoolNames: [],
      courseLevels: [],
    }));
  }

  return (
    <div className="px-3 pb-3 pt-8 md:px-[16px]">
      <div className="mx-auto grid max-w-7xl gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="space-y-2.5 lg:pr-4">
          <div className="pb-3">
            <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[var(--on-surface)]">Course Search</h1>
              </div>
              <div className="text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                {loading ? "Searching..." : `${results.length} matches`}
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

          {deferredQuery.trim() && results.length === 0 && !loading ? (
            <div className="elev-1 rounded-[0.9rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-6 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              No courses matched the current query and checkbox filters.
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-divider)] border-y border-[var(--brand-divider)]">
              {results.map((course) => {
                const semesterIndicators = buildSemesterIndicators(course);

                return (
                <article key={course.courseCode} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <h2 className="min-w-0 flex-1 text-[18px] font-bold leading-7 tracking-[-0.02em]">
                      <Link
                        href={`/courses/${course.courseCode}`}
                        className="inline items-baseline break-normal text-[var(--on-surface)] underline decoration-transparent underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-[var(--primary)] hover:decoration-current focus-visible:rounded-[0.2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      >
                        <span>{renderHighlightedText(course.courseCode, filters.q, course.courseCode)}</span>{" "}
                        <span>{renderHighlightedText(course.courseName, filters.q, "Untitled course")}</span>
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
        </section>

        <aside className="mt-2 border-l border-[var(--brand-divider)] pl-2.5 lg:mt-0 lg:sticky lg:top-[90px] lg:self-start">
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

              <FilterGroup title="Level of Course" contentClassName="grid grid-cols-3 gap-y-px">
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

              <section className="space-y-px py-2">
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
              </section>

              <FilterGroup title="Assessments">
                <CheckboxRow
                  label="Written exam"
                  checked={filters.writtenExamOnly}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    writtenExamOnly: !current.writtenExamOnly,
                  }))}
                />
                <CheckboxRow
                  label="ECA"
                  checked={filters.ecaOnly}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    ecaOnly: !current.ecaOnly,
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
