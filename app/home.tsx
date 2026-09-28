import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import quotes from "@/app/quotes.json";
import {
  CompactUpcomingDates,
  type UpcomingDateAudience,
  type UpcomingDateItem,
  type UpcomingDateState,
} from "@/components/home/upcoming-dates";
import { AppWordmark } from "@/components/layout/app-wordmark";
import { AppShell } from "@/components/layout/app-shell";
import { HomeSearch, type HomeSearchItem } from "@/components/layout/home-search";
import {
  ArrowUpRightIcon,
  CalendarWeekIcon,
  EditIcon,
  LinkIcon,
} from "@/components/planner/icons";
import {
  getLatestDataUpdatedAt,
  getSemestersWithWeeks,
  getUpcomingAcademicCalendarEvents,
  type AcademicCalendarEventRecord,
} from "@/lib/data/metadata";
import { homeQuickResources, studentResources } from "@/lib/student-resources";
import {
  buildWeekLabel,
  formatCompactDate,
  formatCurrentWeekChipForMobile,
  formatDataUpdatedValue,
  getCurrentSemesterContext,
  getCurrentWeekChip,
  getSingaporeDateString,
  type CurrentSemesterContext,
} from "@/lib/timetable/date-utils";
import type { SemesterRecord, SemesterWeekRecord } from "@/lib/timetable/types";

export const metadata: Metadata = {
  title: "Home | SUSS Planner",
  description: "Start page for SUSS timetable, course, semester-planner, GPA, and school portal shortcuts.",
};

const appSearchItems = [
  {
    label: "Home",
    description: "Return to the SUSS Planner home page.",
    href: "/",
    keywords: ["home", "dashboard", "start"],
  },
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
  {
    label: "Feedback",
    description: "Report outdated data, broken links, or workflow issues.",
    href: "/feedback",
    keywords: ["feedback", "report", "issue", "bug", "suggestion", "help"],
  },
] as const satisfies readonly HomeSearchItem[];

const homeQuickResourceIcons: Record<string, string> = {
  "suss-eservices": "/home-icons/suss-eservices.png",
  mymail: "/home-icons/mymail.png",
  canvas: "/home-icons/canvas.png",
  learnova: "/home-icons/learnova.png",
  ismartguide: "/home-icons/ismartguide.png",
  library: "/home-icons/library.png",
  "discussion-room-booking": "/home-icons/discussion-room-booking.png",
  "success-gateway": "/home-icons/success-gateway.png",
} as const;

const audienceLabels: Record<AcademicCalendarEventRecord["audience"], UpcomingDateAudience> = {
  FTUG: { id: "FTUG", label: "Full-time UG" },
  PTUG: { id: "PTUG", label: "Part-time UG" },
  LAW: { id: "LAW", label: "Law" },
  GRAD: { id: "GRAD", label: "Graduate" },
};
const audienceSortOrder = new Map(Object.keys(audienceLabels).map((id, index) => [id, index]));
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DATE_NOTICE_WINDOW_MS = 7 * DAY_IN_MS;

