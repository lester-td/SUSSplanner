"use client";

import { TrashIcon } from "@/components/planner/icons";
import {
  COURSE_BANK_DROP_ID,
  CourseCard,
  DroppableDiv,
  TRASH_DROP_ID,
} from "@/components/planner/semester-planner/drag-drop";
import type { SemesterPlannerCourse } from "@/lib/planner/types";

export function SemesterPlannerPanel({
  bankCourses,
  draggedCourseId,
  onDeleteCourse,
  onEditCourse,
  onToggleShowAllModules,
  showAllModules,
}: {
  bankCourses: SemesterPlannerCourse[];
  draggedCourseId: string | null;
  onDeleteCourse: (course: SemesterPlannerCourse) => void;
  onEditCourse: (courseId: string) => void;
  onToggleShowAllModules: () => void;
  showAllModules: boolean;
})
{
  return (
    <aside className={`space-y-4 lg:sticky lg:top-[90px] lg:max-h-[calc(100vh-110px)] lg:self-start lg:pr-1 ${
      draggedCourseId ? "lg:overflow-visible" : "lg:overflow-y-auto"
    }`}>
      <DroppableDiv
        id={COURSE_BANK_DROP_ID}
        className={(isOver) => `planner-drop-zone rounded-[1rem] border px-4 py-4 transition-all ${
          isOver
            ? "planner-drop-zone--active border-[var(--primary)] bg-[var(--brand-chip-bg)] shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
            : "border-[var(--brand-divider)] bg-[var(--surface-container-low)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Module Bank</h2>
            {showAllModules || draggedCourseId ? (
              <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                {showAllModules ? "(Edit Mode)" : "Drop here to send a module back to the bank."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onToggleShowAllModules}
            className="planner-secondary-action inline-flex min-w-[8.75rem] shrink-0 justify-center self-start rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 py-1 text-[12px] font-semibold leading-5 whitespace-nowrap text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:text-[var(--primary)]"
          >
            {showAllModules ? "Show Available" : "Show All"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {bankCourses.length === 0 ? (
            <p className="planner-empty-state rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] px-3 py-4 text-[12px] leading-5 text-[var(--on-surface-variant)]">
              {showAllModules ? "No modules added yet." : "All courses have been assigned."}
            </p>
          ) : null}

          {bankCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              ghost={showAllModules && course.assignedSemester !== null}
              isDragging={draggedCourseId === course.id}
              draggable={course.assignedSemester === null}
              onEdit={course.source === "manual" ? () => onEditCourse(course.id) : undefined}
              onDelete={showAllModules ? () => onDeleteCourse(course) : undefined}
            />
          ))}
        </div>
      </DroppableDiv>

      <DroppableDiv
        id={TRASH_DROP_ID}
        className={(isOver) => `rounded-[1rem] border-2 border-dashed px-4 py-5 text-center transition-all ${
          isOver
            ? "scale-[1.03] border-red-500 bg-red-500/10 text-red-400 shadow-[0_12px_30px_rgba(239,68,68,0.15)]"
            : draggedCourseId
              ? "border-red-400 bg-red-500/6 text-red-300"
              : "border-red-500/60 bg-transparent text-red-300/90"
        }`}
      >
        {(isOver) => (
          <>
            <div className="flex items-center justify-center gap-2">
              <TrashIcon className={`h-5 w-5 transition-transform ${isOver ? "scale-110" : ""}`} />
              <span className="text-[15px] font-semibold leading-6">
                {isOver ? "Release to delete course" : "Drag here to delete course"}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-5 opacity-80">
              This action cannot be undone.
            </p>
          </>
        )}
      </DroppableDiv>
    </aside>
  );
}
