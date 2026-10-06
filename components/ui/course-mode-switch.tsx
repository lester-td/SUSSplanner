"use client";

export function CourseModeSwitch({
  isCustom,
  onChange,
}: {
  isCustom: boolean;
  onChange: (isCustom: boolean) => void;
})
{
  return (
    <div className="course-mode-switch" role="group" aria-label="Add course mode">
      {[{ label: "Search", custom: false }, { label: "Custom", custom: true }].map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={isCustom === option.custom}
          onClick={() => {
            if (isCustom !== option.custom) onChange(option.custom);
          }}
          className="course-mode-option"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
