"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowUpRightIcon,
  BookIcon,
  CalculatorIcon,
  SearchIcon,
  XIcon,
} from "@/components/planner/icons";
import type { AssessmentComponentRecord, CourseRecord } from "@/lib/timetable/types";

type CourseSearchResult = {
  courseCode: string;
  courseName: string | null;
  creditUnits: number | null;
};

type SearchResponse = {
  courses: CourseSearchResult[];
};

type CourseDetailResponse = {
  course: CourseRecord;
  assessmentComponents: AssessmentComponentRecord[];
};

type ScheduleType = "daytime" | "evening";
type ScoreInputMode = "percentage" | "raw";

type AssessmentScoreInput = {
  mode: ScoreInputMode;
  percentage: string;
  rawScore: string;
  rawMax: string;
};

const EMPTY_SCORE_INPUT: AssessmentScoreInput = {
  mode: "percentage",
  percentage: "",
  rawScore: "",
  rawMax: "",
};

const GRADE_BANDS: Array<{ grade: string; minimum: number }> = [
  { grade: "A+", minimum: 85 },
  { grade: "A", minimum: 80 },
  { grade: "A-", minimum: 75 },
  { grade: "B+", minimum: 70 },
  { grade: "B", minimum: 65 },
  { grade: "B-", minimum: 60 },
  { grade: "C+", minimum: 55 },
  { grade: "C", minimum: 50 },
  { grade: "D+", minimum: 45 },
  { grade: "D", minimum: 40 },
  { grade: "F", minimum: 0 },
];

const GRADE_POINT_VALUES: Record<string, number> = {
  "A+": 5,
  A: 5,
  "A-": 4.5,
  "B+": 4,
  B: 3.5,
  "B-": 3,
  "C+": 2.5,
  C: 2,
  "D+": 1.5,
  D: 1,
  F: 0,
};

