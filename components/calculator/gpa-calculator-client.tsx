"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "@/components/planner/icons";

type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D+" | "D" | "F";

type CalculatorModule = {
  courseCode: string;
  courseName: string;
  creditUnits: number;
  grade: Grade;
  gradePoint: number;
};

type SearchResponse = {
  courses: CalculatorCourseSearchResult[];
};

type CalculatorCourseSearchResult = {
  courseCode: string;
  courseName: string | null;
  creditUnits: number | null;
};

const STORAGE_KEY = "sussplanner:gpa-calculator";

const GRADE_OPTIONS: Array<{ grade: Grade; point: number }> = [
  { grade: "A+", point: 5 },
  { grade: "A", point: 5 },
  { grade: "A-", point: 4.5 },
  { grade: "B+", point: 4 },
  { grade: "B", point: 3.5 },
  { grade: "B-", point: 3 },
  { grade: "C+", point: 2.5 },
  { grade: "C", point: 2 },
  { grade: "D+", point: 1.5 },
  { grade: "D", point: 1 },
  { grade: "F", point: 0 },
];

const POINT_OPTIONS = [...new Set(GRADE_OPTIONS.map((option) => option.point))];

const DEFAULT_GRADE: Grade = "A";
const DEFAULT_GRADE_POINT = 5;

function gradeToPoint(grade: Grade)
{
  return GRADE_OPTIONS.find((option) => option.grade === grade)?.point ?? 0;
}

function pointToGrade(point: number): Grade
{
  return GRADE_OPTIONS.find((option) => option.point === point)?.grade === "A+"
    ? "A"
    : GRADE_OPTIONS.find((option) => option.point === point)?.grade ?? "F";
}