function formatUpcomingCalendarDate(event: Pick<AcademicCalendarEventRecord, "startDate" | "endDate">)
{
  if (event.startDate === event.endDate)
  {
    return formatCompactDate(event.startDate);
  }

  const start = new Date(`${event.startDate}T00:00:00`);
  const end = new Date(`${event.endDate}T00:00:00`);
  const monthFormat = new Intl.DateTimeFormat("en-SG", { month: "short" });
  const dayFormat = new Intl.DateTimeFormat("en-SG", { day: "numeric" });
  const startMonth = monthFormat.format(start);
  const endMonth = monthFormat.format(end);
  const startDay = dayFormat.format(start);
  const endDay = dayFormat.format(end);

  return startMonth === endMonth
    ? `${startDay} – ${endDay} ${endMonth}`
    : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

function parseSingaporeDateStart(date: string)
{
  const timestamp = Date.parse(`${date}T00:00:00+08:00`);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getUpcomingDateDotState(startDate: string, endDate: string, now: Date): UpcomingDateState
{
  const startTimestamp = parseSingaporeDateStart(startDate);
  const endTimestamp = parseSingaporeDateStart(endDate);

  if (startTimestamp === null || endTimestamp === null)
  {
    return "default";
  }

  const nowTimestamp = now.getTime();
  const endExclusiveTimestamp = endTimestamp + DAY_IN_MS;

  if (nowTimestamp < startTimestamp - UPCOMING_DATE_NOTICE_WINDOW_MS || nowTimestamp >= endExclusiveTimestamp)
  {
    return "default";
  }

  if (nowTimestamp < startTimestamp)
  {
    return "upcoming";
  }

  return "open";
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

function getUpcomingCalendarDates(
  calendarEvents: AcademicCalendarEventRecord[],
  today = getSingaporeDateString(),
  now = new Date(),
): UpcomingDateItem[]
{
  const groups = new Map<string, {
    detail: string;
    endDate: string;
    label: string;
    schedules: Map<string, {
      audiences: Map<UpcomingDateAudience["id"], UpcomingDateAudience>;
      endDate: string;
      startDate: string;
    }>;
    sortOrder: number;
    startDate: string;
    status: AcademicCalendarEventRecord["status"];
  }>();

  for (const event of calendarEvents)
  {
    const detail = getSemesterScopeLabel(event);
    const key = [event.eventTitle, event.calendarYear, detail, event.status].join("\u0000");
    const existing = groups.get(key);
    const group = existing ?? {
      detail,
      endDate: event.endDate,
      label: event.eventTitle,
      schedules: new Map(),
      sortOrder: event.sortOrder,
      startDate: event.startDate,
      status: event.status,
    };
    const scheduleKey = `${event.startDate}\u0000${event.endDate}`;
    const schedule = group.schedules.get(scheduleKey) ?? {
      audiences: new Map(),
      endDate: event.endDate,
      startDate: event.startDate,
    };

    schedule.audiences.set(event.audience, audienceLabels[event.audience]);
    group.schedules.set(scheduleKey, schedule);
    group.startDate = event.startDate < group.startDate ? event.startDate : group.startDate;
    group.endDate = event.endDate > group.endDate ? event.endDate : group.endDate;
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
    .map((group): UpcomingDateItem => ({
      detail: group.detail,
      endDate: group.endDate,
      label: group.status === "tentative" ? `${group.label} (TBC)` : group.label,
      schedules: [...group.schedules.values()]
        .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate))
        .map((schedule) => ({
          audiences: [...schedule.audiences.values()].sort((left, right) => (
            (audienceSortOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
            - (audienceSortOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
          )),
          date: formatUpcomingCalendarDate(schedule),
          dotState: getUpcomingDateDotState(schedule.startDate, schedule.endDate, now),
          endDate: schedule.endDate,
          startDate: schedule.startDate,
        })),
      startDate: group.startDate,
    }));
}

function getUpcomingSemesterDates(
  semesterTree: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>,
  currentSemesterContext: CurrentSemesterContext,
  today = getSingaporeDateString(),
  now = new Date(),
): UpcomingDateItem[]
{
  const allWeeks = semesterTree
    .flatMap((semester) => semester.weeks.map((week) => ({ semester, week })))
    .sort((left, right) => left.week.startDate.localeCompare(right.week.startDate));
  const items: UpcomingDateItem[] = [];

  if (currentSemesterContext.semester && currentSemesterContext.week && today <= currentSemesterContext.week.endDate)
  {
    items.push({
      label: `${buildWeekLabel(currentSemesterContext.week)} ends`,
      detail: `${currentSemesterContext.semester.semesterName}, AY${currentSemesterContext.semester.academicYear}`,
      startDate: currentSemesterContext.week.endDate,
      endDate: currentSemesterContext.week.endDate,
      schedules: [{
        audiences: [],
        date: formatCompactDate(currentSemesterContext.week.endDate),
        dotState: getUpcomingDateDotState(currentSemesterContext.week.endDate, currentSemesterContext.week.endDate, now),
        startDate: currentSemesterContext.week.endDate,
        endDate: currentSemesterContext.week.endDate,
      }],
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
      startDate: week.startDate,
      endDate: week.startDate,
      schedules: [{
        audiences: [],
        date: formatCompactDate(week.startDate),
        dotState: getUpcomingDateDotState(week.startDate, week.startDate, now),
        startDate: week.startDate,
        endDate: week.startDate,
      }],
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
  today = getSingaporeDateString(),
  now = new Date(),
): UpcomingDateItem[]
{
  const calendarDates = getUpcomingCalendarDates(calendarEvents, today, now);
  const dates = calendarDates.length > 0
    ? calendarDates
    : getUpcomingSemesterDates(semesterTree, currentSemesterContext, today, now);
  const horizonEnd = new Date(`${today}T00:00:00Z`);
  horizonEnd.setUTCMonth(horizonEnd.getUTCMonth() + 3);
  const horizonEndDate = horizonEnd.toISOString().slice(0, 10);

  return dates.flatMap((item): UpcomingDateItem[] => {
    const schedules = item.schedules.filter((schedule) => schedule.startDate <= horizonEndDate);

    if (schedules.length === 0)
    {
      return [];
    }

    return [{
      ...item,
      schedules,
      startDate: schedules[0].startDate,
      endDate: schedules.reduce((latest, schedule) => schedule.endDate > latest ? schedule.endDate : latest, schedules[0].endDate),
    }];
  });
}

function getQuoteOfTheDay(today: string)
{
  const dateHash = [...today].reduce((hash, character) => (
    ((hash * 31) + character.charCodeAt(0)) >>> 0
  ), 0);

  return quotes[dateHash % quotes.length]?.quote
    ?? "A clear plan turns a crowded week into a sequence of possible steps.";
}

export default async function HomePage()
{
  const now = new Date();
  const today = getSingaporeDateString(now);
  const [semesterTree, latestDataUpdatedAt, academicCalendarEvents] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
    getUpcomingAcademicCalendarEvents(today),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
    now,
  );
  const currentWeekLabel = formatCurrentWeekChipForMobile(getCurrentWeekChip(
    currentSemesterContext.semester,
    currentSemesterContext.week,
    currentSemesterContext.isVacation,
  ));
  const upcomingDates = getUpcomingDates(academicCalendarEvents, semesterTree, currentSemesterContext, today, now);
  const searchItems = [
    ...appSearchItems,
    ...upcomingDates.map((item, index) => ({
      label: item.label,
      description: [
        item.schedules.map((schedule) => schedule.date).join(" / "),
        [...new Set(item.schedules.flatMap((schedule) => schedule.audiences.map((audience) => audience.label)))].join(" • "),
        item.detail,
      ].filter(Boolean).join(" · "),
      href: `/#upcoming-date-${index + 1}`,
      keywords: [
        "upcoming date",
        "academic calendar",
        ...item.schedules.map((schedule) => schedule.date),
        item.detail,
        ...item.schedules.flatMap((schedule) => schedule.audiences.map((audience) => audience.label)),
      ],
    })),
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
  const quoteOfTheDay = getQuoteOfTheDay(today);
  function renderQuickLinksSection()
  {
    return (
      <section id="portal-links" aria-labelledby="quick-links" className="home-aero-panel relative z-10 overflow-hidden">
        <div className="home-aero-panel-heading">
          <LinkIcon className="h-5 w-5 text-[var(--primary)]" />
          <h2 id="quick-links" className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">
            Quick Links
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-3 sm:gap-3 sm:p-4 lg:grid-cols-4">
          {homeQuickResources.map((item) => {
            const iconSrc = homeQuickResourceIcons[item.id];
            const content = (
              <>
                <span className="home-aero-shortcut-icon flex h-8 w-8 items-center justify-center sm:h-12 sm:w-12">
                  <Image
                    src={iconSrc}
                    alt=""
                    width={96}
                    height={96}
                    sizes="72px"
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-1 sm:gap-2">
                  <span className="min-w-0 break-words text-left text-[11px] font-bold leading-[0.9rem] sm:text-[13px] sm:leading-5">
                    {item.label}
                  </span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--primary)] transition group-hover:translate-x-0.5 sm:h-6 sm:w-6">
                    <ArrowUpRightIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </span>
                </span>
              </>
            );
            const className = "home-aero-shortcut group flex min-h-[4rem] items-center gap-1.5 rounded-[0.9rem] border px-2 py-2 text-[var(--on-surface)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)] sm:min-h-[4.75rem] sm:gap-3 sm:px-3.5 sm:py-3";

            if (item.href.startsWith("/"))
            {
              return (
                <Link key={item.label} prefetch href={item.href} className={className}>
                  {content}
                </Link>
              );
            }

            return (
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer" className={className}>
                {content}
              </a>
            );
          })}
        </div>
      </section>
    );
  }

  function renderUpcomingDatesSection()
  {
    return (
      <section className="home-aero-panel h-full overflow-hidden" aria-labelledby="upcoming-dates">
        <div className="home-aero-panel-heading">
          <CalendarWeekIcon className="h-5 w-5 text-[var(--primary)]" />
          <h2 id="upcoming-dates" className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">
            Upcoming Dates
          </h2>
        </div>

        {upcomingDates.length > 0 ? (
          <CompactUpcomingDates items={upcomingDates} today={today} />
        ) : (
          <div className="px-3 py-1 sm:px-4 sm:py-2">
            <p className="px-1 py-8 text-[12px] leading-5 text-[var(--on-surface-variant)]">
              No upcoming academic calendar dates are loaded.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <AppShell
      activeSection="home"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
      contentFrameClassName="home-aero-frame"
      showFooter={false}
    >
      <div className="home-page grid gap-4 sm:gap-5 lg:gap-6">
        <section className="home-aero-hero relative" aria-labelledby="home-hero-title">
          <div className="home-aero-hero-copy relative z-20 flex min-w-0 flex-col justify-center px-1 py-5 sm:px-2 sm:py-6 lg:min-h-[20rem] lg:w-[53%] lg:py-8">
            <h1 id="home-hero-title" className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 text-[27px] font-extrabold leading-[1.08] tracking-[-0.04em] text-[var(--on-surface)] sm:text-[34px] lg:text-[38px]">
              <span>Welcome to</span>
              <AppWordmark
                appearance="adaptive"
                className="h-10 gap-2.5 sm:h-12 lg:h-14"
                iconPosition="right"
                size="hero"
              />
            </h1>

            <blockquote className="home-aero-quote mt-4 max-w-2xl border-l-2 border-[var(--secondary)] pl-4 text-[15px] font-medium italic leading-6 text-[var(--on-surface-variant)] sm:mt-5 sm:text-[17px] sm:leading-7">
              <span className="mb-2 flex items-center justify-between gap-3 not-italic">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">Quote of the day</span>
                <span className="home-current-week-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 shadow-sm backdrop-blur sm:text-[12px] xl:hidden">
                  <CalendarWeekIcon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                  {currentWeekLabel}
                </span>
              </span>
              “{quoteOfTheDay}”
            </blockquote>

            <div className="mt-4 max-w-2xl sm:mt-5">
              <HomeSearch
                items={searchItems}
                placeholder="Search anything..."
                prominent
                showSuggestionsOnEmpty={false}
              />
            </div>
          </div>

          <div className="home-aero-hero-art absolute inset-y-0 right-0 w-full overflow-hidden lg:w-[72%]" aria-hidden="true">
            <div className="home-aero-hero-shine absolute inset-0" aria-hidden="true" />
          </div>
        </section>

        {renderQuickLinksSection()}

        <div className="grid items-stretch gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,0.78fr)] lg:gap-6">
          {renderUpcomingDatesSection()}

          <aside className="grid content-start gap-4 sm:gap-5" aria-label="Home page utilities">
            <section className="home-aero-panel overflow-hidden" aria-labelledby="home-disclaimer">
              <div className="home-aero-panel-heading home-aero-panel-heading--warning">
                <span className="home-aero-warning-icon text-[22px] font-black leading-none text-amber-800" aria-hidden="true">!</span>
                <h2 id="home-disclaimer" className="text-[15px] font-bold leading-5">Important</h2>
              </div>
              <div className="p-4">
                <h3 className="text-[13px] font-bold leading-5 text-[var(--on-surface)]">Beta disclaimer</h3>
                <p className="mt-2 text-[11px] leading-5 text-[var(--on-surface-variant)] sm:text-[12px]">
                  SUSS Planner is currently in beta. Please cross-reference official materials for critical academic decisions.
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--on-surface-variant)] sm:text-[12px]">
                  If classes or schedules have changed, refer to the SUSS Backpack app or Canvas/Learnova for the latest official information.
                </p>
                <p className="mt-4 border-t border-[var(--outline-variant)] pt-3 text-[11px] font-bold leading-4 text-[var(--on-surface)]">
                  Data last updated: {formatDataUpdatedValue(latestDataUpdatedAt)}
                </p>
              </div>
            </section>

            <section className="home-aero-feedback relative overflow-hidden rounded-[1rem] border p-4 shadow-[var(--shadow-elev-1)] sm:p-5" aria-labelledby="feedback-cta">
              <span className="home-aero-feedback-bubble home-aero-feedback-bubble--one" aria-hidden="true" />
              <span className="home-aero-feedback-bubble home-aero-feedback-bubble--two" aria-hidden="true" />
              <span className="home-aero-feedback-icon relative flex h-10 w-10 items-center justify-center rounded-[0.8rem] border border-white/60 bg-white/65 text-[var(--primary)] shadow-sm">
                <EditIcon className="h-5 w-5" />
              </span>
              <div className="relative mt-4">
                <h2 id="feedback-cta" className="text-[18px] font-extrabold leading-6 tracking-[-0.025em] text-[var(--on-surface)]">
                  Help us grow.
                </h2>
                <p className="mt-1.5 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                  Spot outdated data or a rough edge? Your feedback helps make planning better for everyone.
                </p>
                <Link
                  prefetch
                  href="/feedback"
                  className="home-aero-feedback-button mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold leading-4 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]"
                >
                  Send feedback
                  <ArrowUpRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
