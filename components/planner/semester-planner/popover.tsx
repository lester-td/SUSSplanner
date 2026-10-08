"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

export function PlannerPopover({
  anchorRef,
  children,
  className,
  id,
  width,
  backupRoot = false,
  inline = false,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className: string;
  id?: string;
  width?: number;
  backupRoot?: boolean;
  inline?: boolean;
})
{
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (inline) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel)
    {
      return;
    }

    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const scroller = anchor.closest(".planner-sidebar-scroll");
      const scrollerRect = scroller?.getBoundingClientRect();
      const scrolls = scroller && getComputedStyle(scroller).overflowY === "auto";
      const navbarBottom = document.querySelector(".app-navbar")?.getBoundingClientRect().bottom ?? 0;
      const viewportTop = Math.max(12, navbarBottom + 8);
      const viewportBottom = window.innerHeight - 12;
      const anchorVisibleTop = scrolls && scrollerRect ? Math.max(viewportTop, scrollerRect.top) : viewportTop;
      const anchorVisibleBottom = scrolls && scrollerRect ? Math.min(viewportBottom, scrollerRect.bottom) : viewportBottom;

      if (rect.bottom <= anchorVisibleTop || rect.top >= anchorVisibleBottom)
      {
        setPosition(null);
        return;
      }

      const below = Math.max(0, viewportBottom - rect.bottom - 6);
      const above = Math.max(0, rect.top - viewportTop - 6);
      const placeAbove = below < 180 && above > below;
      const maxHeight = Math.min(448, placeAbove ? above : below);
      const panelWidth = Math.min(width ?? rect.width, window.innerWidth - 24);

      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)),
        top: placeAbove ? rect.top - 6 - Math.min(panel.scrollHeight, maxHeight) : rect.bottom + 6,
        width: panelWidth,
        maxHeight,
      });
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor);
    observer.observe(panel);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef, width, inline]);

  if (inline)
  {
    return <div className={className}>{children}</div>;
  }

  if (typeof document === "undefined")
  {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      data-backup-popover-root={backupRoot ? "" : undefined}
      className={`planner-page ${className}`}
      style={{
        ...position,
        position: "fixed",
        zIndex: 50,
        overflowY: "auto",
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
