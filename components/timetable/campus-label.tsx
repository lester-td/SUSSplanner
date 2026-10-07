"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TbInfoCircle } from "react-icons/tb";

import { formatCampusSummary, MIXED_CAMPUS_GUIDANCE, normalizeCampusCodes } from "@/lib/timetable/campus";

export function CampusLabel({ campuses }: { campuses: string[] })
{
  const codes = normalizeCampusCodes(campuses);
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);

  function showTooltip()
  {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(272, window.innerWidth - 24);
    const above = window.innerHeight - rect.bottom < 100;
    setPosition({
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: above ? rect.top - 8 : rect.bottom + 8,
      width,
      above,
    });
  }

  const isOpen = position !== null;
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setPosition(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const onPointerDown = (event: PointerEvent) => { if (!buttonRef.current?.contains(event.target as Node)) close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  if (codes.length === 0) return null;

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span>{formatCampusSummary(codes)}</span>
      {codes.length > 1 ? (
        <button
          ref={buttonRef}
          type="button"
          aria-label="About mixed campuses"
          aria-describedby={position ? tooltipId : undefined}
          className="inline-flex shrink-0 rounded-full text-[var(--on-surface-variant)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          onMouseEnter={showTooltip}
          onMouseLeave={() => setPosition(null)}
          onFocus={showTooltip}
          onBlur={() => setPosition(null)}
          onClick={showTooltip}
        >
          <TbInfoCircle className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {position ? createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[100] rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-high)] px-3 py-2 text-[12px] font-medium leading-5 text-[var(--on-surface)] shadow-[var(--shadow-elev-2)]"
          style={{ left: position.left, top: position.top, width: position.width, transform: position.above ? "translateY(-100%)" : undefined }}
        >
          {MIXED_CAMPUS_GUIDANCE}
        </span>, document.body,
      ) : null}
    </span>
  );
}
