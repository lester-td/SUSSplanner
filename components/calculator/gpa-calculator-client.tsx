"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  BookIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XIcon,
} from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";

type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D+" | "D" | "F";

type CalculatorModule = {
  courseCode: string;
  courseName: string;
  creditUnits: number;
  creditUnitsEditable: boolean;
  grade: Grade;
  gradePoint: number;
  isPassFail: boolean;
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

function priorNumberToInputValue(value: number, maximum?: number)
{
  const parsedValue = maximum === undefined
    ? Math.max(0, Number(value) || 0)
    : clampNumber(Number(value), 0, maximum);

  return parsedValue > 0 ? String(parsedValue) : "";
}

function priorInputToNumber(value: string, maximum?: number)
{
  if (value.trim() === "")
  {
    return 0;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue))
  {
    return 0;
  }

  return maximum === undefined
    ? Math.max(0, parsedValue)
    : clampNumber(parsedValue, 0, maximum);
}

function nextPriorGpaInputValue(value: string)
{
  if (value.trim() === "")
  {
    return "";
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue))
  {
    return value;
  }

  return parsedValue > 5 ? "5" : value;
}

function capInputToMaximum(value: string, maximum: number)
{
  if (value.trim() === "")
  {
    return "";
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue))
  {
    return value;
  }

  return parsedValue > maximum ? String(maximum) : value;
}

function formatGpa(value: number | null)
{
  return value === null ? "—" : value.toFixed(2);
}

function formatCreditUnits(value: number | null)
{
  return value === null ? "CU unavailable" : `${value.toFixed(1)} CU`;
}

