import { useEffect, useState } from "react";

import {
  ArrowUpRightIcon,
  XIcon,
} from "@/components/planner/icons";
import {
  formatClassGroupLabel,
  formatEventDate,
  formatTimeRange,
} from "@/lib/timetable/date-utils";
import { Modal } from "@/components/ui/modal";
import { getExceptionalClassEvents } from "@/lib/timetable/timetable-utils";
import type {
  TimetableClash,
  TimetableEventRecord,
} from "@/lib/timetable/types";

const TIMETABLE_INFO_DISMISSAL_STORAGE_KEY = "sussplanner.timetable-alerts.info-dismissal.v1";

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadDismissedInfoSignature()
{
  if (!canUseLocalStorage())
  {
    return null;
  }

  const raw = window.localStorage.getItem(TIMETABLE_INFO_DISMISSAL_STORAGE_KEY);
  if (!raw)
  {
    return null;
  }

  try
  {
    const parsed = JSON.parse(raw) as { signature?: unknown };
    return typeof parsed.signature === "string" ? parsed.signature : null;
  }
  catch
  {
    return null;
  }
}

function saveDismissedInfoSignature(signature: string)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  window.localStorage.setItem(TIMETABLE_INFO_DISMISSAL_STORAGE_KEY, JSON.stringify({
    signature,
  }));
}

function clearDismissedInfoSignature()
{
  if (!canUseLocalStorage())
  {
    return;
  }

  window.localStorage.removeItem(TIMETABLE_INFO_DISMISSAL_STORAGE_KEY);
}

