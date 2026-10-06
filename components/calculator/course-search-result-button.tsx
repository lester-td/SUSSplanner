import { PlusIcon } from "@/components/planner/icons";

type CourseSearchResultButtonProps = {
  course: {
    courseCode: string;
    courseName: string | null;
    creditUnits: number | null;
  };
  disabled?: boolean;
  onClick: () => void;
};

export function CourseSearchResultButton({ course, disabled, onClick }: CourseSearchResultButtonProps)
{
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-[13px] font-bold text-[var(--on-surface)]">{course.courseCode}</span>
        <span className="truncate text-[12px] text-[var(--on-surface-variant)]" title={course.courseName ?? "Course name unavailable"}>
          {course.courseName ?? "Course name unavailable"}
        </span>
      </span>
      <span className="shrink-0 text-right text-[12px] font-semibold text-[var(--on-surface-variant)]">
        {course.creditUnits === null ? "CU unavailable" : `${course.creditUnits.toFixed(1)} CU`}
      </span>
    </button>
  );
}
