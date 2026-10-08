"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { XIcon } from "@/components/planner/icons";
import { formatCredits } from "@/components/planner/semester-planner/formatting";
import type { SemesterPlannerCourse } from "@/lib/planner/types";

export function usePlannerMobileScrollLock(active: boolean)
{
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previousStyles = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      Object.assign(body.style, previousStyles);
      window.scrollTo({ top: scrollY, behavior: "instant" });
    };
  }, [active]);
}

export function PlannerMobileSheet({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
})
{
  usePlannerMobileScrollLock(true);
  const titleId = useId();
  const descriptionId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape")
      {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, select, textarea, [href], [tabindex="0"]',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current))
      {
        event.preventDefault();
        last.focus();
      }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheetRef.current))
      {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    sheetRef.current?.focus();
    sheetRef.current?.querySelector(".planner-mobile-sheet-body")?.scrollTo({ top: 0 });
  }, [title]);

  return createPortal(
    <div className="planner-mobile-sheet-backdrop">
      <button className="absolute inset-0" type="button" aria-label="Dismiss planner panel" tabIndex={-1} onClick={onClose} />
      <div
        ref={sheetRef}
        className="planner-page planner-mobile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="planner-mobile-sheet-heading">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-bold">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-[13px] text-[var(--on-surface-variant)]">{description}</p> : null}
          </div>
          <button type="button" className="planner-mobile-icon-button" aria-label="Close planner panel" onClick={onClose}>
            <XIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="planner-mobile-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function PlannerMobileCourseRow({
  course,
  onAction,
  assign = false,
  onMenu,
}: {
  course: SemesterPlannerCourse;
  onAction: () => void;
  assign?: boolean;
  onMenu?: () => void;
})
{
  return (
    <div className="planner-mobile-course-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold leading-[18px]">{course.courseCode}</span>
          <span className="planner-mobile-course-credits">{formatCredits(course.creditUnits)}</span>
          {course.semesterSpan > 1 ? <span className="text-[11px] text-[var(--on-surface-variant)]">{course.semesterSpan} semesters</span> : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-[18px] text-[var(--on-surface-variant)]">{course.courseName}</p>
      </div>
      <button
        type="button"
        className={assign ? "planner-mobile-text-button" : "planner-mobile-icon-button"}
        aria-label={assign ? `Assign ${course.courseCode}` : `Actions for ${course.courseCode}`}
        onClick={onAction}
      >
        {assign ? "Assign" : <span aria-hidden="true" className="text-[24px] leading-none">⋯</span>}
      </button>
      {assign && onMenu ? (
        <button type="button" className="planner-mobile-icon-button" aria-label={`Actions for ${course.courseCode}`} onClick={onMenu}>
          <span aria-hidden="true" className="text-[24px] leading-none">⋯</span>
        </button>
      ) : null}
    </div>
  );
}
