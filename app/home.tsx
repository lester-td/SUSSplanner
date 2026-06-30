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

const mainPages = [
  {
    title: "Timetable",
    description: "Plan your schedule with a visual timetable and catch clashes early. Sync with your calendar or export to PDF for easy access.",
    href: "/timetable",
    icon: CalendarWeekIcon,
    tone: "bg-[var(--primary)] text-on-primary",
  },
  {
    title: "Courses",
    description: "Search course details, assessments, offered semesters, and available class groups before adding modules to a plan.",
    href: "/courses",
    icon: BookIcon,
    tone: "bg-[var(--accent)] text-white",
  },
  {
    title: "Planner",
    description: "Arrange courses across semesters and track your degree progress.",
    href: "/planner",
    icon: LayersIcon,
    tone: "bg-[var(--suss-light-blue)] text-[var(--on-surface)]",
  },
  {
    title: "Calculators",
    description: "Estimate your GPA based on your current grades and plan for the future by simulating different grade outcomes.",
    href: "/calculators",
    icon: CalculatorIcon,
    tone: "bg-[var(--suss-lime)] text-[var(--on-surface)]",
  },
  {
    title: "Settings",
    description: "Tune the app appearance, timetable defaults, and reminder preferences.",
    href: "/settings",
    icon: SettingsIcon,
    tone: "bg-[var(--surface-container-high)] text-[var(--primary)]",
  },
] as const;

const usefulLinks = [
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
      <div className="home-page grid gap-6 sm:gap-8">
        <section className="pt-1 sm:pt-2">
          <p className="max-w-3xl text-[24px] font-bold leading-[1.15] tracking-[-0.045em] text-[var(--on-surface)] sm:text-[32px] lg:text-[40px]">
            Create your semester timetable, browse available courses, and plan your academic journey.
          </p>
        </section>

        <section aria-label="Main pages">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {mainPages.map((area) => {
              const Icon = area.icon;

              return (
                <Link
                  key={area.href}
                  prefetch
                  href={area.href}
                  className="home-feature-card group flex min-h-[9.5rem] cursor-pointer flex-col rounded-[1.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:shadow-[var(--shadow-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:min-h-[12rem] sm:p-5"
                >
                  <div className={`home-feature-icon flex h-10 w-10 items-center justify-center rounded-[1rem] ${area.tone} transition-transform group-hover:scale-105 sm:h-11 sm:w-11`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <h3 className="mt-4 text-[16px] font-bold leading-6 tracking-[-0.035em] text-[var(--on-surface)] transition-colors group-hover:text-[var(--primary)] sm:text-[20px]">
                    {area.title}
                  </h3>
                  <p className="mt-2 hidden flex-1 text-[14px] leading-6 text-[var(--on-surface-variant)] sm:block">
                    {area.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="portal-links" aria-labelledby="useful-links" className="px-0">
          <h2 id="useful-links" className="text-[20px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)] sm:text-[24px]">
            Useful Links
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {usefulLinks.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  <span className="home-shortcut-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.8rem] bg-[var(--brand-chip-bg)] text-[var(--primary)] transition-transform group-hover:scale-105 sm:h-9 sm:w-9">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left leading-5">{item.label}</span>
                </>
              );
              const className = "home-shortcut-card group flex min-h-[3.5rem] items-center gap-2.5 rounded-[1rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-[13px] font-semibold text-[var(--on-surface)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:px-4 sm:py-3";

              if (item.href.startsWith("/"))
              {
                return (
                  <Link
                    key={item.label}
                    prefetch
                    href={item.href}
                    className={className}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <a
                  key={item.label}
                  href={item.href}
                  aria-label={`${item.label} placeholder link`}
                  className={className}
                >
                  {content}
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