function clampNumber(value: number, minimum: number, maximum: number)
{
  if (!Number.isFinite(value))
  {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function formatGpa(value: number | null)
{
  return value === null ? "—" : value.toFixed(2);
}

function calculateWeightedGpa(modules: CalculatorModule[])
{
  const totalCredits = modules.reduce((total, module) => total + module.creditUnits, 0);
  if (totalCredits <= 0)
  {
    return null;
  }

  const totalPoints = modules.reduce(
    (total, module) => total + module.creditUnits * module.gradePoint,
    0,
  );
  return totalPoints / totalCredits;
}

function useDebouncedValue(value: string, delayMs: number)
{
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function GpaCalculatorClient()
{
  const [modules, setModules] = useState<CalculatorModule[]>([]);
  const [priorGpa, setPriorGpa] = useState(0);
  const [priorCredits, setPriorCredits] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalculatorCourseSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 250);

  useEffect(() => {
    try
    {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored)
      {
        const parsed = JSON.parse(stored) as {
          modules?: CalculatorModule[];
          priorGpa?: number;
          priorCredits?: number;
        };
        setModules(Array.isArray(parsed.modules) ? parsed.modules : []);
        setPriorGpa(clampNumber(Number(parsed.priorGpa), 0, 5));
        setPriorCredits(Math.max(0, Number(parsed.priorCredits) || 0));
      }
    }
    catch
    {
      // Ignore stale or malformed local data and start with a clean calculator.
    }
    finally
    {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      modules,
      priorGpa,
      priorCredits,
    }));
  }, [modules, priorCredits, priorGpa, ready]);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (!query)
    {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    fetch(`/api/calculator/courses?q=${encodeURIComponent(query)}`, {
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
        if ((error as { name?: string }).name !== "AbortError")
        {
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
  }, [debouncedQuery]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent)
    {
      if (!searchContainerRef.current?.contains(event.target as Node))
      {
        setSearchResults([]);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const currentCredits = useMemo(
    () => modules.reduce((total, module) => total + module.creditUnits, 0),
    [modules],
  );
  const currentGpa = useMemo(() => calculateWeightedGpa(modules), [modules]);
  const cumulativeGpa = useMemo(() => {
    const currentPoints = modules.reduce(
      (total, module) => total + module.creditUnits * module.gradePoint,
      0,
    );
    const totalCredits = priorCredits + currentCredits;

    return totalCredits > 0
      ? ((priorGpa * priorCredits) + currentPoints) / totalCredits
      : null;
  }, [currentCredits, modules, priorCredits, priorGpa]);

  function addModule(course: CalculatorCourseSearchResult)
  {
    if (modules.some((module) => module.courseCode === course.courseCode))
    {
      setSearchQuery("");
      setSearchResults([]);
      return;
    }

    setModules((current) => [
      ...current,
      {
        courseCode: course.courseCode,
        courseName: course.courseName ?? "Course name unavailable",
        creditUnits: course.creditUnits ?? 5,
        grade: DEFAULT_GRADE,
        gradePoint: DEFAULT_GRADE_POINT,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function updateModule(courseCode: string, update: Partial<CalculatorModule>)
  {
    setModules((current) => current.map((module) => (
      module.courseCode === courseCode ? { ...module, ...update } : module
    )));
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-8 pt-8 md:px-4">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-10 tracking-[-0.03em] text-[var(--on-surface)]">
            GPA Calculator
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[var(--on-surface-variant)]">
            Calculate your semester and cumulative GPA on the SUSS 5.0 grading scale.
          </p>
        </div>
        <p className="text-[12px] font-medium text-[var(--on-surface-variant)]">
          Saved automatically on this device
        </p>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <GpaSummaryCard
          label="Current GPA"
          value={formatGpa(currentGpa)}
          detail={`${currentCredits.toFixed(1)} CU this semester`}
          emphasized
        />
        <GpaSummaryCard
          label="Cumulative GPA"
          value={formatGpa(cumulativeGpa)}
          detail={`${(priorCredits + currentCredits).toFixed(1)} total CU`}
        />
        <GpaSummaryCard
          label="Modules"
          value={String(modules.length)}
          detail="Included this semester"
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <div ref={searchContainerRef} className="relative z-20 mb-4">
            <label htmlFor="calculator-course-search" className="mb-2 block text-[13px] font-bold text-[var(--on-surface)]">
              Add a module
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--on-surface-variant)]" />
              <input
                id="calculator-course-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by module code or name"
                autoComplete="off"
                className="elev-1 w-full rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-3 pl-12 pr-11 text-[15px] leading-6 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {searchQuery.trim() ? (
              <div className="elev-3 absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
                {searchLoading ? (
                  <p className="px-4 py-4 text-[13px] text-[var(--on-surface-variant)]">Searching modules...</p>
                ) : searchResults.length > 0 ? (
                  <ul className="max-h-80 overflow-y-auto py-1">
                    {searchResults.map((course) => {
                      const alreadyAdded = modules.some((module) => module.courseCode === course.courseCode);
                      return (
                        <li key={course.courseCode}>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => addModule(course)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-chip-bg)] text-[var(--primary)]">
                              <PlusIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-bold text-[var(--on-surface)]">{course.courseCode}</span>
                              <span className="block truncate text-[12px] text-[var(--on-surface-variant)]">
                                {course.courseName ?? "Course name unavailable"}
                              </span>
                            </span>
                            <span className="shrink-0 text-[12px] font-semibold text-[var(--on-surface-variant)]">
                              {alreadyAdded ? "Added" : `${course.creditUnits ?? 5} CU`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-4 text-[13px] text-[var(--on-surface-variant)]">No matching modules found.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] elev-1">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-4 py-3.5">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--on-surface)]">Current semester modules</h2>
                <p className="mt-0.5 text-[12px] text-[var(--on-surface-variant)]">Credit units determine each module&apos;s GPA weight.</p>
              </div>
              {modules.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setModules([])}
                  className="shrink-0 text-[12px] font-bold text-[var(--error)] hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {modules.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">No modules added yet</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  Search above to add modules and calculate your GPA.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--brand-divider)]">
                {modules.map((module) => (
                  <article key={module.courseCode} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem_2.5rem] md:items-end">
                    <div className="min-w-0">
                      <p className="text-[14px] font-extrabold text-[var(--primary)]">{module.courseCode}</p>
                      <p className="mt-0.5 truncate text-[13px] text-[var(--on-surface-variant)]">{module.courseName}</p>
                    </div>
                    <CalculatorField label="Credit Units">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={module.creditUnits}
                        onChange={(event) => updateModule(module.courseCode, {
                          creditUnits: Math.max(0, Number(event.target.value) || 0),
                        })}
                        className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                      />
                    </CalculatorField>
                    <CalculatorField label="Grade">
                      <select
                        value={module.grade}
                        onChange={(event) => {
                          const grade = event.target.value as Grade;
                          updateModule(module.courseCode, {
                            grade,
                            gradePoint: gradeToPoint(grade),
                          });
                        }}
                        className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                      >
                        {GRADE_OPTIONS.map((option) => (
                          <option key={option.grade} value={option.grade}>{option.grade}</option>
                        ))}
                      </select>
                    </CalculatorField>
                    <CalculatorField label="Grade Point Value">
                      <select
                        value={module.gradePoint}
                        onChange={(event) => {
                          const gradePoint = Number(event.target.value);
                          updateModule(module.courseCode, {
                            gradePoint,
                            grade: pointToGrade(gradePoint),
                          });
                        }}
                        className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                      >
                        {POINT_OPTIONS.map((point) => (
                          <option key={point} value={point}>{point.toFixed(1)}</option>
                        ))}
                      </select>
                    </CalculatorField>
                    <button
                      type="button"
                      aria-label={`Remove ${module.courseCode}`}
                      onClick={() => setModules((current) => current.filter((item) => item.courseCode !== module.courseCode))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--error-container)] hover:text-[var(--error)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 elev-1">
            <h2 className="text-[15px] font-bold text-[var(--on-surface)]">Prior academic record</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
              Add your record before this semester to calculate cumulative GPA.
            </p>
            <div className="mt-4 space-y-3">
              <CalculatorField label="Previous cumulative GPA">
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.01"
                  value={priorGpa}
                  onChange={(event) => setPriorGpa(clampNumber(Number(event.target.value), 0, 5))}
                  className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </CalculatorField>
              <CalculatorField label="Previously completed CUs">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={priorCredits}
                  onChange={(event) => setPriorCredits(Math.max(0, Number(event.target.value) || 0))}
                  className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </CalculatorField>
            </div>
          </section>

          <section className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
            <h2 className="text-[13px] font-bold text-[var(--on-surface)]">SUSS grade scale</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[12px]">
              {GRADE_OPTIONS.map((option) => (
                <div key={option.grade} className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--on-surface)]">{option.grade}</span>
                  <span className="text-[var(--on-surface-variant)]">{option.point.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function GpaSummaryCard({
  label,
  value,
  detail,
  emphasized = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasized?: boolean;
})
{
  return (
    <article className={`rounded-[0.9rem] border p-4 elev-1 ${
      emphasized
        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
        : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)]"
    }`}>
      <p className={`text-[12px] font-bold uppercase tracking-[0.06em] ${
        emphasized ? "text-white/75" : "text-[var(--on-surface-variant)]"
      }`}>
        {label}
      </p>
      <p className="mt-1 text-[32px] font-extrabold leading-10 tracking-[-0.04em]">{value}</p>
      <p className={`mt-1 text-[12px] ${emphasized ? "text-white/75" : "text-[var(--on-surface-variant)]"}`}>
        {detail}
      </p>
    </article>
  );
}

function CalculatorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
})
{
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--on-surface-variant)]">
        {label}
      </span>
      {children}
    </label>
  );
}
