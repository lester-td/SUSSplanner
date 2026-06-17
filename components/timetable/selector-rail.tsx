"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/planner/icons";

type SelectorRailItem = {
  id: string;
  title: string;
  subtitle?: string;
};

export function SelectorRail({
  items,
  selectedId,
  onSelect,
  onPrev,
  onNext,
  variant,
  subtle = false,
}: {
  items: SelectorRailItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  variant: "semester" | "week";
  subtle?: boolean;
})
{
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startScrollLeft: number;
    hasDragged: boolean;
    clickSuppressUntil: number;
  }>({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    hasDragged: false,
    clickSuppressUntil: 0,
  });
  const selectedIndex = items.findIndex((item) => item.id === selectedId);

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent)
    {
      const scroller = scrollerRef.current;
      const dragState = dragStateRef.current;
      if (!scroller || dragState.pointerId !== event.pointerId)
      {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      if (!dragState.hasDragged && Math.abs(deltaX) < 8)
      {
        return;
      }

      dragState.hasDragged = true;
      event.preventDefault();
      scroller.scrollLeft = dragState.startScrollLeft - deltaX;
    }

    function finishPointerDrag(event: PointerEvent)
    {
      const dragState = dragStateRef.current;
      if (dragState.pointerId !== event.pointerId)
      {
        return;
      }

      const wasDragging = dragState.hasDragged;
      dragState.pointerId = null;
      dragState.hasDragged = false;

      if (wasDragging)
      {
        dragState.clickSuppressUntil = performance.now() + 90;
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller)
    {
      return;
    }

    const selectedElement = scroller.querySelector<HTMLElement>(`[data-rail-item="${selectedId}"]`);
    if (!selectedElement)
    {
      return;
    }

    const nextLeft = selectedElement.offsetLeft - ((scroller.clientWidth - selectedElement.offsetWidth) / 2);
    scroller.scrollTo({
      left: Math.max(0, nextLeft),
      behavior: "smooth",
    });
  }, [items, selectedId]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>)
  {
    if (event.button !== 0)
    {
      return;
    }

    const scroller = scrollerRef.current;
    if (!scroller)
    {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      hasDragged: false,
      clickSuppressUntil: 0,
    };
  }

  const railClassName = variant === "semester"
    ? "border-b border-[var(--outline-variant)]/40 bg-[var(--surface-container-lowest)]"
    : "border-t border-[var(--outline-variant)]/25 bg-[var(--rail-week-bg)]";

  return (
    <div className={`relative flex items-stretch overflow-hidden ${railClassName}`}>
      <button
        type="button"
        aria-label="Previous"
        onClick={onPrev}
        disabled={selectedIndex <= 0}
        className="flex w-8 shrink-0 self-stretch items-center justify-center rounded-none border-r border-[var(--outline-variant)]/40 bg-[var(--surface-container-low)] px-0 text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-high)] active:bg-[var(--surface-container-highest)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>

      <div
        ref={scrollerRef}
        className="flex-1 cursor-grab overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
      >
        <div className={`flex min-w-max items-center justify-center px-3 ${variant === "semester" ? "gap-6 py-2.5" : "gap-8 py-2.5"}`}>
          {items.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                data-rail-item={item.id}
                className={`relative min-w-[6.5rem] px-1 text-center transition-opacity ${
                  active ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)] opacity-40 hover:opacity-70"
                }`}
                onClick={() => {
                  if (performance.now() < dragStateRef.current.clickSuppressUntil)
                  {
                    return;
                  }

                  onSelect(item.id);
                }}
              >
                <div
                  className={
                    variant === "semester"
                      ? active
                        ? "text-[18px] font-bold leading-6"
                        : "text-[16px] font-semibold leading-5"
                      : active
                        ? "text-[13px] font-bold leading-4"
                        : "text-[13px] font-medium leading-4"
                  }
                >
                  {item.title}
                </div>
                {item.subtitle ? (
                  <div
                    className={
                      variant === "semester"
                        ? active
                          ? "text-[13px] font-medium leading-4 text-[var(--on-surface-variant)]"
                          : "text-[12px] font-medium leading-4 text-[var(--on-surface-variant)]"
                        : active
                          ? "text-[11px] leading-3 text-[var(--on-surface-variant)]"
                          : "text-[11px] leading-3"
                    }
                  >
                    {item.subtitle}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-label="Next"
        onClick={onNext}
        disabled={selectedIndex >= items.length - 1}
        className="flex w-8 shrink-0 self-stretch items-center justify-center rounded-none border-l border-[var(--outline-variant)]/40 bg-[var(--surface-container-low)] px-0 text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-high)] active:bg-[var(--surface-container-highest)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRightIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
