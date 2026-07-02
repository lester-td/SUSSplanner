"use client";

import { useEffect, useMemo, useState } from "react";

import { CheckIcon, EditCalendarIcon, PlusIcon } from "@/components/planner/icons";
import {
  TIMETABLE_UPDATED_EVENT,
  announceTimetableUpdated,
  isCourseInTimetable,
  loadSavedTimetable,
  removeCourseCodeFromSavedTimetable,
  saveTimetableToLocalStorage,
  upsertClassInSavedTimetable,
} from "@/lib/timetable/local-storage";
import { readAppSettings } from "@/lib/settings/app-settings";
import type {
  CourseClassRecord,
  SemesterRecord,
  SharedClassIdentifier,
} from "@/lib/timetable/types";

type TimetableCourseLike = {
  courseCode: string;
  offeredSemesters?: SemesterRecord[];
};

type ClassesResponse = {
  classes: CourseClassRecord[];
};

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

function resolveTargetSemesterId({
  offeredSemesters,
  preferredSemesterId,
  savedSemesterId,
  fallbackSemesterId,
}: {
  offeredSemesters: SemesterRecord[] | undefined;
  preferredSemesterId?: number | null;
  savedSemesterId?: number | null;
  fallbackSemesterId?: number | null;
})
{
  const offeredIds = new Set(offeredSemesters?.map((semester) => semester.semesterId) ?? []);
  const candidates = [preferredSemesterId, savedSemesterId, fallbackSemesterId]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (offeredIds.size === 0)
  {
    return candidates[0] ?? null;
  }

  return candidates.find((semesterId) => offeredIds.has(semesterId))
    ?? offeredSemesters?.[0]?.semesterId
    ?? null;
}

function pickPreferredClass(classes: CourseClassRecord[], preferredGroupType: "TG" | "CRN")
{
  const sorted = [...classes].sort((left, right) => (
    left.groupCodeType.localeCompare(right.groupCodeType)
    || left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true, sensitivity: "base" })
  ));

  return sorted.find((group) => group.groupCodeType === preferredGroupType)
    ?? sorted[0]
    ?? null;
}

function toClassSelection(group: CourseClassRecord): SharedClassIdentifier
{
  return {
    courseCode: group.courseCode,
    scheduleType: group.scheduleType,
    groupCodeType: group.groupCodeType,
    groupCode: group.groupCode,
  };
}

export function AddToTimetableButton({
  course,
  compact = false,
  appearance = "default",
  preferredSemesterId,
  fallbackSemesterId,
}: {
  course: TimetableCourseLike;
  compact?: boolean;
  appearance?: "default" | "outline";
  preferredSemesterId?: number | null;
  fallbackSemesterId?: number | null;
})
{
  const [added, setAdded] = useState(false);
  const [targetSemesterId, setTargetSemesterId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const courseCode = useMemo(() => normalizeCourseCode(course.courseCode), [course.courseCode]);

  useEffect(() => {
    const syncAddedState = () => {
      const current = loadSavedTimetable();
      const nextTargetSemesterId = resolveTargetSemesterId({
        offeredSemesters: course.offeredSemesters,
        preferredSemesterId,
        savedSemesterId: current?.semesterId,
        fallbackSemesterId,
      });

      setTargetSemesterId(nextTargetSemesterId);
      setAdded(nextTargetSemesterId === null ? false : isCourseInTimetable(current, nextTargetSemesterId, courseCode));
    };

    syncAddedState();
    window.addEventListener("storage", syncAddedState);
    window.addEventListener(TIMETABLE_UPDATED_EVENT, syncAddedState);

    return () => {
      window.removeEventListener("storage", syncAddedState);
      window.removeEventListener(TIMETABLE_UPDATED_EVENT, syncAddedState);
    };
  }, [course.offeredSemesters, courseCode, fallbackSemesterId, preferredSemesterId]);

  async function handleClick()
  {
    if (busy)
    {
      return;
    }

    const current = loadSavedTimetable();
    const nextTargetSemesterId = resolveTargetSemesterId({
      offeredSemesters: course.offeredSemesters,
      preferredSemesterId,
      savedSemesterId: current?.semesterId,
      fallbackSemesterId,
    });

    if (nextTargetSemesterId === null)
    {
      setStatusMessage("No timetable semester is available for this course.");
      return;
    }

    setBusy(true);
    setStatusMessage("");

    try
    {
      if (added)
      {
        const next = removeCourseCodeFromSavedTimetable(current, nextTargetSemesterId, courseCode);
        saveTimetableToLocalStorage(next);
        announceTimetableUpdated();
        setTargetSemesterId(nextTargetSemesterId);
        setAdded(false);
        return;
      }

      const params = new URLSearchParams({
        courseCode,
        semesterId: String(nextTargetSemesterId),
      });
      const response = await fetch(`/api/classes?${params.toString()}`);
      if (!response.ok)
      {
        throw new Error("Unable to load class groups.");
      }

      const payload = await response.json() as ClassesResponse;
      const preferredGroupType = readAppSettings().timetableStudyMode === "part-time" ? "CRN" : "TG";
      const selectedClass = pickPreferredClass(payload.classes, preferredGroupType);
      if (!selectedClass)
      {
        throw new Error("No class groups are available for this course in the selected semester.");
      }

      const next = upsertClassInSavedTimetable(current, nextTargetSemesterId, toClassSelection(selectedClass));
      saveTimetableToLocalStorage(next);
      announceTimetableUpdated();
      setTargetSemesterId(nextTargetSemesterId);
      setAdded(true);
    }
    catch (error: unknown)
    {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update timetable.");
    }
    finally
    {
      setBusy(false);
    }
  }

  const compactClassName = compact ? "h-7 gap-1 px-2 py-0.5 text-[10px] leading-3 md:h-7 md:gap-1 md:px-2 md:text-[11px] md:leading-4" : "";

  const buttonClassName = appearance === "outline"
    ? `inline-flex items-center gap-1.5 rounded-[0.4rem] border px-2.5 py-1.5 text-[11px] font-semibold leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        added
          ? "border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] text-[var(--primary)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
      } ${compactClassName}`
    : `inline-flex items-center gap-1.5 rounded-[0.55rem] border px-3 py-2 text-[12px] font-semibold leading-4 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        added
          ? "border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] text-[var(--primary)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)] hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
      } ${compactClassName}`;

  const Icon = added
    ? CheckIcon
    : compact
      ? PlusIcon
      : EditCalendarIcon;

  const label = busy
    ? "Updating..."
    : compact
      ? "Timetable"
      : added
        ? "In Timetable"
        : "Add to Timetable";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy || targetSemesterId === null}
      className={buttonClassName}
      aria-label={added ? `Remove ${courseCode} from timetable` : `Add ${courseCode} to timetable`}
      title={statusMessage || (targetSemesterId === null ? "No timetable semester is available for this course." : undefined)}
    >
      <Icon className={compact ? "h-3.5 w-3.5 md:h-4 md:w-4" : "h-4 w-4"} />
      {label}
    </button>
  );
}
