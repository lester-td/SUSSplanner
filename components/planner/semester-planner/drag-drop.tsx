"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

import { EditIcon, TrashIcon } from "@/components/planner/icons";
import { formatCredits } from "@/components/planner/semester-planner/formatting";
import type { SemesterPlannerCourse } from "@/lib/planner/types";

type DragTranslate = {
  x: number;
  y: number;
};

export type CourseDropTarget =
  | { type: "bank" }
  | { type: "trash" }
  | { type: "semester"; semesterIndex: number };

export const COURSE_BANK_DROP_ID = "course-bank";
export const TRASH_DROP_ID = "trash-zone";
export const SEMESTER_DROP_ID_PREFIX = "semester-";

const GHOST_CATCHUP_RATE = 0.09;

export function getPlannerDropZoneClass(isOver: boolean)
{
  return `planner-drop-zone rounded-[1rem] border px-4 py-4 transition-all ${
    isOver
      ? "planner-drop-zone--active border-[var(--primary)] bg-[var(--brand-chip-bg)] ring-2 ring-[var(--primary-ring-soft)] shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
      : "border-[var(--brand-divider)] bg-[var(--surface-container-low)]"
  }`;
}

export function getCourseDropTarget(overId: string | null): CourseDropTarget | null
{
  if (!overId)
  {
    return null;
  }

  if (overId === COURSE_BANK_DROP_ID)
  {
    return { type: "bank" };
  }

  if (overId === TRASH_DROP_ID)
  {
    return { type: "trash" };
  }

  if (overId.startsWith(SEMESTER_DROP_ID_PREFIX))
  {
    return {
      type: "semester",
      semesterIndex: Number.parseInt(overId.slice(SEMESTER_DROP_ID_PREFIX.length), 10),
    };
  }

  return null;
}

function useCatchingGhostTransform(transform: DragTranslate | null, active: boolean)
{
  const [ghostTransform, setGhostTransform] = useState<DragTranslate | null>(null);
  const activeRef = useRef(active);
  const frameRef = useRef<number | null>(null);
  const currentRef = useRef<DragTranslate>({ x: 0, y: 0 });
  const targetRef = useRef<DragTranslate>({ x: 0, y: 0 });
  const hasGhostRef = useRef(false);

  activeRef.current = active;

  useEffect(() => {
    if (!active || !transform)
    {
      if (frameRef.current !== null)
      {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      currentRef.current = { x: 0, y: 0 };
      targetRef.current = { x: 0, y: 0 };
      hasGhostRef.current = false;
      setGhostTransform(null);
      return;
    }

    targetRef.current = { x: transform.x, y: transform.y };

    if (!hasGhostRef.current)
    {
      hasGhostRef.current = true;
      setGhostTransform({ ...currentRef.current });
    }

    if (frameRef.current !== null)
    {
      return;
    }

    const animate = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      const next = {
        x: current.x + ((target.x - current.x) * GHOST_CATCHUP_RATE),
        y: current.y + ((target.y - current.y) * GHOST_CATCHUP_RATE),
      };

      currentRef.current = next;
      setGhostTransform(next);

      frameRef.current = activeRef.current
        ? window.requestAnimationFrame(animate)
        : null;
    };

    frameRef.current = window.requestAnimationFrame(animate);
  }, [active, transform]);

  useEffect(() => () => {
    if (frameRef.current !== null)
    {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  return ghostTransform;
}

export function CourseCard({
  course,
  draggable = false,
  ghost = false,
  isDragging = false,
  onEdit,
  onDelete,
}: {
  course: SemesterPlannerCourse;
  draggable?: boolean;
  ghost?: boolean;
  isDragging?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
})
{
  const draggableId = draggable ? course.id : `static-${course.id}`;
  const {
    attributes,
    isDragging: isDndDragging,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id: draggableId,
    disabled: !draggable,
    data: {
      course,
      assignedSemester: course.assignedSemester,
    },
  });
  const active = isDragging || isDndDragging;
  const catchingTransform = useCatchingGhostTransform(transform, active);
  const displayedTransform = catchingTransform ?? transform;
  const activeTransform = active ? " rotate(1deg) scale(1.05)" : "";
  const style: CSSProperties = {
    pointerEvents: isDndDragging ? "none" : "auto",
    transform: displayedTransform
      ? `translate3d(${displayedTransform.x}px, ${displayedTransform.y}px, 0)${activeTransform}`
      : active
        ? activeTransform.trim()
        : undefined,
    transformOrigin: "center",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={`planner-course-card rounded-[0.85rem] border px-3 py-2.5 ${active ? "planner-course-card--active transition-colors duration-200" : "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elev-3)]"} ${
        draggable ? "cursor-grab active:cursor-grabbing select-none touch-none" : ""
      } ${
        active
          ? "border-[var(--primary)] bg-[var(--brand-chip-bg)] opacity-50 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
          : ghost
            ? "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] opacity-55"
            : "border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] hover:border-[var(--outline-variant)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
                {course.courseCode}
              </p>
              {course.semesterSpan > 1 ? (
                <span className="shrink-0 rounded-[999px] border border-[var(--outline-variant)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                  {course.semesterSpan} sem
                </span>
              ) : null}
            </div>
            <span className="shrink-0 text-[12px] font-semibold leading-5 text-[var(--primary)]">
              {formatCredits(course.creditUnits)}
            </span>
          </div>
          <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-5 text-[var(--on-surface-variant)]">
            {course.courseName}
            {ghost ? " (assigned)" : ""}
          </p>
        </div>

        {onEdit || onDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[0.5rem] border border-[var(--outline-variant)] text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                aria-label={`Edit ${course.courseCode}`}
              >
                <EditIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[0.5rem] border border-red-500/30 text-red-400 transition-colors hover:border-red-400/70 hover:bg-red-500/10 hover:text-red-300"
                aria-label={`Delete ${course.courseCode}`}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function CourseDragOverlay({
  course,
}: {
  course: SemesterPlannerCourse;
})
{
  return (
    <article className="planner-course-card planner-course-card--overlay pointer-events-none rounded-[0.85rem] border-2 border-[var(--primary)] bg-[var(--surface-container-lowest)] px-3 py-2.5 opacity-95 shadow-[0_16px_32px_rgba(15,23,42,0.2)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
            {course.courseCode}
          </p>
          <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-5 text-[var(--on-surface-variant)]">
            {course.courseName}
          </p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold leading-5 text-[var(--primary)]">
          {formatCredits(course.creditUnits)}
        </span>
      </div>
    </article>
  );
}

export function DroppableDiv({
  children,
  className,
  id,
}: {
  children: ReactNode | ((isOver: boolean) => ReactNode);
  className: (isOver: boolean) => string;
  id: string;
})
{
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={className(isOver)}>
      {typeof children === "function" ? children(isOver) : children}
    </div>
  );
}

export function DroppableArticle({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className: (isOver: boolean) => string;
  id: string;
})
{
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <article ref={setNodeRef} className={className(isOver)}>
      {children}
    </article>
  );
}
