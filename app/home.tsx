import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { HomeSearch, type HomeSearchItem } from "@/components/layout/home-search";
import {
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  EditIcon,
  HomeIcon,
  MailIcon,
  SettingsIcon,
} from "@/components/planner/icons";
import { getHomePageDataCoverage, getLatestDataUpdatedAt, getSemestersWithWeeks } from "@/lib/db/queries";
import { homeQuickResources, studentResources } from "@/lib/student-resources";
import {
  buildWeekLabel,
  formatCompactDate,
  getCurrentSemesterContext,
  type CurrentSemesterContext,
} from "@/lib/timetable/date-utils";
import type { SemesterRecord, SemesterWeekRecord } from "@/lib/timetable/types";

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

const homeQuickResourceIcons: Record<string, typeof BookIcon> = {
  "suss-portal": HomeIcon,
  canvas: BookIcon,
  mymail: MailIcon,
  istudyguide: BookIcon,
  "exam-timetable": CalendarWeekIcon,
  "discussion-room-booking": BookIcon,
} as const;

function formatDataUpdatedValue(value: Date | string | null)
{
  if (!value)
  {
    return "Unavailable";
  }

  const updatedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(updatedAt.getTime()))
  {
    return "Unavailable";
  }

  const formattedDate = new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(updatedAt);

  return `${formattedDate} SGT`;
}

function formatCount(value: number)
{
  return new Intl.NumberFormat("en-SG").format(value);
}

function getUpcomingDates(
  semesterTree: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>,
  currentSemesterContext: CurrentSemesterContext,
)
{
  const today = new Date().toISOString().slice(0, 10);
  const allWeeks = semesterTree
    .flatMap((semester) => semester.weeks.map((week) => ({ semester, week })))
    .sort((left, right) => left.week.startDate.localeCompare(right.week.startDate));
  const items: Array<{
    label: string;
    detail: string;
    date: string;
  }> = [];

  if (currentSemesterContext.semester && currentSemesterContext.week && today <= currentSemesterContext.week.endDate)
  {
    items.push({
      label: `${buildWeekLabel(currentSemesterContext.week)} ends`,
      detail: `${currentSemesterContext.semester.semesterName}, AY${currentSemesterContext.semester.academicYear}`,
      date: formatCompactDate(currentSemesterContext.week.endDate),
    });
  }

  for (const { semester, week } of allWeeks)
  {
    if (week.startDate <= today)
    {
      continue;
    }

    const isSemesterStart = week.weekNo === 1 && week.weekType === "TEACHING";
    items.push({
      label: isSemesterStart ? "Semester begins" : `${buildWeekLabel(week)} starts`,
      detail: `${semester.semesterName}, AY${semester.academicYear}`,
      date: formatCompactDate(week.startDate),
    });

    if (items.length >= 3)
    {
      break;
    }
  }

  return items.slice(0, 3);
}

export default async function HomePage()
{
  const [semesterTree, latestDataUpdatedAt, dataCoverage] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
    getHomePageDataCoverage(),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );
  const searchItems = [
    ...appSearchItems,
    ...studentResources.map((resource) => ({
      label: resource.label,
      description: resource.description,
      href: resource.href,
      keywords: [
        resource.category,
        "student resource",
        "useful link",
        ...resource.keywords,
      ],
    })),
  ] satisfies HomeSearchItem[];
  const upcomingDates = getUpcomingDates(semesterTree, currentSemesterContext);

  return (
    <AppShell
      activeSection="home"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <div className="home-page grid gap-6 sm:gap-8">
        <section className="pt-1 sm:pt-2">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)] lg:items-start lg:gap-10 xl:gap-12">
            <div className="min-w-0">
              <p className="max-w-3xl text-[24px] font-bold leading-[1.15] tracking-[-0.045em] text-[var(--on-surface)] sm:text-[32px] lg:text-[40px]">
                Welcome to SUSS Planner.
              </p>

              <div className="mt-8 grid gap-3">
                <p className="text-[16px] font-semibold leading-6 text-[var(--on-surface)] sm:text-[18px]">
                  What would you like to do today?
                </p>
                <HomeSearch items={searchItems} />
              </div>

              <section id="portal-links" aria-labelledby="quick-links" className="mt-8">
                <h2 id="quick-links" className="text-[20px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)] sm:text-[24px]">
                  Quick Links
                </h2>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {homeQuickResources.map((item) => {
                    const Icon = homeQuickResourceIcons[item.id];
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
                        target="_blank"
                        rel="noreferrer"
                        className={className}
                      >
                        {content}
                      </a>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="grid gap-3" aria-label="Home page status">
              <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
                <h2 className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)]">
                  Announcement
                </h2>
                <p className="mt-3 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                  SUSS Planner is currently in beta. Please cross-reference official materials for critical academic decisions.
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                  If classes or schedules have changed since the last update, refer to the SUSS Backpack app or Canvas LMS for the latest official information.
                </p>
                <Link
                  prefetch
                  href="/feedback"
                  className="mt-4 inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[12px] font-bold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <EditIcon className="h-4 w-4" />
                  Send feedback
                </Link>
              </section>

              <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
                <h2 className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)]">
                  Catalogue
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[0.5rem] bg-[var(--surface-container-low)] px-3 py-2">
                    <p className="text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                      Courses
                    </p>
                    <p className="mt-1 text-[20px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)]">
                      {formatCount(dataCoverage.courseCount)}
                    </p>
                  </div>
                  <div className="rounded-[0.5rem] bg-[var(--surface-container-low)] px-3 py-2">
                    <p className="text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                      Classes
                    </p>
                    <p className="mt-1 text-[20px] font-bold leading-7 tracking-[-0.04em] text-[var(--on-surface)]">
                      {formatCount(dataCoverage.classCount)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 rounded-[0.5rem] bg-[var(--surface-container-low)] px-3 py-2">
                  <p className="text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)]">
                    Data Last Updated
                  </p>
                  <p className="mt-1 text-[13px] font-bold leading-5 text-[var(--on-surface)]">
                    {formatDataUpdatedValue(latestDataUpdatedAt)}
                  </p>
                </div>
              </section>

              <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm">
                <h2 className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)]">
                  Upcoming Dates
                </h2>
                <div className="mt-3 grid gap-2">
                  {upcomingDates.length > 0 ? upcomingDates.map((item) => (
                    <div key={`${item.label}-${item.detail}-${item.date}`} className="flex items-start justify-between gap-3 rounded-[0.5rem] bg-[var(--surface-container-low)] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold leading-5 text-[var(--on-surface)]">
                          {item.label}
                        </p>
                        <p className="truncate text-[11px] leading-4 text-[var(--on-surface-variant)]">
                          {item.detail}
                        </p>
                      </div>
                      <p className="shrink-0 text-[12px] font-bold leading-5 text-[var(--primary)]">
                        {item.date}
                      </p>
                    </div>
                  )) : (
                    <p className="text-[12px] leading-5 text-[var(--on-surface-variant)]">
                      No upcoming semester dates are loaded.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
