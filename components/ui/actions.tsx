import type { ReactNode } from "react";

export function ActionButton({
  variant,
  icon,
  label,
  onClick,
  stretch = false,
  disabled = false,
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
}: {
  variant: "primary" | "ghost" | "danger";
  icon: ReactNode;
  label: string;
  onClick: () => void;
  stretch?: boolean;
  disabled?: boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
})
{
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-1.5 rounded-[0.5rem] px-2 py-1 text-[13px] font-medium leading-4 transition-colors sm:px-2.5 sm:py-1.5 sm:text-[14px] ${
        stretch ? "w-full" : ""
      } ${
        variant === "primary"
          ? "app-action-button app-action-button--primary bg-[var(--primary)] text-on-primary hover:bg-[var(--primary-container)] hover:text-on-primary"
          : variant === "danger"
            ? "app-action-button app-action-button--danger border border-[var(--error)] bg-[var(--control-surface)] text-[var(--danger-text,var(--error))] hover:bg-[var(--error-container)]"
          : "app-action-button app-action-button--ghost border border-[var(--brand-divider)] bg-[var(--surface-container)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function IconButton({
  children,
  label,
  onClick,
  className = "",
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
})
{
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-[0.5rem] border transition-colors ${
        danger
          ? "app-icon-button--danger border-transparent text-[var(--error)] hover:bg-[var(--accent-soft)]"
          : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--brand-chip-bg)] hover:text-[var(--primary)]"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
