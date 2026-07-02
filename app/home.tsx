import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { HomeSearch, type HomeSearchItem } from "@/components/layout/home-search";
import {
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  CalendarIcon,
  HomeIcon,
  SchoolIcon,
  SettingsIcon,
} from "@/components/planner/icons";
import { getLatestDataUpdatedAt, getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Home | SUSS Planner",
  description: "Start page for SUSS timetable, course, semester-planner, GPA, and school portal shortcuts.",
};

const appSearchItems = [
  {
    label: "Timetable",
    description: "Plan your schedule with a visual timetable and catch clashes early. Sync with your calendar or export to PDF for easy access.",
    href: "/timetable",
    keywords: ["schedule", "classes", "calendar", "ics", "pdf"],
  },
  {
    label: "Courses",
    description: "Search course details, assessments, offered semesters, and available class groups before adding modules to a plan.",
    href: "/courses",
    keywords: ["modules", "course finder", "assessment", "school"],
  },
  {
    label: "Planner",
    description: "Arrange courses across semesters and track your degree progress.",
    href: "/planner",
    keywords: ["semester planner", "degree plan", "progress"],
  },
  {
    label: "Calculators",
    description: "Estimate your GPA based on your current grades and plan for the future by simulating different grade outcomes.",
    href: "/calculators",
    keywords: ["gpa", "ocas", "grades"],
  },
  {
    label: "Settings",
    description: "Tune the app appearance, timetable defaults, and reminder preferences.",
    href: "/settings",
    keywords: ["theme", "appearance", "preferences"],
  },
] as const satisfies readonly HomeSearchItem[];

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

function formatDataUpdatedAt(value: Date | string | null)
{
  if (!value)
  {
    return "Data last updated: Unavailable";
  }

  const updatedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(updatedAt.getTime()))
  {
    return "Data last updated: Unavailable";
  }

  const formattedDate = new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(updatedAt);

  return `Data last updated: ${formattedDate} SGT`;
}

export default async function HomePage()
{
  const [semesterTree, latestDataUpdatedAt] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );
  const searchItems = [
    ...appSearchItems,
    ...usefulLinks.map((item) => ({
      label: item.label,
      description: "Useful student link",
      href: item.href === "#" ? "#portal-links" : item.href,
      keywords: ["useful link", "student link"],
    })),
  ] satisfies HomeSearchItem[];

  return (
    <AppShell activeSection="home" currentSemesterContext={currentSemesterContext} showFooter={true}>
      <div className="home-page grid gap-6 sm:gap-8">
        <section className="pt-1 sm:pt-2">
          <p className="max-w-3xl text-[24px] font-bold leading-[1.15] tracking-[-0.045em] text-[var(--on-surface)] sm:text-[32px] lg:text-[40px]">
            Welcome to SUSS Planner.
          </p>

          <div className="mt-8 grid gap-3">
            <p className="text-[16px] font-semibold leading-6 text-[var(--on-surface)] sm:text-[18px]">
              What would you like to do today?
            </p>
            <HomeSearch items={searchItems} />
          </div>

          <div className="mt-5 max-w-3xl text-[12px] leading-5 text-[var(--on-surface-variant)] sm:text-[13px]">
            <p>
              This is a student developed web application in beta phase. The information is provided with absolutely no warranties, although it has been checked to the best of our ability.
            </p>
            <p className="mt-1 font-semibold text-[var(--on-surface)]">
              {formatDataUpdatedAt(latestDataUpdatedAt)}
            </p>
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
