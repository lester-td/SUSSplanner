"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  AddToSemesterPlannerButton,
} from "@/components/planner/add-to-semester-planner-button";
import {
  ArrowUpRightIcon,
  AssessmentIcon,
  BookIcon,
  CalendarWeekIcon,
  LayersIcon,
  MoonIcon,
  SchoolIcon,
  SunIcon,
} from "@/components/planner/icons";
import { ClassScheduleModalContent, formatClassScheduleTitle } from "@/components/timetable/class-schedule-modal-content";
import { AddToTimetableButton } from "@/components/timetable/add-to-timetable-button";
import { Modal } from "@/components/ui/modal";
import {
  formatClassGroupLabel,
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

function formatAssessmentWeight(value: number)
{
  return `${Number(value.toFixed(2)).toString()}%`;
}

export function CourseDetailPage({
  course,
  offeredSemesters,
  currentSemesterId,
  selectedSemesterId,
  classes: initialClasses,
  assessments,
}: {
  course: CourseRecord;
  offeredSemesters: SemesterRecord[];
  currentSemesterId: number | null;
  selectedSemesterId?: number;
  classes: CourseClassRecord[];
  assessments: AssessmentComponentRecord[];
})
{
  const [classes, setClasses] = useState(selectedSemesterId ? initialClasses : []);
  const [activeSemesterId, setActiveSemesterId] = useState<number | null>(selectedSemesterId ?? null);
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
  const displaySemesterLabel = useMemo(() => {
    const selected = activeSemesterId === null
      ? null
      : offeredSemesters.find((semester) => semester.semesterId === activeSemesterId);
    return (selected ?? offeredSemesters[0])?.semesterName ?? "Semester offering unavailable";
  }, [activeSemesterId, offeredSemesters]);

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

  async function handleSemesterChange(nextValue: number | null)
  {
    setActiveSemesterId(nextValue);
    setScheduleGroup(null);

    if (nextValue === null)
    {
      setClasses([]);
      setLoadingClasses(false);
      window.history.replaceState(null, "", `/courses/${course.courseCode}`);
      return;
    }

    setLoadingClasses(true);

    const params = new URLSearchParams({
      courseCode: course.courseCode,
    });

    params.set("semesterId", String(nextValue));
    const nextUrl = `/courses/${course.courseCode}?semesterId=${nextValue}`;
    window.history.replaceState(null, "", nextUrl);

    try
    {
      const response = await fetch(`/api/classes?${params.toString()}`);

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
      <div className="course-detail-page">
        <div className="space-y-4">
          <div className="course-detail-intro border-b border-[var(--outline-variant)] pb-4">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <span className="text-[32px] font-black leading-none tracking-[-0.05em] text-[var(--primary)]">{course.courseCode}</span>
                  <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[30px] sm:font-semibold sm:leading-[1.05] sm:tracking-[-0.03em]">
                    {course.courseName ?? "Untitled course"}
                  </h1>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[13px] leading-5 text-[var(--on-surface-variant)]">
                  <span className="inline-flex items-center gap-2">
                    <SchoolIcon className="h-4 w-4 text-[var(--primary)]" />
                    {course.schoolName ?? "School unavailable"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarWeekIcon className="h-4 w-4 text-[var(--primary)]" />
                    {displaySemesterLabel}
                  </span>
                  <div className="course-detail-quick-actions hidden flex-wrap items-center gap-2.5 sm:ml-auto sm:flex">
                    <AddToTimetableButton
                      course={{ ...course, offeredSemesters }}
                      appearance="outline"
                      preferredSemesterId={activeSemesterId}
                      fallbackSemesterId={currentSemesterId}
                    />
                    <AddToSemesterPlannerButton course={course} appearance="outline" />
                    {course.synopsisUrl ? (
                      <a
                        href={course.synopsisUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-[0.4rem] border border-[var(--outline-variant)] px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                      >
                        <BookIcon className="h-4 w-4" />
                        View @ SUSS
                        <ArrowUpRightIcon className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="course-detail-quick-actions mt-2.5 flex w-full flex-nowrap items-center gap-2 sm:hidden">
                  <AddToTimetableButton
                    course={{ ...course, offeredSemesters }}
                    appearance="outline"
                    compact
                    preferredSemesterId={activeSemesterId}
                    fallbackSemesterId={currentSemesterId}
                  />
                  <AddToSemesterPlannerButton course={course} appearance="outline" compact />
                  {course.synopsisUrl ? (
                    <a
                      href={course.synopsisUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-[0.4rem] border border-[var(--outline-variant)] px-2 py-0.5 text-[10px] font-semibold leading-3 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)] md:text-[11px] md:leading-4"
                    >
                      <BookIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      View @ SUSS
                      <ArrowUpRightIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="course-detail-layout grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:items-start">
            <CourseFacts course={course} className="grid xl:hidden" />

            <section className="course-detail-main space-y-4">
              {course.courseSynopsis ? (
                <article className="border-b border-[var(--outline-variant)] pb-4">
                  <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Description</h2>
                  <p className="mt-2.5 max-w-[80ch] text-[14px] leading-6 text-[var(--on-surface)]">
                    {course.courseSynopsis}
                  </p>
                </article>
              ) : null}

              <article className="border-b border-[var(--outline-variant)] pb-4">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Topics</h2>
                {topics.length > 0 ? (
                  <ul className="mt-2.5 space-y-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {topics.map((topic) => <li key={topic}>• {topic}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2.5 text-[14px] leading-5 text-[var(--on-surface-variant)]">No topics available.</p>
                )}
              </article>

              <article className="border-b border-[var(--outline-variant)] pb-4">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Learning Outcomes</h2>
                {outcomes.length > 0 ? (
                  <ul className="mt-2.5 space-y-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {outcomes.map((outcome) => <li key={outcome}>• {outcome}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2.5 text-[14px] leading-5 text-[var(--on-surface-variant)]">No learning outcomes available.</p>
                )}
              </article>
            </section>

            <section className="course-detail-side space-y-4">
              <CourseFacts course={course} className="hidden xl:grid" />

              <article className="app-aero-panel course-detail-assessment overflow-hidden">
                <h2 className="app-aero-panel-heading course-detail-assessment__header text-[16px] font-semibold leading-5">
                  <AssessmentIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                  Assessment Components
                </h2>
                <div className="course-detail-assessment__body">
                  {assessments.length === 0 ? (
                    <p className="text-[14px] leading-5 text-[var(--on-surface-variant)]">No assessment data available.</p>
                  ) : sharedAssessmentSet ? (
                    <div className="course-detail-assessment__list">
                      {sharedAssessmentSet.map((component) => (
                        <div key={component.componentId} className="flex items-start justify-between gap-3 px-1 py-3 text-[var(--on-surface)]">
                          <div className="text-[16px] font-medium leading-6">{component.componentName}</div>
                          <div className="flex items-center gap-2 text-right">
                            <div className="text-[16px] font-medium leading-6 text-[var(--on-surface-variant)]">{component.componentGroup}</div>
                            <div className="text-[16px] font-medium leading-6">{formatAssessmentWeight(component.weightPercentage)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : activeSemesterId === null ? (
                    <div className="border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      Select a semester above to view the matching assessment components.
                    </div>
                  ) : scheduleTypesForSelectedSemester.length === 0 ? (
                    <div className="border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                      No schedule information is available for the selected semester.
                    </div>
                  ) : (
                    <>
                      {scheduleTypesForSelectedSemester.length > 1 ? (
                        <div className="mb-3 space-y-2.5">
                          <p className="text-[13px] leading-5 text-[var(--on-surface-variant)]">
                            This semester has different daytime and evening assessment components. Choose one to view.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {scheduleTypesForSelectedSemester.map((scheduleType) => (
                              <button
                                key={scheduleType}
                                type="button"
                                onClick={() => setAssessmentScheduleType(scheduleType)}
                                className={`border px-3 py-1.5 text-[12px] font-semibold leading-4 transition-colors ${
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

                      {assessmentScheduleType ? (
                        <div className="course-detail-assessment__list">
                          {assessmentsByScheduleType[assessmentScheduleType].map((component) => (
                            <div key={component.componentId} className="flex items-start justify-between gap-3 px-1 py-3 text-[var(--on-surface)]">
                              <div className="text-[16px] font-medium leading-6">{component.componentName}</div>
                              <div className="flex items-center gap-2 text-right">
                                <div className="text-[16px] font-medium leading-6 text-[var(--on-surface-variant)]">{component.componentGroup}</div>
                                <div className="text-[16px] font-medium leading-6">{formatAssessmentWeight(component.weightPercentage)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                          Select a schedule above to view its assessment components.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>

              <article className="app-aero-panel course-detail-classes overflow-hidden">
                <h2 className="app-aero-panel-heading course-detail-classes__header text-[16px] font-semibold leading-5">
                  <CalendarWeekIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                  Available Classes
                </h2>
                <div className="course-detail-classes__body">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Semester</span>
                    <select
                      value={activeSemesterId === null ? "" : String(activeSemesterId)}
                      onChange={(event) => void handleSemesterChange(event.target.value === "" ? null : Number(event.target.value))}
                      className="w-full border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2.5 text-[13px] font-medium leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
                    >
                      <option value="">Select semester</option>
                      {offeredSemesters.map((semester) => (
                        <option key={semester.semesterId} value={semester.semesterId}>
                          {semester.semesterName} ({semester.academicYear})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-2.5">
                    {loadingClasses ? (
                      <p className="text-[14px] leading-5 text-[var(--on-surface)]">
                        Loading class groups...
                      </p>
                    ) : null}

                    {!loadingClasses && activeSemesterId !== null ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {classes.map((group) => (
                          <button
                            key={group.classId}
                            type="button"
                            onClick={() => setScheduleGroup(group)}
                            className="border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-left text-[13px] font-semibold leading-5 text-[var(--on-surface)] transition-[box-shadow,border-color,background-color,color] hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)] hover:shadow-[0_0_0_1px_var(--primary-ring-soft),0_0_14px_var(--primary-ring-soft)] focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--primary-ring-strong),0_0_16px_var(--primary-ring-soft)]"
                            aria-label={`View schedule for ${formatClassGroupLabel(group.groupCode)}`}
                            title="View schedule"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span>{formatClassGroupLabel(group.groupCode)}</span>
                              {group.scheduleType === "daytime"
                                ? <SunIcon className="h-4 w-4 text-[var(--primary)]" />
                                : <MoonIcon className="h-4 w-4 text-[var(--on-surface-variant)]" />}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {!loadingClasses && activeSemesterId !== null && classes.length === 0 ? (
                      <div className="mt-2 border-2 border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                        No classes found for this course under the selected semester filter.
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(scheduleGroup)}
        title={scheduleGroup ? formatClassScheduleTitle(formatClassGroupLabel(scheduleGroup.groupCode), scheduleGroup.events) : "Class Schedule"}
        headerIcon={<CalendarWeekIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />}
        onClose={() => setScheduleGroup(null)}
        maxWidthClassName="max-w-2xl"
        showCloseButton
      >
        {scheduleGroup ? (
          <ClassScheduleModalContent
            courseCode={scheduleGroup.courseCode}
            courseName={scheduleGroup.courseName}
            events={scheduleGroup.events}
            selectedSemesterId={activeSemesterId ?? undefined}
            showViewCourseButton={false}
          />
        ) : null}
      </Modal>
    </>
  );
}

function CourseFacts({ course, className }: { course: CourseRecord; className: string })
{
  return (
    <div className={`app-aero-panel course-detail-facts grid-cols-1 sm:grid-cols-3 ${className}`}>
      <DetailStat icon={<BookIcon className="h-5 w-5" />} label="Credit Units" value={`${course.creditUnits?.toFixed(1) ?? "0.0"} CU`} />
      <DetailStat icon={<LayersIcon className="h-5 w-5" />} label="Course Level" value={course.courseLevel ?? "Level unavailable"} />
      <DetailStat icon={<SchoolIcon className="h-5 w-5" />} label="Academic Track" value={course.isPostgraduate ? "Postgraduate" : "Undergraduate"} />
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: ReactNode; label: string; value: string })
{
  return (
    <div className="course-detail-stat min-w-0">
      <div className="app-aero-panel-heading course-detail-stat__header">
        <span className="shrink-0 text-[var(--primary)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 text-[9px] font-bold uppercase leading-3 tracking-[0.04em] text-[var(--on-surface)] sm:text-[11px] sm:leading-4 sm:tracking-[0.08em]">{label}</span>
      </div>
      <div className="course-detail-stat__value flex min-h-11 min-w-0 items-center break-words px-2 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] sm:px-3 sm:text-[18px] sm:leading-6">{value}</div>
    </div>
  );
}