function ClassList({ events }: { events: TimetableEventRecord[] })
{
  return (
    <ul className="flex flex-wrap gap-1.5">
      {events.map((event) => (
        <li key={event.eventId} className="w-fit max-w-full rounded-[0.35rem] border border-[var(--outline-variant)] bg-white px-2 py-1 shadow-sm">
          <p className="text-[12px] font-semibold leading-4 text-[var(--on-surface)]">
            {event.courseCode} {formatClassGroupLabel(event.groupCode)}
          </p>
          <p className="text-[11px] leading-4 text-[var(--on-surface-variant)]">
            {formatEventDate(event.eventDate)} · {formatTimeRange(event.startTime, event.endTime)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function getEventSignature(event: TimetableEventRecord)
{
  return [
    event.courseCode,
    event.groupCode,
    event.eventDate,
    event.startTime,
    event.endTime,
    event.eventMode ?? "",
  ].join("|");
}

function countUniqueClassParticipants(clashes: TimetableClash[])
{
  const uniqueClasses = new Set<string>();

  for (const clash of clashes)
  {
    for (const event of clash.events)
    {
      if (event.eventKind === "EXAM")
      {
        continue;
      }

      uniqueClasses.add(event.shareKey);
    }
  }

  return uniqueClasses.size;
}

function getUniqueClassParticipants(clashes: TimetableClash[])
{
  const uniqueParticipants: TimetableEventRecord[] = [];
  const seenShareKeys = new Set<string>();

  for (const clash of clashes)
  {
    for (const event of clash.events)
    {
      if (event.eventKind === "EXAM" || seenShareKeys.has(event.shareKey))
      {
        continue;
      }

      seenShareKeys.add(event.shareKey);
      uniqueParticipants.push(event);
    }
  }

  return uniqueParticipants;
}

function getClassClashSummary(clashes: TimetableClash[])
{
  const classCount = countUniqueClassParticipants(clashes);
  const clashCount = clashes.length;

  return `${clashCount} clash${clashCount === 1 ? "" : "es"} in ${classCount} tutorial group${classCount === 1 ? "" : "s"}`;
}

function getExamClashSummary(clashes: TimetableClash[])
{
  const clashCount = clashes.length;
  return `${clashCount} exam clash${clashCount === 1 ? "" : "es"}`;
}

function formatClashEventLabel(event: TimetableEventRecord, includeMode: boolean)
{
  const base = `${event.courseCode} ${formatClassGroupLabel(event.groupCode)}`;
  if (!includeMode)
  {
    return base;
  }
  return `${base} · ${event.eventMode?.trim() || "Exam"}`;
}

function ClassClashBadges({ clashes }: { clashes: TimetableClash[] })
{
  const participants = getUniqueClassParticipants(clashes);

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {participants.map((event) => (
        <span
          key={event.shareKey}
          className="rounded-full border border-[var(--outline-variant)] bg-white px-2 py-1 text-[11px] font-semibold leading-none text-[var(--on-surface)] shadow-sm"
        >
          {formatClashEventLabel(event, false)}
        </span>
      ))}
    </div>
  );
}

function ExamClashTile({ clash }: { clash: TimetableClash })
{
  return (
    <article className="rounded-[0.4rem] border border-[var(--outline-variant)] bg-white px-2 py-1.5 shadow-sm">
      <p className="text-[10px] font-semibold leading-[13px] text-[var(--on-surface)] sm:text-[11px] sm:leading-[14px]">
        {formatEventDate(clash.eventDate)} · {formatTimeRange(clash.startTime, clash.endTime)}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {clash.events
          .filter((event) => event.eventKind === "EXAM")
          .map((event) => (
            <li key={event.eventId} className="flex gap-1 text-[10px] font-normal text-[var(--on-surface)] sm:text-[11px]">
              <span aria-hidden="true">•</span>
              <span>{formatClashEventLabel(event, true)}</span>
            </li>
          ))}
      </ul>
    </article>
  );
}

function splitClashes(clashes: TimetableClash[])
{
  const classClashes: TimetableClash[] = [];
  const examClashes: TimetableClash[] = [];

  for (const clash of clashes)
  {
    // Mixed class/exam overlaps are surfaced with exams because they are the higher-priority alert.
    if (clash.events.some((event) => event.eventKind === "EXAM"))
    {
      examClashes.push(clash);
      continue;
    }

    classClashes.push(clash);
  }

  return { classClashes, examClashes };
}

function ClashScheduleSection({
  title,
  clashes,
  isExam,
}: {
  title: string;
  clashes: TimetableClash[];
  isExam: boolean;
})
{
  if (clashes.length === 0)
  {
    return null;
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[24px] font-black leading-none tracking-[-0.04em] text-[var(--error)]">
          {clashes.length}
        </span>
        <span className="text-[18px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--on-surface)]">
          {title}
        </span>
      </div>

      <div className="overflow-x-auto border border-[var(--outline-variant)] bg-[var(--surface-container-low)]">
        <table className="min-w-full border-collapse text-left text-[13px] leading-5">
          <thead className="bg-[var(--surface-container-high)] text-[var(--on-surface)]">
            <tr>
              <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">
                Date
              </th>
              <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">
                Time
              </th>
              <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">
                {isExam ? "Clashing Exams" : "Clashing Tutorial Groups"}
              </th>
            </tr>
          </thead>
          <tbody>
            {clashes.map((clash) => (
              <tr key={clash.clashKey} className="text-[var(--on-surface)] odd:bg-[var(--surface)]">
                <td className="border-b border-[var(--outline-variant)] px-3 py-2.5">
                  {formatEventDate(clash.eventDate)}
                </td>
                <td className="border-b border-[var(--outline-variant)] px-3 py-2.5">
                  {formatTimeRange(clash.startTime, clash.endTime)}
                </td>
                <td className="border-b border-[var(--outline-variant)] px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {clash.events.map((event) => (
                      <span key={event.eventId} className="rounded-[0.4rem] border border-[var(--outline-variant)] bg-white px-2 py-1 text-[12px] font-semibold text-[var(--on-surface)] shadow-sm">
                        {formatClashEventLabel(event, isExam)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClashDetailsModal({
  classClashes,
  examClashes,
  onClose,
}: {
  classClashes: TimetableClash[];
  examClashes: TimetableClash[];
  onClose: () => void;
})
{
  return (
    <Modal
      open={true}
      title="Clashes"
      onClose={onClose}
      showCloseButton
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-6">
        <ClashScheduleSection
          title="Class Clashes"
          clashes={classClashes}
          isExam={false}
        />

        <ClashScheduleSection
          title="Exam Clashes"
          clashes={examClashes}
          isExam={true}
        />
      </div>
    </Modal>
  );
}

export function TimetableAlerts({
  events,
  clashes,
}: {
  events: TimetableEventRecord[];
  clashes: TimetableClash[];
})
{
  const {
    weekZeroClasses,
    studyWeekClasses,
  } = getExceptionalClassEvents(events);
  const {
    classClashes,
    examClashes,
  } = splitClashes(clashes);
  const infoSignature = [
    ...weekZeroClasses.map(getEventSignature),
    ...studyWeekClasses.map(getEventSignature),
  ].sort().join("|");
  const [isClashesModalOpen, setIsClashesModalOpen] = useState(false);
  const [infoDismissed, setInfoDismissed] = useState(() => loadDismissedInfoSignature() === infoSignature);
  const hasInfo = weekZeroClasses.length > 0 || studyWeekClasses.length > 0;
  const hasClassClashes = classClashes.length > 0;
  const hasExamClashes = examClashes.length > 0;

  useEffect(() => {
    if (!hasInfo)
    {
      return;
    }

    const dismissedSignature = loadDismissedInfoSignature();
    const shouldDismiss = dismissedSignature === infoSignature;

    setInfoDismissed(shouldDismiss);

    if (dismissedSignature && dismissedSignature !== infoSignature)
    {
      clearDismissedInfoSignature();
    }
  }, [infoSignature]);

  const hasVisibleInfo = hasInfo && !infoDismissed;
  const hasVisibleSections = hasVisibleInfo || hasClassClashes || hasExamClashes;

  if (!hasVisibleSections)
  {
    return null;
  }

  return (
    <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-2 sm:px-3 sm:py-2.5">
      <div className="elev-1 grid overflow-hidden rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] divide-y divide-[var(--outline-variant)] md:grid-flow-col md:auto-cols-fr md:divide-x md:divide-y-0">
        {hasClassClashes ? (
          <section className="min-w-0 bg-[var(--error-container)] px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[16px] font-semibold leading-normal text-[var(--on-surface)]">
                {getClassClashSummary(classClashes)}
              </p>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setIsClashesModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--error)]/25 bg-[var(--surface-container-lowest)] px-2 py-1 text-[10px] font-semibold text-[var(--error)] transition hover:bg-[var(--error-container)] sm:text-[11px]"
              >
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
                View details
              </button>
            </div>
            <ClassClashBadges clashes={classClashes} />
          </section>
        ) : null}

        {hasExamClashes ? (
          <section className="min-w-0 bg-[var(--error-container)] px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[16px] font-semibold leading-normal text-[var(--on-surface)]">
                {getExamClashSummary(examClashes)}
              </p>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setIsClashesModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--error)]/25 bg-[var(--surface-container-lowest)] px-2 py-1 text-[10px] font-semibold text-[var(--error)] transition hover:bg-[var(--error-container)] sm:text-[11px]"
              >
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
                View details
              </button>
            </div>
            <div className="mt-2 grid max-h-40 gap-1.5 overflow-y-auto pr-1 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
              {examClashes.map((clash) => (
                <ExamClashTile key={clash.clashKey} clash={clash} />
              ))}
            </div>
          </section>
        ) : null}

        {hasVisibleInfo ? (
          <section className="relative min-w-0 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="min-w-0 space-y-3 pr-16 sm:pr-20">
              {weekZeroClasses.length > 0 ? (
                <div>
                  <p className="text-[16px] font-semibold leading-normal text-[var(--on-surface)]">
                    {weekZeroClasses.length} {weekZeroClasses.length === 1 ? "class" : "classes"} in Week 0
                  </p>
                  <div className="mt-1.5 max-h-40 overflow-y-auto pr-1">
                    <ClassList events={weekZeroClasses} />
                  </div>
                </div>
              ) : null}
              {studyWeekClasses.length > 0 ? (
                <div>
                  <p className="text-[16px] font-semibold leading-normal text-[var(--on-surface)]">
                    {studyWeekClasses.length} {studyWeekClasses.length === 1 ? "class" : "classes"} in Study Week
                  </p>
                  <div className="mt-1.5 max-h-40 overflow-y-auto pr-1">
                    <ClassList events={studyWeekClasses} />
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                saveDismissedInfoSignature(infoSignature);
                setInfoDismissed(true);
              }}
              className="absolute right-2 top-2 inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2 py-1 text-[10px] font-semibold text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-container-high)] sm:right-3 sm:top-2.5 sm:text-[11px]"
            >
              <XIcon className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </section>
        ) : null}

        {isClashesModalOpen ? (
          <ClashDetailsModal
            classClashes={classClashes}
            examClashes={examClashes}
            onClose={() => setIsClashesModalOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