function useDebouncedValue(value: string, delayMs: number)
{
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function buildAssessmentSignature(components: AssessmentComponentRecord[])
{
  return components
    .map((component) => [
      component.componentName,
      component.componentGroup,
      component.assessmentMode ?? "",
      component.weightPercentage.toFixed(2),
      component.sortOrder,
    ].join("|"))
    .join("::");
}

function formatPercent(value: number | null)
{
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function getEstimatedGrade(score: number | null)
{
  if (score === null)
  {
    return "—";
  }

  return GRADE_BANDS.find((band) => score >= band.minimum)?.grade ?? "F";
}

function getEstimatedGradePointValue(grade: string)
{
  return GRADE_POINT_VALUES[grade] ?? null;
}

function formatGradePointValue(value: number | null)
{
  return value === null ? "—" : value.toFixed(1);
}

function parseNumericInput(input?: string)
{
  if (input === undefined || input.trim() === "")
  {
    return null;
  }

  const value = Number(input);
  if (!Number.isFinite(value))
  {
    return null;
  }
  return value;
}

function parsePercentageScore(input?: string)
{
  const value = parseNumericInput(input);
  if (value === null)
  {
    return null;
  }

  return Math.min(100, Math.max(0, value));
}

function parseRawScore(rawScore?: string, rawMax?: string)
{
  const scoreValue = parseNumericInput(rawScore);
  const maxValue = parseNumericInput(rawMax);

  if (scoreValue === null || maxValue === null || maxValue <= 0)
  {
    return null;
  }

  return Math.min(100, Math.max(0, (scoreValue / maxValue) * 100));
}

function parseAssessmentScore(input?: AssessmentScoreInput)
{
  if (!input)
  {
    return null;
  }

  return input.mode === "percentage"
    ? parsePercentageScore(input.percentage)
    : parseRawScore(input.rawScore, input.rawMax);
}

export function OcasCalculatorClient()
{
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchResult | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetailResponse | null>(null);
  const [selectedScheduleType, setSelectedScheduleType] = useState<ScheduleType | null>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<number, AssessmentScoreInput>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 250);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (!query || selectedCourse)
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
  }, [debouncedQuery, selectedCourse]);

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

  useEffect(() => {
    if (!selectedCourse)
    {
      setCourseDetail(null);
      setSelectedScheduleType(null);
      setScoreInputs({});
      setDetailError("");
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setCourseDetail(null);
    setSelectedScheduleType(null);
    setScoreInputs({});

    fetch(`/api/courses/${encodeURIComponent(selectedCourse.courseCode)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
        {
          throw new Error("Unable to load course details.");
        }
        return response.json() as Promise<CourseDetailResponse>;
      })
      .then((payload) => setCourseDetail(payload))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError")
        {
          setCourseDetail(null);
          setDetailError("Unable to load assessment strategy for this course.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted)
        {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedCourse]);

  const assessmentsByScheduleType = useMemo(() => ({
    daytime: courseDetail?.assessmentComponents.filter((component) => component.scheduleType === "daytime") ?? [],
    evening: courseDetail?.assessmentComponents.filter((component) => component.scheduleType === "evening") ?? [],
  }), [courseDetail?.assessmentComponents]);

  const assessmentScheduleTypes = useMemo(
    () => (["daytime", "evening"] as const).filter((scheduleType) => assessmentsByScheduleType[scheduleType].length > 0),
    [assessmentsByScheduleType],
  );

  const sharedAssessmentSet = useMemo(() => {
    if (assessmentScheduleTypes.length <= 1)
    {
      return assessmentsByScheduleType[assessmentScheduleTypes[0] ?? "daytime"] ?? [];
    }

    const [firstType, ...rest] = assessmentScheduleTypes;
    const referenceSignature = buildAssessmentSignature(assessmentsByScheduleType[firstType]);

    return rest.every((scheduleType) => buildAssessmentSignature(assessmentsByScheduleType[scheduleType]) === referenceSignature)
      ? assessmentsByScheduleType[firstType]
      : null;
  }, [assessmentScheduleTypes, assessmentsByScheduleType]);

  useEffect(() => {
    if (!courseDetail)
    {
      return;
    }

    if (sharedAssessmentSet || assessmentScheduleTypes.length <= 1)
    {
      setSelectedScheduleType(null);
      return;
    }

    setSelectedScheduleType((current) => (
      current && assessmentScheduleTypes.includes(current)
        ? current
        : assessmentScheduleTypes[0] ?? null
    ));
  }, [assessmentScheduleTypes, courseDetail, sharedAssessmentSet]);

  const visibleAssessments = useMemo(() => {
    if (!courseDetail)
    {
      return [];
    }

    if (sharedAssessmentSet)
    {
      return sharedAssessmentSet;
    }

    if (assessmentScheduleTypes.length === 0)
    {
      return courseDetail.assessmentComponents;
    }

    const scheduleType = selectedScheduleType ?? assessmentScheduleTypes[0] ?? null;
    return scheduleType ? assessmentsByScheduleType[scheduleType] : courseDetail.assessmentComponents;
  }, [assessmentScheduleTypes, assessmentsByScheduleType, courseDetail, selectedScheduleType, sharedAssessmentSet]);

  const totalWeight = useMemo(
    () => visibleAssessments.reduce((total, component) => total + component.weightPercentage, 0),
    [visibleAssessments],
  );
  const selectedCourseCode = selectedCourse?.courseCode ?? "";

  const completedWeight = useMemo(
    () => visibleAssessments.reduce(
      (total, component) => (parseAssessmentScore(scoreInputs[component.componentId]) === null ? total : total + component.weightPercentage),
      0,
    ),
    [scoreInputs, visibleAssessments],
  );

  const estimatedScore = useMemo(() => {
    if (visibleAssessments.length === 0 || totalWeight <= 0)
    {
      return null;
    }

    if (!visibleAssessments.every((component) => parseAssessmentScore(scoreInputs[component.componentId]) !== null))
    {
      return null;
    }

    return visibleAssessments.reduce((total, component) => {
      const score = parseAssessmentScore(scoreInputs[component.componentId]) ?? 0;
      return total + (score * component.weightPercentage);
    }, 0) / totalWeight;
  }, [scoreInputs, totalWeight, visibleAssessments]);

  const estimatedGrade = useMemo(() => getEstimatedGrade(estimatedScore), [estimatedScore]);

  const groupedAssessments = useMemo(() => ({
    OCAS: visibleAssessments.filter((component) => component.componentGroup === "OCAS"),
    OES: visibleAssessments.filter((component) => component.componentGroup === "OES"),
  }), [visibleAssessments]);
  const ocasAssessments = groupedAssessments.OCAS;
  const oesAssessments = groupedAssessments.OES;
  const ocasWeight = useMemo(
    () => ocasAssessments.reduce((total, component) => total + component.weightPercentage, 0),
    [ocasAssessments],
  );
  const oesWeight = useMemo(
    () => oesAssessments.reduce((total, component) => total + component.weightPercentage, 0),
    [oesAssessments],
  );
  const estimatedOcasScore = useMemo(() => {
    if (ocasAssessments.length === 0 || ocasWeight <= 0)
    {
      return null;
    }

    if (!ocasAssessments.every((component) => parseAssessmentScore(scoreInputs[component.componentId]) !== null))
    {
      return null;
    }

    return ocasAssessments.reduce((total, component) => {
      const score = parseAssessmentScore(scoreInputs[component.componentId]) ?? 0;
      return total + (score * component.weightPercentage);
    }, 0) / ocasWeight;
  }, [ocasAssessments, ocasWeight, scoreInputs]);
  const examEligibilityWarning = oesAssessments.length > 0 && estimatedOcasScore !== null && estimatedOcasScore < 40;

  function setAssessmentScoreInput(
    componentId: number,
    updater: (current: AssessmentScoreInput) => AssessmentScoreInput,
  )
  {
    setScoreInputs((current) => ({
      ...current,
      [componentId]: updater(current[componentId] ?? EMPTY_SCORE_INPUT),
    }));
  }

  return (
    <section className="calculator-page w-full pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[28px] font-semibold leading-9 tracking-[-0.03em] text-[var(--on-surface)]">
            OCAS Calculator
          </h2>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <div ref={searchContainerRef} className="relative z-20 mb-4">
            <div className="calculator-panel rounded-[1rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalculatorIcon className="h-7 w-7 text-[var(--primary)]" />
                  <h3 className="text-[24px] font-medium leading-8 tracking-[-0.02em] text-[var(--on-surface)]">
                    Choose a course
                  </h3>
                </div>
                {selectedCourse ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCourse(null);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                  >
                    Change course
                  </button>
                ) : null}
              </div>

              {selectedCourse ? (
                <div className="calculator-panel mt-4 rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold text-[var(--primary)]">{selectedCourse.courseCode}</p>
                      <p className="mt-1 text-[15px] font-semibold text-[var(--on-surface)]">
                        {selectedCourse.courseName ?? "Course name unavailable"}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--on-surface-variant)]">
                        {selectedCourse.creditUnits ?? 0} CU
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `/courses/${selectedCourse.courseCode}`;
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[0.6rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                    >
                      <BookIcon className="h-4 w-4" />
                      Course page
                      <ArrowUpRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative mt-3 h-[42px]">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by Module Code or Title..."
                      autoComplete="off"
                      className="h-full w-full rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] py-2.5 pl-10 pr-11 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
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
                          <p className="px-4 py-4 text-[13px] text-[var(--on-surface-variant)]">Searching courses...</p>
                        ) : searchResults.length > 0 ? (
                          <ul className="max-h-80 overflow-y-auto py-1">
                            {searchResults.map((course: CourseSearchResult) => {
                              const alreadySelected = selectedCourseCode === course.courseCode;
                              return (
                                <li key={course.courseCode}>
                                  <button
                                    type="button"
                                    disabled={alreadySelected}
                                    onClick={() => {
                                      setSelectedCourse(course);
                                      setSearchQuery("");
                                      setSearchResults([]);
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-chip-bg)] text-[var(--primary)]">
                                      <CalculatorIcon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[13px] font-bold text-[var(--on-surface)]">{course.courseCode}</span>
                                      <span className="block truncate text-[12px] text-[var(--on-surface-variant)]">
                                        {course.courseName ?? "Course name unavailable"}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-[12px] font-semibold text-[var(--on-surface-variant)]">
                                      {alreadySelected ? "Selected" : `${course.creditUnits ?? 5} CU`}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="px-4 py-4 text-[13px] text-[var(--on-surface-variant)]">No matching courses found.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="calculator-panel overflow-hidden rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] elev-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-4 py-3.5">
              <div>
                <h3 className="text-[15px] font-bold text-[var(--on-surface)]">Assessment strategy</h3>
                <p className="mt-0.5 text-[12px] text-[var(--on-surface-variant)]">
                  {selectedCourse
                    ? "Enter projected marks as percentages or raw scores."
                    : "Search for a course to load its assessment breakdown."}
                </p>
              </div>
              {courseDetail && visibleAssessments.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-[12px] font-semibold text-[var(--on-surface-variant)]">
                  <span className="calculator-chip rounded-full bg-[var(--brand-chip-bg)] px-2.5 py-1 text-[var(--primary)]">
                    OCAS {formatPercent(ocasWeight)}
                  </span>
                  <span className="calculator-chip rounded-full bg-[var(--brand-chip-bg)] px-2.5 py-1 text-[var(--primary)]">
                    OES {formatPercent(oesWeight)}
                  </span>
                </div>
              ) : null}
            </div>

            {detailLoading ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">Loading course details...</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  Pulling the assessment strategy from the course page.
                </p>
              </div>
            ) : detailError ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">Unable to load course details</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">{detailError}</p>
              </div>
            ) : selectedCourse && visibleAssessments.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">No assessment data available</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  This course does not currently have a machine-readable assessment strategy.
                </p>
              </div>
            ) : selectedCourse ? (
              <div className="divide-y divide-[var(--brand-divider)]">
                {assessmentScheduleTypes.length > 1 && !sharedAssessmentSet ? (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-4">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                      Schedule
                    </span>
                    {assessmentScheduleTypes.map((scheduleType) => (
                      <button
                        key={scheduleType}
                        type="button"
                        onClick={() => setSelectedScheduleType(scheduleType)}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                          selectedScheduleType === scheduleType
                            ? "calculator-primary-action bg-[var(--primary)] text-on-primary"
                            : "calculator-chip bg-[var(--brand-chip-bg)] text-[var(--primary)] hover:bg-[var(--surface-container-high)]"
                        }`}
                      >
                        {scheduleType === "daytime" ? "Daytime" : "Evening"}
                      </button>
                    ))}
                  </div>
                ) : null}

                {examEligibilityWarning ? (
                  <div className="px-4 py-4">
                    <div className="rounded-[0.75rem] border border-[var(--error)]/30 bg-[var(--error-container)] px-3 py-2 text-[12px] font-medium leading-5 text-[var(--error)]">
                      The exam cannot be taken until OCAS reaches at least 40%.
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-0 lg:grid-cols-2">
                  {(["OCAS", "OES"] as const).map((group) => {
                    const items = groupedAssessments[group];

                    if (items.length === 0)
                    {
                      return null;
                    }

                    return (
                      <section key={group} className="border-b border-[var(--brand-divider)] lg:border-b-0 lg:border-r lg:last:border-r-0">
                        <div className="border-b border-[var(--brand-divider)] bg-[var(--surface-container-low)] px-4 py-3">
                          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                            {group}
                          </p>
                          <p className="mt-1 text-[13px] text-[var(--on-surface-variant)]">
                            {group === "OCAS" ? "Coursework components" : "Examinable components"}
                          </p>
                        </div>

                        <div className="divide-y divide-[var(--brand-divider)]">
                          {items.map((component) => {
                            const currentInput = scoreInputs[component.componentId] ?? EMPTY_SCORE_INPUT;
                            const isPercentageMode = currentInput.mode === "percentage";

                            return (
                              <div key={component.componentId} className="px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-[14px] font-bold text-[var(--on-surface)]">
                                      {component.componentName}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-[var(--on-surface-variant)]">
                                      {component.assessmentMode ?? "Assessment"} • Weight {component.weightPercentage.toFixed(1)}%
                                    </p>
                                  </div>
                                  <span className="calculator-chip rounded-full bg-[var(--brand-chip-bg)] px-2.5 py-1 text-[12px] font-semibold text-[var(--primary)]">
                                    {component.weightPercentage.toFixed(1)}%
                                  </span>
                                </div>

                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                                      {isPercentageMode ? "Percentage score" : "Raw score"}
                                    </p>
                                    <div className="inline-flex rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-0.5 text-[11px] font-semibold leading-4">
                                      <button
                                        type="button"
                                        onClick={() => setAssessmentScoreInput(component.componentId, (current) => ({
                                          ...current,
                                          mode: "percentage",
                                        }))}
                                        className={`rounded-full px-2.5 py-1 transition-colors ${
                                          isPercentageMode
                                            ? "calculator-primary-action bg-[var(--primary)] text-on-primary"
                                            : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                                        }`}
                                      >
                                        Percent
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAssessmentScoreInput(component.componentId, (current) => ({
                                          ...current,
                                          mode: "raw",
                                        }))}
                                        className={`rounded-full px-2.5 py-1 transition-colors ${
                                          isPercentageMode
                                            ? "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                                            : "calculator-primary-action bg-[var(--primary)] text-on-primary"
                                        }`}
                                      >
                                        Score
                                      </button>
                                    </div>
                                  </div>

                                  {isPercentageMode ? (
                                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={currentInput.percentage}
                                        onChange={(event) => setAssessmentScoreInput(component.componentId, (current) => ({
                                          ...current,
                                          mode: "percentage",
                                          percentage: event.target.value,
                                        }))}
                                        placeholder="Enter percentage"
                                        className="h-10 min-w-0 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                                      />
                                      <div className="flex h-10 items-center justify-center rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[12px] font-semibold text-[var(--on-surface-variant)]">
                                        %
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={currentInput.rawScore}
                                        onChange={(event) => setAssessmentScoreInput(component.componentId, (current) => ({
                                          ...current,
                                          mode: "raw",
                                          rawScore: event.target.value,
                                        }))}
                                        placeholder="Score"
                                        className="h-10 min-w-0 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                                      />
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={currentInput.rawMax}
                                        onChange={(event) => setAssessmentScoreInput(component.componentId, (current) => ({
                                          ...current,
                                          mode: "raw",
                                          rawMax: event.target.value,
                                        }))}
                                        placeholder="Out of"
                                        className="h-10 min-w-0 rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] leading-5 text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-bold text-[var(--on-surface)]">No course selected</p>
                <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  Search above to load a course and its assessment strategy.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="calculator-panel rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 elev-1">
            <div className="space-y-4">
              <div className="grid gap-0 divide-y divide-[var(--brand-divider)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="pb-4 sm:pr-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                    Projected score
                  </p>
                  <p className="mt-1 text-[32px] font-bold leading-10 tracking-[-0.04em] text-[var(--on-surface)]">
                    {formatPercent(estimatedScore)}
                  </p>
                </div>
                <div className="pt-4 sm:pl-4 sm:pt-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                    Likely grade
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[var(--on-surface)]">
                    <span className="text-[32px] font-bold leading-10 tracking-[-0.04em]">
                      {estimatedGrade}
                    </span>
                    <span className="text-[16px] font-semibold leading-6 tracking-[-0.01em] text-[var(--on-surface-variant)]">
                      GPV {formatGradePointValue(getEstimatedGradePointValue(estimatedGrade))}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[12px] leading-5 text-[var(--on-surface-variant)]">
                This is only your likely grade and may be subject to moderation.
              </p>

              <div className="border-t border-[var(--brand-divider)] pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                  Completed weight
                </p>
                <p className="mt-1 text-[24px] font-bold leading-8 tracking-[-0.03em] text-[var(--on-surface)]">
                  {formatCompletedWeight(completedWeight)}
                  <span className="ml-1 text-[14px] font-normal leading-6 tracking-normal text-[var(--on-surface-variant)]">
                    out of 100%
                  </span>
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function formatCompletedWeight(value: number)
{
  return `${Number(value.toFixed(1)).toString()}%`;
}
