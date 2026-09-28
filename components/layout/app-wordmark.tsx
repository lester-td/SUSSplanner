export function AppWordmark({
  appearance = "default",
  className = "",
  decorative = false,
  iconPosition = "left",
  size = "nav",
}: {
  appearance?: "adaptive" | "default" | "inverse";
  className?: string;
  decorative?: boolean;
  iconPosition?: "left" | "right";
  size?: "hero" | "nav";
})
{
  const textSizeClassName = size === "hero"
    ? "text-[27px] sm:text-[34px] lg:text-[38px]"
    : "text-[18px] sm:text-[20px]";
  const icon = (
    <svg
      aria-hidden="true"
      className="h-full w-auto shrink-0"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="app-wordmark__calendar-shell" x="5" y="9" width="54" height="50" rx="10" />
      <rect className="app-wordmark__calendar-page" x="10" y="21" width="44" height="33" rx="5" />
      <rect className="app-wordmark__calendar-shell" x="16" y="4" width="8" height="17" rx="4" />
      <rect className="app-wordmark__calendar-shell" x="40" y="4" width="8" height="17" rx="4" />
      <rect x="13" y="24" width="18" height="12" rx="3" fill="#DA291C" />
      <rect x="34" y="24" width="17" height="12" rx="3" fill="#9ADBE8" />
      <rect x="13" y="39" width="12" height="12" rx="3" fill="#9ADBE8" />
      <rect x="28" y="39" width="23" height="12" rx="3" fill="#D0DF00" />
    </svg>
  );
  const text = (
    <span className={`whitespace-nowrap leading-none tracking-[-0.035em] ${textSizeClassName}`}>
      <span className="font-extrabold">S<span className="text-[#DA291C]">U</span>SS</span>{" "}
      <span className="font-semibold">Planner</span>
    </span>
  );

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : "SUSS Planner"}
      role={decorative ? undefined : "img"}
      className={`app-wordmark app-wordmark--${appearance} inline-flex items-center gap-2 ${className}`.trim()}
    >
      {iconPosition === "left" ? icon : null}
      {text}
      {iconPosition === "right" ? icon : null}
    </span>
  );
}
