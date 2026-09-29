"use client";

import { useMemo, useState } from "react";


import { ChevronRightIcon } from "@/components/planner/icons";
export type UpcomingDateAudience = {
  id: "FTUG" | "PTUG" | "LAW" | "GRAD";
  label: string;
};

export type UpcomingDateState = "default" | "upcoming" | "open" | "closing";

export type UpcomingDateSchedule = {
  audiences: UpcomingDateAudience[];
  date: string;
  dotState: UpcomingDateState;
  endDate: string;
  startDate: string;
};

export type UpcomingDateItem = {
  detail: string;
  endDate: string;
  label: string;
  schedules: UpcomingDateSchedule[];
  startDate: string;
};

type AudienceFilter = UpcomingDateAudience["id"] | "all";

const audienceOrder: UpcomingDateAudience["id"][] = ["PTUG", "FTUG", "LAW", "GRAD"];

const mobileAudienceLabels: Record<UpcomingDateAudience["id"], string> = {
  PTUG: "Part-time",
  FTUG: "Full-time",
  LAW: "Law",
  GRAD: "Graduate",
};

function uniqueAudiences(schedules: UpcomingDateSchedule[])
{
  const audiences = new Map<UpcomingDateAudience["id"], UpcomingDateAudience>();

  for (const schedule of schedules)
  {
    for (const audience of schedule.audiences)
    {
      audiences.set(audience.id, audience);
    }
  }

  return [...audiences.values()].sort((left, right) => (
    audienceOrder.indexOf(left.id) - audienceOrder.indexOf(right.id)
  ));
}

function getScheduleStatus(schedule: UpcomingDateSchedule, today: string)
{
  if (schedule.startDate === today && schedule.endDate === today)
  {
    return { label: "Today", state: "today" } as const;
  }

  if (schedule.startDate <= today && schedule.endDate >= today)
  {
    return { label: "Open now", state: "open" } as const;
  }

  if (schedule.dotState === "upcoming")
  {
    return { label: "Coming soon", state: "upcoming" } as const;
  }

  return null;
}

export function CompactUpcomingDates({ items, today }: { items: UpcomingDateItem[]; today: string })
{
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");
  const [showAllMobile, setShowAllMobile] = useState(false);
  const [showAllDesktop, setShowAllDesktop] = useState(false);
  const audienceOptions = useMemo(
    () => uniqueAudiences(items.flatMap((item) => item.schedules)),
    [items],
  );
  const rows = useMemo(() => items.flatMap((item, sourceIndex) => (
    item.schedules.map((schedule, scheduleIndex) => ({
      ...item,
      anchorId: scheduleIndex === 0 ? `upcoming-date-${sourceIndex + 1}` : undefined,
      rowKey: `${sourceIndex}-${scheduleIndex}`,
      schedule,
    }))
  )).filter(({ schedule }) => (
    audienceFilter === "all"
    || schedule.audiences.length === 0
    || schedule.audiences.some((audience) => audience.id === audienceFilter)
  )).sort((left, right) => (
    left.schedule.startDate.localeCompare(right.schedule.startDate)
    || left.label.localeCompare(right.label)
  )), [audienceFilter, items]);

  function selectAudience(filter: AudienceFilter)
  {
    setAudienceFilter(filter);
    setShowAllMobile(false);
    setShowAllDesktop(false);
  }

  return (
    <div>
      {audienceOptions.length > 1 ? (
        <div className="home-upcoming-filters" aria-label="Filter dates by student group">
          <button
            type="button"
            className="home-upcoming-filter"
            aria-pressed={audienceFilter === "all"}
            onClick={() => selectAudience("all")}
          >
            All
          </button>
          {audienceOptions.map((audience) => (
            <button
              key={audience.id}
              type="button"
              className="home-upcoming-filter"
              aria-pressed={audienceFilter === audience.id}
              onClick={() => selectAudience(audience.id)}
            >
              <span className="sm:hidden">{mobileAudienceLabels[audience.id]}</span>
              <span className="hidden sm:inline">{audience.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <ol className="divide-y divide-[var(--outline-variant)] px-3 py-1 sm:px-4 sm:py-2">
            {rows.map(({ anchorId, detail, label, rowKey, schedule }, index) => {
              const status = getScheduleStatus(schedule, today);
              const hiddenOnMobile = !showAllMobile && index >= 4;
              const hiddenOnDesktop = !showAllDesktop && index >= 5;

              return (
                <li
                  id={anchorId}
                  key={rowKey}
                  className={`scroll-mt-24 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start sm:gap-2 sm:py-3.5 lg:py-3 ${hiddenOnMobile ? "hidden" : ""} ${hiddenOnDesktop ? "sm:hidden" : "sm:grid"}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 sm:contents">
                    <div className={`home-upcoming-date home-upcoming-date--${schedule.dotState} inline-flex w-max whitespace-nowrap rounded-[0.55rem] border px-2 py-1 text-[11px] font-extrabold leading-4 sm:col-start-1 sm:row-start-1 sm:justify-self-end sm:text-[12px]`}>
                      {schedule.date}
                    </div>
                    {status ? (
                      <span className={`home-upcoming-state-label home-upcoming-state-label--${status.state} sm:col-start-3 sm:row-start-1`}>
                        {status.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 sm:col-start-2 sm:row-start-1">
                    <p className="text-[13px] font-bold leading-5 text-[var(--on-surface)] sm:text-[14px]">
                      {label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--on-surface-variant)] sm:text-[12px] sm:leading-5">
                      {audienceFilter === "all" && schedule.audiences.length > 0 ? (
                        <>
                          <span className="font-bold text-[var(--on-surface)]">
                            {schedule.audiences.map((audience) => audience.label).join(" • ")}
                          </span>
                          {detail ? " · " : null}
                        </>
                      ) : null}
                      {detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {rows.length > 4 ? (
            <div className="p-2 text-center sm:hidden">
              <button
                type="button"
                className="home-upcoming-show-more"
                aria-expanded={showAllMobile}
                onClick={() => setShowAllMobile((current) => !current)}
              >
                <span>{showAllMobile ? "Show less" : "Show more"}</span>
                <ChevronRightIcon
                  className={`h-3.5 w-3.5 transition-transform ${showAllMobile ? "-rotate-90" : "rotate-90"}`}
                />
              </button>
            </div>
          ) : null}
          {rows.length > 5 ? (
            <div className="hidden p-2 text-center sm:block lg:py-1.5">
              <button
                type="button"
                className="home-upcoming-show-more"
                aria-expanded={showAllDesktop}
                onClick={() => setShowAllDesktop((current) => !current)}
              >
                <span>{showAllDesktop ? "Show less" : "Show more"}</span>
                <ChevronRightIcon
                  className={`h-3.5 w-3.5 transition-transform ${showAllDesktop ? "-rotate-90" : "rotate-90"}`}
                />
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-4 py-8 text-[12px] leading-5 text-[var(--on-surface-variant)]">
          No upcoming dates for this group.
        </p>
      )}
    </div>
  );
}
