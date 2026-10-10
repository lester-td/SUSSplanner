"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { CourseNodeSummary } from "@/lib/data/prerequisites/types";
import { COURSE_COLOR_PALETTE } from "@/lib/timetable/timetable-utils";
import styles from "./prerequisite-tree.module.css";

const currentColor = COURSE_COLOR_PALETTE[4];
const columnColors = COURSE_COLOR_PALETTE.filter(color => color !== currentColor);

export function CourseNode({ course, current = false, column = 1 }: { course: CourseNodeSummary; current?: boolean; column?: number })
{
  const cardId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleOnce = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const label = course.courseName ? `${course.courseCode}: ${course.courseName}` : course.courseCode;
  const className = `${styles.node} ${course.href ? styles.available : ""} ${current ? styles.current : ""}`;
  const paletteIndex = Math.max(0, column - 1);
  const baseColor = columnColors[paletteIndex % columnColors.length];
  // Keep extra columns distinct if a future tree outgrows the seven other colours.
  const cycle = Math.floor(paletteIndex / columnColors.length);
  const columnColor = cycle ? `color-mix(in srgb, ${baseColor} ${100 / (1 + cycle * .2)}%, white)` : baseColor;
  const color = { "--course-color": current ? currentColor : columnColor } as CSSProperties;

  function clearCloseTimer()
  {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  function showCard()
  {
    clearCloseTimer();
    setOpen(true);
  }
  function closeCard()
  {
    clearCloseTimer();
    visibleOnce.current = false;
    setOpen(false);
    setPosition(null);
  }
  function contains(target: EventTarget | null)
  {
    return target instanceof Node && Boolean(triggerRef.current?.contains(target) || cardRef.current?.contains(target));
  }
  function leaveCard(target: EventTarget | null, delay = 0)
  {
    if (contains(target)) return;
    clearCloseTimer();
    if (delay) closeTimer.current = setTimeout(() => {
      if (!contains(document.activeElement)) closeCard();
    }, delay);
    else closeCard();
  }

  function updatePosition()
  {
    const anchor = triggerRef.current, card = cardRef.current;
    if (!anchor || !card) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = anchor.closest('[role="region"]')?.getBoundingClientRect();
    if (rect.bottom <= Math.max(0, viewport?.top ?? 0) || rect.top >= Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight) || rect.right <= Math.max(0, viewport?.left ?? 0) || rect.left >= Math.min(window.innerWidth, viewport?.right ?? window.innerWidth))
    {
      // Keyboard focus can start scrolling an offscreen course into view.
      // Wait for that scroll before showing its card; later leaving view closes it.
      if (visibleOnce.current) closeCard();
      return;
    }
    visibleOnce.current = true;
    const width = card.offsetWidth, height = card.offsetHeight;
    const below = window.innerHeight - rect.bottom - 8, above = rect.top - 8;
    const top = below < height && above > below ? rect.top - height - 8 : rect.bottom + 8;
    setPosition({
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(top, window.innerHeight - height - 12)),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!contains(event.target)) closeCard(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeCard();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    const observer = new ResizeObserver(updatePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);
  useEffect(() => () => clearCloseTimer(), []);

  if (!course.href) return <span className={className} style={color} aria-label={label}>{course.courseCode}</span>;

  return <>
    <Link
      ref={triggerRef}
      href={course.href}
      prefetch={false}
      className={className}
      style={color}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      aria-describedby={open ? cardId : undefined}
      onMouseEnter={showCard}
      onMouseLeave={event => leaveCard(event.relatedTarget, 150)}
      onFocus={showCard}
      onBlur={event => leaveCard(event.relatedTarget)}
    >
      {course.courseCode}
      {current ? <span className={styles.currentLabel} aria-hidden="true">Current course</span> : null}
    </Link>
    {open ? createPortal(
      <div
        ref={cardRef}
        id={cardId}
        role="tooltip"
        className={styles.courseCard}
        style={{ ...position, visibility: position ? "visible" : "hidden" }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={event => leaveCard(event.relatedTarget, 150)}
      >
        <p className={styles.cardHeading}>
          <strong id={`${cardId}-code`} className={styles.cardCode}>{course.courseCode}</strong>{" "}
          {course.courseName ? <span id={`${cardId}-name`}>{course.courseName}</span> : null}
        </p>
      </div>, document.body,
    ) : null}
  </>;
}
