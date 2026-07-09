import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { HomeSearch, type HomeSearchItem } from "@/components/layout/home-search";
import {
  ArrowUpRightIcon,
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  EditIcon,
  HomeIcon,
  LayersIcon,
  MailIcon,
} from "@/components/planner/icons";
import {
  getLatestDataUpdatedAt,
  getSemestersWithWeeks,
  getUpcomingAcademicCalendarEvents,
  type AcademicCalendarEventRecord,
} from "@/lib/db/queries";
import { homeQuickResources, studentResources } from "@/lib/student-resources";
import {
  buildWeekLabel,
  formatCompactDate,
  formatDateRange,
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

const heroQuickActions = [
  {
    label: "Plan Timetable",
    href: "/timetable",
    icon: CalendarWeekIcon,
  },
  {
    label: "Find Courses",
    href: "/courses",
    icon: BookIcon,
  },
  {
    label: "Calculate GPA",
    href: "/calculators",
    icon: CalculatorIcon,
  },
  {
    label: "Open Planner",
    href: "/planner",
    icon: LayersIcon,
  },
] as const;

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

const audienceLabels: Record<AcademicCalendarEventRecord["audience"], string> = {
  FTUG: "Full-time UG",
  PTUG: "Part-time UG",
  LAW: "Law",
  GRAD: "Graduate",
};
const audienceSortOrder = new Map(Object.values(audienceLabels).map((label, index) => [label, index]));

type UpcomingDateItem = {
  label: string;
  detail: string;
  date: string;
  startDate: string;
  endDate: string;
  audiences?: string[];
};

function formatUpcomingCalendarDate(event: Pick<AcademicCalendarEventRecord, "startDate" | "endDate">)
{
  if (event.startDate === event.endDate)
  {
    return formatCompactDate(event.startDate);
  }

  return formatDateRange(event.startDate, event.endDate);
}

function getSemesterScopeLabel(event: AcademicCalendarEventRecord)
{
  if (event.semesters.length === 0)
  {
    return event.eventCategory === "ceremony" ? "Annual" : "Semester not linked";
  }

  return event.semesters
    .toSorted((left, right) => left.academicYear.localeCompare(right.academicYear) || left.semesterNo - right.semesterNo)
    .map((semester) => semester.semesterName)
    .join(", ");
}

function getUpcomingCalendarDates(calendarEvents: AcademicCalendarEventRecord[]): UpcomingDateItem[]
{
  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, {
    label: string;
    startDate: string;
    endDate: string;
    status: AcademicCalendarEventRecord["status"];
    sortOrder: number;
    audiences: Set<string>;
    semesterScopes: Set<string>;
  }>();

  for (const event of calendarEvents)
  {
    const key = [
      event.eventTitle,
      event.startDate,
      event.endDate,
      event.status,
    ].join("\u0000");
    const existing = groups.get(key);
    const group = existing ?? {
      label: event.eventTitle,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      sortOrder: event.sortOrder,
      audiences: new Set<string>(),
      semesterScopes: new Set<string>(),
    };

    group.audiences.add(audienceLabels[event.audience]);
    group.semesterScopes.add(getSemesterScopeLabel(event));
    group.sortOrder = Math.min(group.sortOrder, event.sortOrder);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((left, right) => {
      const leftSortDate = left.startDate < today ? today : left.startDate;
      const rightSortDate = right.startDate < today ? today : right.startDate;

      return leftSortDate.localeCompare(rightSortDate)
        || left.sortOrder - right.sortOrder
        || left.label.localeCompare(right.label);
    })
    .slice(0, 6)
    .map((group): UpcomingDateItem => {
      const scopes = [...group.semesterScopes].sort((left, right) => left.localeCompare(right));
      const audiences = [...group.audiences].sort((left, right) => (
        (audienceSortOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (audienceSortOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      ));

      return {
        label: group.status === "tentative" ? `${group.label} (TBC)` : group.label,
        detail: scopes.join(", "),
        date: formatUpcomingCalendarDate(group),
        startDate: group.startDate,
        endDate: group.endDate,
        audiences,
      };
    });
}

function getUpcomingSemesterDates(
  semesterTree: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>,
  currentSemesterContext: CurrentSemesterContext,
): UpcomingDateItem[]
{
  const today = new Date().toISOString().slice(0, 10);
  const allWeeks = semesterTree
    .flatMap((semester) => semester.weeks.map((week) => ({ semester, week })))
    .sort((left, right) => left.week.startDate.localeCompare(right.week.startDate));
  const items: Array<{
    label: string;
    detail: string;
    date: string;
    startDate: string;
    endDate: string;
  }> = [];

  if (currentSemesterContext.semester && currentSemesterContext.week && today <= currentSemesterContext.week.endDate)
  {
    items.push({
      label: `${buildWeekLabel(currentSemesterContext.week)} ends`,
      detail: `${currentSemesterContext.semester.semesterName}, AY${currentSemesterContext.semester.academicYear}`,
      date: formatCompactDate(currentSemesterContext.week.endDate),
      startDate: currentSemesterContext.week.endDate,
      endDate: currentSemesterContext.week.endDate,
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
      startDate: week.startDate,
      endDate: week.startDate,
    });

    if (items.length >= 6)
    {
      break;
    }
  }

  return items.slice(0, 6);
}

function getUpcomingDates(
  calendarEvents: AcademicCalendarEventRecord[],
  semesterTree: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>,
  currentSemesterContext: CurrentSemesterContext,
): UpcomingDateItem[]
{
  const calendarDates = getUpcomingCalendarDates(calendarEvents);

  return calendarDates.length > 0
    ? calendarDates
    : getUpcomingSemesterDates(semesterTree, currentSemesterContext);
}

export default async function HomePage()
{
  const [semesterTree, latestDataUpdatedAt, academicCalendarEvents] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
    getUpcomingAcademicCalendarEvents(),
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
  const upcomingDates = getUpcomingDates(academicCalendarEvents, semesterTree, currentSemesterContext);
  const disclaimerSection = (
    <section
      className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm"
      aria-labelledby="home-disclaimer"
    >
      <h2 id="home-disclaimer" className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)]">
        Disclaimer
      </h2>
      <p className="mt-3 text-[12px] leading-5 text-[var(--on-surface-variant)]">
        SUSS Planner is currently in beta. Please cross-reference official materials for critical academic decisions.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-[var(--on-surface-variant)]">
        If classes or schedules have changed since the last update, refer to the SUSS Backpack app or Canvas LMS for the latest official information.
      </p>
      <div className="mt-4 border-t border-[var(--outline-variant)] pt-3">
        <p className="text-[12px] font-semibold leading-5 text-[var(--on-surface)]">
          Data last updated: {formatDataUpdatedValue(latestDataUpdatedAt)}
        </p>
      </div>
    </section>
  );
  const quickLinksSection = (
    <section
      id="portal-links"
      aria-labelledby="quick-links"
      className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm"
    >
      <h2 id="quick-links" className="text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--on-surface)]">
        Quick Links
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
        {homeQuickResources.map((item) => {
          const Icon = homeQuickResourceIcons[item.id];
          const content = (
            <>
              <span className="home-shortcut-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.5rem] bg-[var(--brand-chip-bg)] text-[var(--primary)] transition-transform group-hover:scale-105">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-left leading-5">{item.label}</span>
              {!item.href.startsWith("/") ? (
                <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--on-surface-variant)] transition-colors group-hover:text-[var(--primary)]" />
              ) : null}
            </>
          );
          const className = "home-shortcut-card group flex min-h-[3rem] items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-2 text-[12px] font-semibold text-[var(--on-surface)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]";

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
  );
  const upcomingDatesSection = (
    <section aria-labelledby="upcoming-dates">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="upcoming-dates" className="text-[17px] font-bold leading-6 tracking-[-0.03em] text-[var(--on-surface)] sm:text-[24px] sm:leading-7 sm:tracking-[-0.035em]">
            Upcoming Dates
          </h2>
        </div>
      </div>

      <div className="mt-3 sm:mt-4">
        {upcomingDates.length > 0 ? (
          <ol className="relative divide-y divide-[color-mix(in_srgb,var(--on-surface),transparent_94%)] before:absolute before:bottom-1.5 before:left-2 before:top-1.5 before:hidden before:w-px before:bg-[color-mix(in_srgb,var(--brand-divider),transparent_60%)] sm:space-y-5 sm:divide-y-0 sm:before:block sm:before:bottom-2 sm:before:left-[0.625rem] sm:before:top-2">
            {upcomingDates.map((item) => (
              <li key={`${item.label}-${item.detail}-${item.date}`} className="relative py-3 first:pt-0 last:pb-0 sm:py-0 sm:pl-9">
                <span className="absolute left-0 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface-container-lowest)] sm:flex sm:h-5 sm:w-5">
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)] sm:h-2.5 sm:w-2.5" />
                </span>

                <div className="sm:border-b sm:border-[color-mix(in_srgb,var(--outline-variant),transparent_65%)] sm:pb-5 sm:last:border-b-0 sm:last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:gap-x-3 sm:gap-y-1">
                    <p className="text-[12px] font-bold leading-4 text-[var(--primary)] sm:text-[14px] sm:leading-5">
                      {item.date}
                    </p>
                  </div>

                  <p className="mt-0.5 text-[13px] font-bold leading-5 text-[var(--on-surface)] sm:mt-1 sm:text-[15px] sm:leading-6">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--on-surface-variant)] sm:mt-1 sm:text-[12px] sm:leading-5">
                    {item.audiences && item.audiences.length > 0 ? `${item.audiences.join(" • ")} · ` : ""}
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[12px] leading-5 text-[var(--on-surface-variant)]">
            No upcoming academic calendar dates are loaded.
          </p>
        )}
      </div>
    </section>
  );

  return (
    <AppShell
      activeSection="home"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <div className="home-page grid gap-6 sm:gap-8">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start lg:gap-8 xl:gap-10">
          <div className="min-w-0">
            <section className="pt-1 sm:pt-2" aria-labelledby="home-hero-title">
              <div className="max-w-4xl">
                <h1 id="home-hero-title" className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[42px] sm:leading-[1.08] sm:tracking-[-0.045em] lg:text-[52px]">
                  Welcome to SUSS Planner.
                </h1>
                <p className="mt-2 max-w-2xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:mt-3 sm:text-[18px] sm:leading-7">
                  Find courses, timetable slots, calculators, portals, and key dates in one place.
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-5 sm:gap-2" aria-label="Quick actions">
                {heroQuickActions.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      prefetch
                      href={item.href}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-[11px] font-bold leading-4 text-[var(--on-surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)] sm:min-h-10 sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[12px]"
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-3 max-w-4xl sm:mt-4">
                <HomeSearch
                  items={searchItems}
                  placeholder="Search courses, pages, deadlines, portals..."
                  prominent
                  showSuggestionsOnEmpty={false}
                />
              </div>
            </section>

            <div className="mt-6 sm:mt-8">
              {upcomingDatesSection}
            </div>
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-24" aria-label="Home page utilities">
            {disclaimerSection}
            {quickLinksSection}

            <section className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-sm" aria-labelledby="feedback-cta">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.65rem] bg-[var(--accent-soft)] text-[var(--primary)]">
                  <EditIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="feedback-cta" className="text-[15px] font-bold leading-5 text-[var(--on-surface)]">
                    Improve the planner
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                    Report outdated data, broken links, or workflow issues.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      prefetch
                      href="/feedback"
                      className="inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[12px] font-bold leading-4 text-[var(--on-surface)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]"
                    >
                      <EditIcon className="h-4 w-4" />
                      Send feedback
                    </Link>
                    <a
                      href="https://github.com/Simplificatedd/SUSSplanner/issues"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[12px] font-bold leading-4 text-[var(--on-surface)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]"
                    >
                      GitHub Issues
                      <ArrowUpRightIcon className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
