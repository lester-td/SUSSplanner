import Link from "next/link";

import type { CourseSearchResult, SemesterRecord } from "@/lib/timetable/types";

type Filters = {
  q: string;
  semesterId?: number;
  scheduleType?: "daytime" | "evening";
  postgraduate: "all" | "undergraduate" | "postgraduate";
  school?: string;
  courseLevel?: string;
};

export function CourseSearchPage({
  semesters,
  schools,
  courseLevels,
  filters,
  results,
}: {
  semesters: SemesterRecord[];
  schools: string[];
  courseLevels: string[];
  filters: Filters;
  results: CourseSearchResult[];
})
{
  return (
    <div className="px-4 py-6 md:px-[16px]">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[var(--on-surface)]">Course Search</h1>
          <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">
            Search the live course catalog from the existing Supabase database and filter by semester, schedule, school, and level.
          </p>

          <form className="mt-5 grid gap-3 md:grid-cols-6" action="/courses" method="get">
            <label className="md:col-span-2">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">Search</span>
              <input
                type="text"
                name="q"
                defaultValue={filters.q}
                placeholder="Course code or name"
                className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
            </label>

            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">Semester</span>
              <select name="semesterId" defaultValue={filters.semesterId ? String(filters.semesterId) : ""} className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">Any</option>
                {semesters.map((semester) => (
                  <option key={semester.semesterId} value={semester.semesterId}>
                    {semester.semesterName} ({semester.academicYear})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">Schedule</span>
              <select name="scheduleType" defaultValue={filters.scheduleType ?? ""} className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">Any</option>
                <option value="daytime">Daytime</option>
                <option value="evening">Evening</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">Level</span>
              <select name="courseLevel" defaultValue={filters.courseLevel ?? ""} className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">Any</option>
                {courseLevels.map((courseLevel) => (
                  <option key={courseLevel} value={courseLevel}>{courseLevel}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">Postgraduate</span>
              <select name="postgraduate" defaultValue={filters.postgraduate} className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]">
                <option value="all">All</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="postgraduate">Postgraduate</option>
              </select>
            </label>

            <label className="md:col-span-3">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-tight text-[var(--on-surface-variant)]">School</span>
              <select name="school" defaultValue={filters.school ?? ""} className="w-full rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[14px] leading-5 text-[var(--on-surface)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">Any</option>
                {schools.map((school) => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2 md:col-span-3">
              <button type="submit" className="rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]">
                Search
              </button>
              <Link href="/courses" className="rounded-[0.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]">
                Clear
              </Link>
            </div>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((course) => (
            <article key={course.courseCode} className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold leading-6 text-[var(--on-surface)]">{course.courseCode}</h2>
                  <p className="mt-1 text-[14px] leading-5 text-[var(--on-surface-variant)]">{course.courseName ?? "Untitled course"}</p>
                </div>
                <span className={`rounded-[999px] px-2 py-1 text-[10px] font-semibold uppercase tracking-tight ${course.hasAvailableClasses ? "bg-[var(--primary-fixed)] text-[var(--primary)]" : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"}`}>
                  {course.hasAvailableClasses ? `${course.availableClassCount} groups` : "No groups"}
                </span>
              </div>

              <div className="mt-4 space-y-1 text-[12px] leading-4 text-[var(--on-surface-variant)]">
                <p>{course.schoolName ?? "School unavailable"}</p>
                <p>{course.courseLevel ?? "Level unavailable"} · {course.isPostgraduate ? "Postgraduate" : "Undergraduate"}</p>
                <p>{course.creditUnits?.toFixed(1) ?? "0.0"} CU · {course.presentationPattern ?? "Pattern unavailable"}</p>
              </div>

              <div className="mt-5 flex gap-2">
                <Link href={`/courses/${course.courseCode}`} className="rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]">
                  View details
                </Link>
                <Link href={`/planner`} className="rounded-[0.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]">
                  Open planner
                </Link>
              </div>
            </article>
          ))}

          {results.length === 0 ? (
            <div className="rounded-[0.75rem] border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-8 text-[14px] leading-5 text-[var(--on-surface-variant)] md:col-span-2 xl:col-span-3">
              No courses matched the current filters.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
