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
  const icon = <span aria-hidden="true" className="app-wordmark__icon block h-full aspect-square shrink-0" />;
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