function calculateWeightedGpa(modules: CalculatorModule[])
{
  const gradedModules = modules.filter((module) => !module.isPassFail);
  const totalCredits = gradedModules.reduce((total, module) => total + module.creditUnits, 0);
  if (totalCredits <= 0)
  {
    return null;
  }

  const totalPoints = gradedModules.reduce(
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
  const [priorGpaInput, setPriorGpaInput] = useState("");
  const [priorCreditsInput, setPriorCreditsInput] = useState("");
  const [priorPassFailCreditsInput, setPriorPassFailCreditsInput] = useState("");
  const [isCustomModule, setIsCustomModule] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalculatorCourseSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customModuleLabel, setCustomModuleLabel] = useState("");
  const [customModuleCredits, setCustomModuleCredits] = useState("");
  const [customModuleNotice, setCustomModuleNotice] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  const priorGpa = useMemo(() => priorInputToNumber(priorGpaInput, 5), [priorGpaInput]);
  const priorCredits = useMemo(() => priorInputToNumber(priorCreditsInput), [priorCreditsInput]);
  const priorPassFailCredits = useMemo(
    () => Math.min(priorInputToNumber(priorPassFailCreditsInput), priorCredits),
    [priorCredits, priorPassFailCreditsInput],
  );
  const priorGpaCredits = Math.max(0, priorCredits - priorPassFailCredits);

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
          priorPassFailCredits?: number;
        };
        setModules(Array.isArray(parsed.modules) ? parsed.modules : []);
        setPriorGpaInput(priorNumberToInputValue(Number(parsed.priorGpa), 5));
        setPriorCreditsInput(priorNumberToInputValue(Number(parsed.priorCredits)));
        setPriorPassFailCreditsInput(priorNumberToInputValue(Number(parsed.priorPassFailCredits)));
      }
    }
    catch
    {
      // Ignore malformed local data and start with a clean calculator.
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
      priorPassFailCredits,
    }));
  }, [modules, priorCredits, priorGpa, priorPassFailCredits, ready]);

  useEffect(() => {
    setPriorPassFailCreditsInput((currentValue) => capInputToMaximum(currentValue, priorCredits));
  }, [priorCredits]);

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
  const currentGpaCredits = useMemo(
    () => modules.reduce(
      (total, module) => total + (module.isPassFail ? 0 : module.creditUnits),
      0,
    ),
    [modules],
  );
  const currentGpa = useMemo(() => calculateWeightedGpa(modules), [modules]);
  const cumulativeGpa = useMemo(() => {
    const currentPoints = modules.reduce(
      (total, module) => total + (module.isPassFail ? 0 : module.creditUnits * module.gradePoint),
      0,
    );
    const totalGpaCredits = priorGpaCredits + currentGpaCredits;

    return totalGpaCredits > 0
      ? ((priorGpa * priorGpaCredits) + currentPoints) / totalGpaCredits
      : null;
  }, [currentGpaCredits, modules, priorGpa, priorGpaCredits]);
  const totalCompletedCredits = priorCredits + currentCredits;
  const totalGpaCredits = priorGpaCredits + currentGpaCredits;

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
        creditUnits: course.creditUnits ?? 0,
        creditUnitsEditable: course.creditUnits === null,
        grade: DEFAULT_GRADE,
        gradePoint: DEFAULT_GRADE_POINT,
        isPassFail: false,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function addCustomModule()
  {
    const label = customModuleLabel.trim();
    const creditUnits = customModuleCredits.trim() === ""
      ? 0
      : Number.parseFloat(customModuleCredits);
    const courseCode = label.toUpperCase();

    if (!label)
    {
      setCustomModuleNotice("Enter a module code or module name.");
      return;
    }

    if (!Number.isFinite(creditUnits) || creditUnits < 0)
    {
      setCustomModuleNotice("Credit units must be 0 or more.");
      return;
    }

    if (modules.some((module) => module.courseCode.toUpperCase() === courseCode))
    {
      setCustomModuleNotice(`${courseCode} has already been added.`);
      return;
    }

    setModules((current) => [
      ...current,
      {
        courseCode,
        courseName: label,
        creditUnits,
        creditUnitsEditable: true,
        grade: DEFAULT_GRADE,
        gradePoint: DEFAULT_GRADE_POINT,
        isPassFail: false,
      },
    ]);
    setCustomModuleLabel("");
    setCustomModuleCredits("");
    setCustomModuleNotice("");
  }

  function updateModule(courseCode: string, update: Partial<CalculatorModule>)
  {
    setModules((current) => current.map((module) => (
      module.courseCode === courseCode ? { ...module, ...update } : module
    )));
  }

  return (
    <div className="calculator-page calculator-section calculator-section--gpa w-full pb-6">
      <section className="mb-2 md:mb-3">
        <div className="grid gap-1.5 md:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            <StatItem label="Semester GPA" value={formatGpa(currentGpa)} tone="semester" compact />
            <StatItem label="Courses" value={String(modules.length)} tone="semester" compact />
            <StatItem label="Credit Units" value={currentCredits.toFixed(1)} tone="semester" compact />
            <StatItem label="GPA Credits" value={currentGpaCredits.toFixed(1)} tone="semester" compact />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatItem label="Cumulative GPA" value={formatGpa(cumulativeGpa)} tone="all-time" compact />
            <StatItem label="Total GPA Credits" value={totalGpaCredits.toFixed(1)} tone="all-time" compact />
            <StatItem label="Total Credit Units" value={totalCompletedCredits.toFixed(1)} tone="all-time" compact />
          </div>
        </div>
        <div className="hidden md:grid md:grid-cols-[repeat(4,minmax(0,1fr))_1px_repeat(3,minmax(0,1fr))] md:items-stretch md:gap-3">
          <StatItem label="Semester GPA" value={formatGpa(currentGpa)} tone="semester" />
          <StatItem label="Courses" value={String(modules.length)} tone="semester" />
          <StatItem label="Credit Units" value={currentCredits.toFixed(1)} tone="semester" />
          <StatItem label="GPA Credits" value={currentGpaCredits.toFixed(1)} tone="semester" />
          <div className="hidden self-stretch justify-self-center bg-[var(--outline-variant)] md:block md:w-px" aria-hidden="true" />
          <StatItem label="Cumulative GPA" value={formatGpa(cumulativeGpa)} tone="all-time" />
          <StatItem label="Total GPA Credits" value={totalGpaCredits.toFixed(1)} tone="all-time" />
          <StatItem label="Total Credit Units" value={totalCompletedCredits.toFixed(1)} tone="all-time" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0">
          <div ref={searchContainerRef} className="relative z-20 mb-3">
            <div className="calculator-panel calculator-major-panel rounded-[0.75rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-3 py-2.5 sm:py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isCustomModule ? (
                    <BookIcon className="h-5 w-5 text-[var(--primary)]" />
                  ) : (
                    <SearchIcon className="h-5 w-5 text-[var(--primary)]" />
                  )}
                  <h2 className="text-[16px] font-bold leading-6 text-[var(--on-surface)]">
                    Add courses
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModule((current) => !current);
                    setSearchQuery("");
                    setSearchResults([]);
                    setCustomModuleNotice("");
                  }}
                  className="calculator-segmented-control relative inline-grid h-[34px] grid-cols-2 self-start overflow-hidden rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-[2px]"
                  aria-pressed={isCustomModule}
                  aria-label={`Add module mode: ${isCustomModule ? "Custom" : "Search"}. Click to toggle.`}
                >
                  <span
                    aria-hidden="true"
                    className={`calculator-segmented-control__thumb absolute bottom-[2px] left-[2px] top-[2px] w-[calc(50%-2px)] rounded-[0.3rem] bg-[var(--primary)] shadow-sm transition-transform duration-300 ease-out ${isCustomModule ? "translate-x-full" : "translate-x-0"}`}
                  />
                  <span
                    aria-hidden="true"
                    className={`calculator-segmented-label relative z-10 flex min-w-[4.25rem] items-center justify-center rounded-[0.3rem] px-2.5 py-2 text-[12px] font-semibold leading-4 transition-colors duration-300 ${!isCustomModule ? "calculator-segmented-label--active text-on-primary" : "text-[var(--on-surface-variant)]"}`}
                  >
                    Search
                  </span>
                  <span
                    aria-hidden="true"
                    className={`calculator-segmented-label relative z-10 flex min-w-[4.25rem] items-center justify-center rounded-[0.3rem] px-2.5 py-2 text-[12px] font-semibold leading-4 transition-colors duration-300 ${isCustomModule ? "calculator-segmented-label--active text-on-primary" : "text-[var(--on-surface-variant)]"}`}
                  >
                    Custom
                  </span>
                </button>
              </div>

              {isCustomModule ? (
                <form
                  className="relative mt-3 h-[40px]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addCustomModule();
                  }}
                >
                  <div className="grid h-full grid-cols-[minmax(0,1fr)_7rem_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:gap-3">
                    <input
                      type="text"
                      value={customModuleLabel}
                      onChange={(event) => {
                        setCustomModuleLabel(event.target.value);
                        setCustomModuleNotice("");
                      }}
                      placeholder="Module code or name"
                      className="h-full min-w-0 rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={customModuleCredits}
                      onChange={(event) => {
                        setCustomModuleCredits(event.target.value);
                        setCustomModuleNotice("");
                      }}
                      placeholder="Credit units"
                      className="h-full min-w-0 rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2 py-2 text-[13px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:px-3"
                    />
                    <button
                      type="submit"
                      className="calculator-primary-action inline-flex h-full items-center justify-center gap-2 rounded-[0.6rem] bg-[var(--primary)] px-3 py-2 text-[13px] font-semibold leading-5 text-on-primary transition-colors hover:bg-[var(--primary-container)] sm:px-4"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Add Module</span>
                    </button>
                  </div>
                  {customModuleNotice ? (
                    <p className="absolute mt-1 text-[12px] font-semibold text-[var(--error)]">{customModuleNotice}</p>
                  ) : null}
                </form>
              ) : (
                <div className="relative mt-3 h-[40px]">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                  <input
                    id="calculator-course-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by module code or title..."
                    autoComplete="off"
                    className="h-full w-full rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-2.5 pl-10 pr-11 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  ) : null}

                  {searchQuery.trim() ? (
                    <div className="elev-3 absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
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
                                    {alreadyAdded ? "Added" : formatCreditUnits(course.creditUnits)}
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
              )}
            </div>
          </div>

          <div className="calculator-panel calculator-major-panel overflow-hidden rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-3 py-3 sm:px-4 sm:py-3.5">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--on-surface)]">Selected Courses</h2>
              </div>
              {modules.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="shrink-0 text-[12px] font-bold text-[var(--error)] hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {modules.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">No modules added yet</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  Search above to add modules and calculate your GPA.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--brand-divider)]">
                  {modules.map((module) => (
                    <div key={module.courseCode}>
                      <article className={`grid gap-2 px-2.5 py-2 md:hidden ${
                        module.isPassFail ? "bg-[var(--surface-container-low)]" : "bg-[var(--surface-container-lowest)]"
                      }`}>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[14px] font-extrabold text-[var(--primary)]">{module.courseCode}</p>
                            <p className="mt-0.5 truncate text-[13px] text-[var(--on-surface-variant)]">{module.courseName}</p>
                          </div>
                          <span className="shrink-0 text-[13px] font-semibold text-[var(--on-surface-variant)]">
                            {formatCreditUnits(module.creditUnits)}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <label
                            aria-label={`${module.courseCode} pass/fail`}
                            className={`inline-flex w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 text-center text-[9px] font-bold uppercase leading-none tracking-normal transition-colors ${
                            module.isPassFail
                              ? "text-[var(--primary)]"
                              : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
                          }`}
                          >
                            <input
                              type="checkbox"
                              checked={module.isPassFail}
                              onChange={(event) => updateModule(module.courseCode, {
                                isPassFail: event.target.checked,
                              })}
                              className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                            />
                            P/F
                          </label>
                          <div className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-1.5">
                            <select
                              value={module.grade}
                              disabled={module.isPassFail}
                              aria-label={`${module.courseCode} grade`}
                              onChange={(event) => {
                                const grade = event.target.value as Grade;
                                updateModule(module.courseCode, {
                                  grade,
                                  gradePoint: gradeToPoint(grade),
                                });
                              }}
                              className="h-full w-full border-0 bg-transparent px-0 py-0 text-center text-[13px] font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {GRADE_OPTIONS.map((option) => (
                                <option key={option.grade} value={option.grade}>{option.grade}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-1.5">
                            <select
                              value={module.gradePoint}
                              disabled={module.isPassFail}
                              aria-label={`${module.courseCode} grade point value`}
                              onChange={(event) => {
                                const gradePoint = Number(event.target.value);
                                updateModule(module.courseCode, {
                                  gradePoint,
                                  grade: pointToGrade(gradePoint),
                                });
                              }}
                              className="h-full w-full border-0 bg-transparent px-0 py-0 text-center text-[13px] font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {POINT_OPTIONS.map((point) => (
                                <option key={point} value={point}>{point.toFixed(1)}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${module.courseCode}`}
                            onClick={() => setModules((current) => current.filter((item) => item.courseCode !== module.courseCode))}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--outline-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--error-container)] hover:text-[var(--error)] md:border-0"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </article>

                      <div className="hidden grid-cols-[4.25rem_minmax(0,1fr)] items-stretch md:grid sm:grid-cols-[4.75rem_minmax(0,1fr)]">
                        <div className={`flex items-center justify-center border-r border-[var(--brand-divider)] px-1.5 py-1.5 transition-colors sm:px-2 sm:py-2 ${
                          module.isPassFail ? "bg-[var(--surface-container-low)]" : ""
                        }`}>
                          <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 text-center text-[10px] font-bold uppercase tracking-[0.04em] transition-colors ${
                            module.isPassFail
                              ? "text-[var(--primary)]"
                              : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"
                          }`}>
                            <input
                              type="checkbox"
                              checked={module.isPassFail}
                              onChange={(event) => updateModule(module.courseCode, {
                                isPassFail: event.target.checked,
                              })}
                              className="h-4 w-4 accent-[var(--primary)]"
                            />
                            Pass/Fail
                          </label>
                        </div>
                        <article
                          className={`grid min-w-0 gap-2 px-2.5 py-2 transition-colors md:grid-cols-[minmax(0,1fr)_5.5rem_5.25rem_5.25rem_2.5rem] md:items-center ${
                            module.isPassFail ? "bg-[var(--surface-container-low)]" : "bg-[var(--surface-container-lowest)]"
                          }`}
                        >
                          <div className="min-w-0 self-center">
                            <p className="text-[14px] font-extrabold text-[var(--primary)]">{module.courseCode}</p>
                            <p className="mt-0.5 truncate text-[13px] text-[var(--on-surface-variant)]">{module.courseName}</p>
                          </div>
                          <CompactCalculatorField label="Credits">
                            {module.creditUnitsEditable ? (
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={module.creditUnits}
                                onChange={(event) => updateModule(module.courseCode, {
                                  creditUnits: Math.max(0, Number(event.target.value) || 0),
                                })}
                                className="h-9 w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-center text-[13px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                              />
                            ) : (
                              <div className="flex h-9 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 text-center text-[13px] font-semibold text-[var(--on-surface)]">
                                {formatCreditUnits(module.creditUnits)}
                              </div>
                            )}
                          </CompactCalculatorField>
                          <div className="grid min-w-0 gap-1 md:col-span-2">
                            <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--on-surface-variant)]">
                              <span>Grade</span>
                              <span>GPV</span>
                            </div>
                            {module.isPassFail ? (
                              <div className="flex h-9 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--primary)]">
                                Excluded from GPA
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex h-9 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2">
                                  <select
                                    value={module.grade}
                                    disabled={module.isPassFail}
                                    onChange={(event) => {
                                      const grade = event.target.value as Grade;
                                      updateModule(module.courseCode, {
                                        grade,
                                        gradePoint: gradeToPoint(grade),
                                      });
                                    }}
                                    className="h-full w-full border-0 bg-transparent px-0 py-0 text-center text-[13px] font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    {GRADE_OPTIONS.map((option) => (
                                      <option key={option.grade} value={option.grade}>{option.grade}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex h-9 items-center justify-center rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2">
                                  <select
                                    value={module.gradePoint}
                                    disabled={module.isPassFail}
                                    onChange={(event) => {
                                      const gradePoint = Number(event.target.value);
                                      updateModule(module.courseCode, {
                                        gradePoint,
                                        grade: pointToGrade(gradePoint),
                                      });
                                    }}
                                    className="h-full w-full border-0 bg-transparent px-0 py-0 text-center text-[13px] font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    {POINT_OPTIONS.map((point) => (
                                      <option key={point} value={point}>{point.toFixed(1)}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${module.courseCode}`}
                            onClick={() => setModules((current) => current.filter((item) => item.courseCode !== module.courseCode))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--on-surface-variant)] hover:bg-[var(--error-container)] hover:text-[var(--error)]"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </article>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="calculator-panel calculator-major-panel relative rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-2.5 sm:p-3">
            <div className="group absolute right-3 top-3">
              <button
                type="button"
                aria-label="Previously completed credit units information"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-chip-bg)] text-[13px] font-extrabold italic leading-none text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-divider)] transition-all hover:bg-[var(--primary)] hover:text-on-primary hover:shadow-[var(--shadow-elev-1)] focus:bg-[var(--primary)] focus:text-on-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring-soft)]"
              >
                i
              </button>
              <div
                role="tooltip"
                className="calculator-primary-popover pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-64 rounded-[0.75rem] border border-[var(--brand-divider)] bg-[var(--primary)] px-3.5 py-3 text-[12px] font-medium leading-5 text-on-primary shadow-[var(--shadow-elev-2)] group-hover:block group-focus-within:block"
              >
                <span className="mb-0.5 block font-bold">Calculating completed CUs</span>
                Completed CUs include graded, pass/fail, and automatically pass/fail courses such as external certification modules. GPA credits exclude pass/fail CUs.
              </div>
            </div>
            <h2 className="pr-10 text-[15px] font-bold text-[var(--on-surface)]">Prior academic record</h2>
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
                  value={priorGpaInput}
                  onChange={(event) => setPriorGpaInput(nextPriorGpaInputValue(event.target.value))}
                  className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </CalculatorField>
              <CalculatorField label="Previously completed CUs">
                <input
                  type="number"
                  min="0"
                  step="2.5"
                  value={priorCreditsInput}
                  onChange={(event) => setPriorCreditsInput(event.target.value)}
                  className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </CalculatorField>
              <CalculatorField label="Previous pass/fail CUs">
                <input
                  type="number"
                  min="0"
                  step="2.5"
                  value={priorPassFailCreditsInput}
                  onChange={(event) => setPriorPassFailCreditsInput(capInputToMaximum(event.target.value, priorCredits))}
                  className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                />
              </CalculatorField>
            </div>
          </section>

          <section className="calculator-panel calculator-nested-panel rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-2.5 sm:p-3">
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

      <Modal
        open={clearConfirmOpen}
        title="Clear All Modules?"
        description="This will remove every module from the current semester GPA calculation."
        onClose={() => setClearConfirmOpen(false)}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(false)}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setModules([]);
                setClearConfirmOpen(false);
              }}
              className="app-danger-action rounded-[0.7rem] bg-red-500 px-3 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-red-400"
            >
              Clear All Modules
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[var(--on-surface-variant)]">
          You can&apos;t undo this action. Your previous cumulative GPA and completed credit units will not be changed.
        </p>
      </Modal>
    </div>
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
    <label className="grid min-w-0 grid-rows-[1rem_2.25rem] gap-1">
      <span className="block whitespace-nowrap text-[11px] font-bold uppercase leading-4 tracking-[0.04em] text-[var(--on-surface-variant)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatItem({
  label,
  value,
  tone = "default",
  className = "",
  compact = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "semester" | "all-time";
  className?: string;
  compact?: boolean;
})
{
  const toneClasses = tone === "semester"
    ? "border-[var(--outline-variant)] bg-[var(--surface-container-low)]"
    : tone === "all-time"
      ? "border-[var(--outline-variant)] bg-[color-mix(in_srgb,var(--surface-container-lowest),var(--surface-container-high) 18%)]"
      : "border-[var(--outline-variant)] bg-[color-mix(in_srgb,var(--surface-container-lowest),var(--surface-container-low) 35%)]";

  return (
    <div className={`min-w-0 rounded-[0.75rem] border ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} ${toneClasses} ${className}`}>
      <p className={`${compact ? "text-[9px] font-medium leading-3 tracking-normal" : "text-[11px] font-semibold tracking-[0.06em]"} uppercase text-[var(--on-surface-variant)]`}>
        {label}
      </p>
      <p className={`${compact ? "mt-0.5 text-[19px] font-bold leading-6" : "mt-1 text-[28px] font-extrabold leading-8"} text-[var(--on-surface)]`}>
        {value}
      </p>
    </div>
  );
}

function CompactCalculatorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
})
{
  return (
    <label className="grid min-w-0 gap-1">
      <span className="block whitespace-nowrap text-center text-[10px] font-bold uppercase leading-4 tracking-[0.04em] text-[var(--on-surface-variant)]">
        {label}
      </span>
      {children}
    </label>
  );
}
