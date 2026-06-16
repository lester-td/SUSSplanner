import type { ReactNode } from "react";

export function ActionButton({
  variant,
  icon,
  label,
  onClick,
  stretch = false,
  disabled = false,
}: {
  variant: "primary" | "ghost";
  icon: ReactNode;
  label: string;
  onClick: () => void;
  stretch?: boolean;
  disabled?: boolean;
})
{
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-1.5 rounded-[0.5rem] px-2.5 py-1.5 text-[14px] font-medium leading-4 transition-colors ${
        stretch ? "w-full" : ""
      } ${
        variant === "primary"
          ? "bg-[var(--primary)] text-on-primary hover:bg-[var(--primary-container)] hover:text-on-primary"
          : "border border-[var(--brand-divider)] bg-[var(--surface-container)] text-[var(--on-surface)] hover:bg-[var(--surface-container-high)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      onClick={onClick}
      disabled={disabled}
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
          ? "border-transparent text-[var(--error)] hover:bg-[var(--accent-soft)]"
          : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--brand-chip-bg)] hover:text-[var(--primary)]"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
