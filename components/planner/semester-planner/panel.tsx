"use client";

import type { ReactNode } from "react";

import { BookIcon, ListIcon, TrashIcon } from "@/components/planner/icons";
import {
  COURSE_BANK_DROP_ID,
  CourseCard,
  DroppableDiv,
  TRASH_DROP_ID,
} from "@/components/planner/semester-planner/drag-drop";
import { ActionButton } from "@/components/ui/actions";
import { PlannerMobileCourseRow } from "@/components/planner/semester-planner/mobile";
import type { SemesterPlannerCourse } from "@/lib/planner/types";

export function SemesterPlannerPanel({
  addCourseForm,
  courseModeControl,
  bankCourses,
  draggedCourseId,
  onDeleteCourse,
  onEditCourse,
  onToggleShowAllModules,
  showAllModules,
  mobile = false,
  onAssignCourse,
  onManageCourse,
}: {
  addCourseForm: ReactNode;
  courseModeControl: ReactNode;
  bankCourses: SemesterPlannerCourse[];
  draggedCourseId: string | null;
  onDeleteCourse: (course: SemesterPlannerCourse) => void;
  onEditCourse: (courseId: string) => void;
  onToggleShowAllModules: () => void;
  showAllModules: boolean;
  mobile?: boolean;
  onAssignCourse?: (courseId: string) => void;
  onManageCourse?: (courseId: string) => void;
})
{
  return (
    <div className="flex min-w-0 flex-col gap-3 md:gap-4">
      <DroppableDiv
        id={COURSE_BANK_DROP_ID}
        className={(isOver) => `app-aero-panel planner-section flex min-h-0 min-w-0 flex-col transition-shadow ${isOver ? "planner-bank--active" : ""}`}
      >
        <div className="app-aero-panel-heading shrink-0 justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <BookIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
            <h2 className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">Module Bank</h2>
          </div>
          {courseModeControl}
        </div>

        <div className="flex min-h-0 flex-col p-4 sm:p-5">
          <div className="shrink-0">
            {addCourseForm}
          </div>
          {!mobile ? <div className="mt-4 shrink-0 border-t border-[var(--outline-variant)] pt-4">
            <ActionButton
              variant="ghost"
              icon={<ListIcon className="h-[18px] w-[18px]" />}
              label={showAllModules ? "Show Available" : "Show All"}
              onClick={onToggleShowAllModules}
              stretch
            />
            {showAllModules || draggedCourseId ? (
              <p className="mt-2 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                {showAllModules ? "(Edit Mode)" : "Drop here to send a module back to the bank."}
              </p>
            ) : null}
          </div> : null}

          <div className="mt-3 space-y-2 md:mt-4">
            {mobile ? <h3 className="border-b border-[var(--outline-variant)] pb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">Unassigned courses ({bankCourses.length})</h3> : null}
            {bankCourses.length === 0 ? (
              <p className="planner-empty-state rounded-[0.8rem] border border-dashed border-[var(--outline-variant)] px-3 py-4 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                {showAllModules ? "No modules added yet." : "All courses have been assigned."}
              </p>
            ) : null}

            {bankCourses.map((course) => mobile ? (
              <PlannerMobileCourseRow key={course.id} course={course} assign onAction={() => onAssignCourse?.(course.id)} onMenu={() => onManageCourse?.(course.id)} />
            ) : (
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
        </div>
      </DroppableDiv>

      {!mobile ? <DroppableDiv
        id={TRASH_DROP_ID}
        className={(isOver) => `shrink-0 rounded-[1rem] border-2 border-dashed px-3 py-4 text-center transition-all md:px-4 md:py-5 ${
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
      </DroppableDiv> : null}
    </div>
  );
}
