"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  ArrowUpRightIcon,
  BookIcon,
  CalendarIcon,
  CalendarWeekIcon,
  LayersIcon,
  SchoolIcon,
} from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";
import {
  formatClassGroupLabel,
  formatEventHeading,
  formatTimeRange,
} from "@/lib/timetable/date-utils";
import { normalizeRichTextList } from "@/lib/timetable/timetable-utils";
import type {
  AssessmentComponentRecord,
  CourseClassRecord,
  CourseRecord,
  SemesterRecord,
} from "@/lib/timetable/types";

type ClassesResponse = {
  classes: CourseClassRecord[];
};

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

export function CourseDetailPage({
  course,
  offeredSemesters,
  selectedSemesterId,
  classes: initialClasses,
  assessments,
}: {
  course: CourseRecord;
  offeredSemesters: SemesterRecord[];
  selectedSemesterId?: number;
  classes: CourseClassRecord[];
  assessments: AssessmentComponentRecord[];
})
{
  const [classes, setClasses] = useState(initialClasses);
  const [activeSemesterId, setActiveSemesterId] = useState<number | "all">(selectedSemesterId ?? "all");
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [scheduleGroup, setScheduleGroup] = useState<CourseClassRecord | null>(null);
  const [assessmentScheduleType, setAssessmentScheduleType] = useState<"daytime" | "evening" | null>(null);
  const topics = useMemo(() => normalizeRichTextList(course.courseTopics), [course.courseTopics]);
  const outcomes = useMemo(() => normalizeRichTextList(course.learningOutcomes), [course.learningOutcomes]);
  const assessmentsByScheduleType = useMemo(() => ({
    daytime: assessments.filter((component) => component.scheduleType === "daytime"),
    evening: assessments.filter((component) => component.scheduleType === "evening"),
  }), [assessments]);
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
  const scheduleTypesForSelectedSemester = useMemo(() => {
    const values = [...new Set(classes.map((group) => group.scheduleType))] as Array<"daytime" | "evening">;
    return values.sort();
  }, [classes]);

  useEffect(() => {
    if (sharedAssessmentSet)
    {
      setAssessmentScheduleType(null);
      return;
    }

    if (scheduleTypesForSelectedSemester.length === 1)
    {
      setAssessmentScheduleType(scheduleTypesForSelectedSemester[0]);
      return;
    }

    setAssessmentScheduleType((current) => (
      current && scheduleTypesForSelectedSemester.includes(current)
        ? current
        : null
    ));
  }, [scheduleTypesForSelectedSemester, sharedAssessmentSet]);

  async function handleSemesterChange(nextValue: number | "all")
  {
    setActiveSemesterId(nextValue);
    setLoadingClasses(true);
    setScheduleGroup(null);

    const params = new URLSearchParams({
      courseCode: course.courseCode,
    });

    if (nextValue !== "all")
    {
      params.set("semesterId", String(nextValue));
    }

    const nextUrl = nextValue === "all"
      ? `/courses/${course.courseCode}`
      : `/courses/${course.courseCode}?semesterId=${nextValue}`;
    window.history.replaceState(null, "", nextUrl);

    try
    {
      const response = await fetch(`/api/classes?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok)
      {
        throw new Error("Unable to load classes.");
      }

      const payload = await response.json() as ClassesResponse;
      setClasses(payload.classes);
    }
    catch {
      setClasses([]);
    }
    finally
    {
      setLoadingClasses(false);
    }
  }

  return (
    <>
      <div className="px-4 py-6 md:px-[16px]">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <span className="text-[32px] font-black leading-none tracking-[-0.05em] text-[var(--primary)]">{course.courseCode}</span>
                  <h1 className="text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--on-surface)]">
                    {course.courseName ?? "Untitled course"}
                  </h1>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  <span className="inline-flex items-center gap-2">
                    <SchoolIcon className="h-4 w-4 text-[var(--primary)]" />
                    {course.schoolName ?? "School unavailable"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarWeekIcon className="h-4 w-4 text-[var(--primary)]" />
                    {offeredSemesters.length > 0
                      ? offeredSemesters.map((semester) => `${semester.semesterName} (${semester.academicYear})`).join(" · ")
                      : "Semester offering unavailable"}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <DetailStat icon={<BookIcon className="h-5 w-5" />} label="Credit Units" value={`${course.creditUnits?.toFixed(1) ?? "0.0"} CU`} />
                <DetailStat icon={<LayersIcon className="h-5 w-5" />} label="Course Level" value={course.courseLevel ?? "Level unavailable"} />
                <DetailStat icon={<SchoolIcon className="h-5 w-5" />} label="Academic Track" value={course.isPostgraduate ? "Postgraduate" : "Undergraduate"} />
              </div>

              <div className="flex flex-wrap gap-2">
                {offeredSemesters.map((semester) => (
                  <span key={semester.semesterId} className="inline-flex items-center gap-2 rounded-[999px] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-1.5 text-[12px] font-semibold leading-4 text-[var(--on-surface)]">
                    <CalendarIcon className="h-4 w-4 text-[var(--primary)]" />
                    {semester.semesterName}
                  </span>
                ))}
                {course.synopsisUrl ? (
                  <a
                    href={course.synopsisUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-[999px] border border-[var(--primary)] bg-[var(--primary-fixed)] px-3 py-1.5 text-[12px] font-semibold leading-4 text-[var(--primary)] underline decoration-transparent transition-colors hover:bg-[var(--primary)] hover:text-[var(--on-primary)] hover:decoration-current"
                  >
                    <BookIcon className="h-4 w-4" />
                    Course Synopsis
                    <ArrowUpRightIcon className="h-4 w-4" />
                  </a>
                ) : null}
              </div>

              {course.courseSynopsis ? (
                <div className="rounded-[0.8rem] bg-[var(--surface-container-low)] p-4 text-[15px] leading-7 text-[var(--on-surface)]">
                  {course.courseSynopsis}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <section className="space-y-4">
              <article className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Topics</h2>
                {topics.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {topics.map((topic) => <li key={topic}>• {topic}</li>)}
                  </ul>
                ) : (
                  <p className="mt-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">No topics available.</p>
                )}
              </article>

              <article className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Learning Outcomes</h2>
                {outcomes.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {outcomes.map((outcome) => <li key={outcome}>• {outcome}</li>)}
                  </ul>
                ) : (
                  <p className="mt-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">No learning outcomes available.</p>
                )}
              </article>
            </section>

            <section className="space-y-4">
              <article className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
                <div>
                  <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Available Classes</h2>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                    Choose a semester filter below. The class list updates immediately.
                  </p>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Semester</span>
                    <select
                      value={activeSemesterId === "all" ? "all" : String(activeSemesterId)}
                      onChange={(event) => void handleSemesterChange(event.target.value === "all" ? "all" : Number(event.target.value))}
                      className="w-full rounded-[0.6rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2.5 text-[13px] font-medium leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      <option value="all">All semesters</option>
                      {offeredSemesters.map((semester) => (
                        <option key={semester.semesterId} value={semester.semesterId}>
                          {semester.semesterName} ({semester.academicYear})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 space-y-3">
                  {loadingClasses ? (
                    <div className="rounded-[0.7rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      Loading class groups...
                    </div>
                  ) : null}

                  {!loadingClasses && classes.map((group) => (
                    <article key={group.classId} className="rounded-[0.7rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[16px] font-semibold leading-6 text-[var(--on-surface)]">{formatClassGroupLabel(group.groupCode)}</h3>
                          <p className="mt-1 text-[12px] leading-4 text-[var(--on-surface-variant)]">
                            {group.scheduleType} · {group.creditUnits?.toFixed(1) ?? "0.0"} CU · {group.presentationPattern ?? "Pattern unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setScheduleGroup(group)}
                            className="rounded-[0.4rem] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)] hover:text-[var(--on-primary)]"
                          >
                            View schedule
                          </button>
                          <Link href="/planner" className="rounded-[0.4rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]">
                            Open timetable
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}

                  {!loadingClasses && classes.length === 0 ? (
                    <div className="rounded-[0.7rem] border-2 border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      No classes found for this course under the selected semester filter.
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Assessment Components</h2>
                <div className="mt-4 space-y-2">
                  {assessments.length === 0 ? (
                    <p className="text-[14px] leading-5 text-[var(--on-surface-variant)]">No assessment data available.</p>
                  ) : sharedAssessmentSet ? (
                    <>
                      {sharedAssessmentSet.map((component) => (
                        <div key={component.componentId} className="rounded-[0.7rem] bg-[var(--surface-container-low)] px-3 py-3 text-[13px] leading-5 text-[var(--on-surface)]">
                          <div className="font-semibold">{component.componentName}</div>
                          <div className="text-[var(--on-surface-variant)]">{component.componentGroup} · {component.weightPercentage.toFixed(2)}%</div>
                          {component.assessmentMode ? <div className="text-[var(--on-surface-variant)]">{component.assessmentMode}</div> : null}
                        </div>
                      ))}
                    </>
                  ) : activeSemesterId === "all" ? (
                    <div className="rounded-[0.7rem] border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      Select a semester above to view the matching assessment components.
                    </div>
                  ) : scheduleTypesForSelectedSemester.length === 0 ? (
                    <div className="rounded-[0.7rem] border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      No schedule information is available for the selected semester.
                    </div>
                  ) : (
                    <>
                      {scheduleTypesForSelectedSemester.length > 1 ? (
                        <div className="mb-3 space-y-3">
                          <p className="text-[13px] leading-5 text-[var(--on-surface-variant)]">
                            This semester has different daytime and evening assessment components. Choose one to view.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {scheduleTypesForSelectedSemester.map((scheduleType) => (
                              <button
                                key={scheduleType}
                                type="button"
                                onClick={() => setAssessmentScheduleType(scheduleType)}
                                className={`rounded-[999px] border px-3 py-1.5 text-[12px] font-semibold leading-4 transition-colors ${
                                  assessmentScheduleType === scheduleType
                                    ? "border-[var(--primary)] bg-[var(--primary-fixed)] text-[var(--primary)]"
                                    : "border-[var(--outline-variant)] bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                                }`}
                              >
                                {scheduleType === "daytime" ? "Daytime" : "Evening"}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {assessmentScheduleType
                        ? assessmentsByScheduleType[assessmentScheduleType].map((component) => (
                            <div key={component.componentId} className="rounded-[0.7rem] bg-[var(--surface-container-low)] px-3 py-3 text-[13px] leading-5 text-[var(--on-surface)]">
                              <div className="font-semibold">{component.componentName}</div>
                              <div className="text-[var(--on-surface-variant)]">{component.componentGroup} · {component.weightPercentage.toFixed(2)}%</div>
                              {component.assessmentMode ? <div className="text-[var(--on-surface-variant)]">{component.assessmentMode}</div> : null}
                            </div>
                          ))
                        : (
                            <div className="rounded-[0.7rem] border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                              Select a schedule above to view its assessment components.
                            </div>
                          )}
                    </>
                  )}
                </div>
              </article>
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(scheduleGroup)}
        title={scheduleGroup ? `${formatClassGroupLabel(scheduleGroup.groupCode)} Schedule` : "Class schedule"}
        description={scheduleGroup ? `${scheduleGroup.courseCode} · ${scheduleGroup.courseName ?? "Untitled course"}` : undefined}
        onClose={() => setScheduleGroup(null)}
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-3">
          {scheduleGroup?.events.map((event) => (
            <div key={event.eventId} className="rounded-[0.7rem] bg-[var(--surface-container-low)] px-3 py-3 text-[13px] leading-5 text-[var(--on-surface)]">
              <div className="font-semibold">{formatEventHeading(event.eventKind, event.eventDate)}</div>
              <div className="text-[var(--on-surface-variant)]">{formatTimeRange(event.startTime, event.endTime)} · {event.venue ?? event.eventMode ?? "TBA"}</div>
              {event.weekLabel ? <div className="text-[var(--on-surface-variant)]">{event.weekLabel}</div> : null}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
})
{
  return (
    <div className="rounded-[0.8rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
      <div className="flex items-center gap-2 text-[var(--primary)]">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">{label}</span>
      </div>
      <div className="mt-2 text-[18px] font-semibold leading-6 text-[var(--on-surface)]">{value}</div>
    </div>
  );
}
