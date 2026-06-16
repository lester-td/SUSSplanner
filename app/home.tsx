import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import {
  ArrowUpRightIcon,
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  LayersIcon,
} from "@/components/planner/icons";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Home | SUSS Planner",
  description: "Start page for SUSS timetable, course, study-plan, GPA, and school portal shortcuts.",
};

const projectAreas = [
  {
    title: "Timetable",
    eyebrow: "Semester schedule",
    description: "Plan your schedule with a visual timetable and catch clashes early. Sync with your calendar or export to PDF for easy access.",
    href: "/timetable",
    icon: CalendarWeekIcon,
    tone: "bg-[var(--primary)] text-on-primary",
  },
  {
    title: "Courses",
    eyebrow: "Catalog search",
    description: "Search course details, assessments, offered semesters, and available class groups before adding modules to a plan.",
    href: "/courses",
    icon: BookIcon,
    tone: "bg-[var(--accent)] text-white",
  },
  {
    title: "Planner",
    eyebrow: "Degree map",
    description: "Arrange courses across semesters and track your degree progress.",
    href: "/planner",
    icon: LayersIcon,
    tone: "bg-[#143d8f] text-white",
  },
  {
    title: "Calculator",
    eyebrow: "GPA estimate",
    description: "Estimate your GPA based on your current grades and plan for the future by simulating different grade outcomes.",
    href: "/calculator",
    icon: CalculatorIcon,
    tone: "bg-[#203047] text-white",
  },
] as const;

const portalLinks = [
  "Student Portal",
  "Canvas / LMS",
  "eServices",
  "Academic Calendar",
  "Exam Timetable",
  "Library",
  "Student Support",
  "Fees & Payments",
] as const;

export default async function HomePage()
{
  const semesterTree = await getSemestersWithWeeks();
  const { semester, week } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="home" currentWeekLabel={getCurrentWeekChip(semester, week)} showFooter={true} showNav={false}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="max-w-4xl">
          <p className="text-[24px] font-bold leading-[1.15] tracking-[-0.045em] text-[var(--on-surface)] sm:text-[32px] lg:text-[40px]">
            Create your semester timetable, browse available courses, and plan your academic journey.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {projectAreas.map((area) => {
            const Icon = area.icon;

            return (
              <Link
                key={area.href}
                prefetch
                href={area.href}
                className="group flex min-h-[13rem] flex-col rounded-[1.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--brand-divider)] hover:shadow-[var(--shadow-elev-2)]"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-[1rem] ${area.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-[22px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)]">
                  {area.title}
                </h2>
                <p className="mt-2 flex-1 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                  {area.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--primary)]">
                  Open
                  <ArrowUpRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            );
          })}
        </section>

        <section id="portal-links" className="rounded-[1.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="mt-2 text-[24px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)]">
                Useful Links
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {portalLinks.map((label) => (
              <a
                key={label}
                href="#"
                aria-label={`${label} placeholder link`}
                className="group flex items-center justify-between gap-3 rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-[14px] font-bold text-[var(--on-surface)] transition hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                <span>{label}</span>
                <ArrowUpRightIcon className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
