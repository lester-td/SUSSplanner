import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import {
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  CalendarIcon,
  HomeIcon,
  LayersIcon,
  SchoolIcon,
  SettingsIcon,
} from "@/components/planner/icons";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Home | SUSS Planner",
  description: "Start page for SUSS timetable, course, semester-planner, GPA, and school portal shortcuts.",
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
    tone: "bg-[var(--suss-light-blue)] text-[var(--on-surface)]",
  },
  {
    title: "Calculators",
    eyebrow: "GPA estimate",
    description: "Estimate your GPA based on your current grades and plan for the future by simulating different grade outcomes.",
    href: "/calculators",
    icon: CalculatorIcon,
    tone: "bg-[var(--suss-lime)] text-[var(--on-surface)]",
  },
] as const;

const portalLinks = [
  {
    label: "Student Portal",
    href: "#",
    icon: HomeIcon,
  },
  {
    label: "Canvas / LMS",
    href: "#",
    icon: BookIcon,
  },
  {
    label: "eServices",
    href: "#",
    icon: SettingsIcon,
  },
  {
    label: "Academic Calendar",
    href: "#",
    icon: CalendarIcon,
  },
  {
    label: "Exam Timetable",
    href: "#",
    icon: CalendarWeekIcon,
  },
  {
    label: "Library",
    href: "#",
    icon: BookIcon,
  },
  {
    label: "Student Support",
    href: "#",
    icon: SchoolIcon,
  },
  {
    label: "Fees & Payments",
    href: "#",
    icon: CalculatorIcon,
  },
] as const;

export default async function HomePage()
{
  const semesterTree = await getSemestersWithWeeks();
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="home" currentSemesterContext={currentSemesterContext} showFooter={true} showNav={false}>
      <div className="px-3 pb-3 pt-8 md:px-[16px]">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <section className="w-full">
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
                  className="group flex min-h-[13rem] cursor-pointer flex-col rounded-[1.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:shadow-[var(--shadow-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-[1rem] ${area.tone} transition-transform group-hover:scale-105`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-[22px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)] transition-colors group-hover:text-[var(--primary)]">
                    {area.title}
                  </h2>
                  <p className="mt-2 flex-1 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                    {area.description}
                  </p>
                </Link>
              );
            })}
          </section>

          <section id="portal-links" className="px-0">
            <h2 className="mt-2 text-[24px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)]">
              Useful Links
            </h2>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {portalLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    aria-label={`${item.label} placeholder link`}
                    className="group flex items-center gap-3 rounded-[1rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-[14px] font-bold text-[var(--on-surface)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] bg-[var(--brand-chip-bg)] text-[var(--primary)] transition-transform group-hover:scale-105">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                  </a>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
