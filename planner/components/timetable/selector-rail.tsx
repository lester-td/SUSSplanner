"use client";

import { useEffect, useRef } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/planner/icons";
import { IconButton } from "@/components/ui/actions";

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
  const selectedIndex = items.findIndex((item) => item.id === selectedId);

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

  return (
    <div
      className={`relative flex items-center px-[16px] py-3 ${
        variant === "semester" ? "border-b border-[var(--outline-variant)]/50" : ""
      } ${subtle ? "bg-[color:rgb(243_243_249_/_0.2)]" : ""}`}
    >
      <IconButton label="Previous" onClick={onPrev} className="absolute left-2 top-1/2 z-10 -translate-y-1/2" disabled={selectedIndex <= 0}>
        <ChevronLeftIcon className="h-4 w-4" />
      </IconButton>

      <div ref={scrollerRef} className="flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className={`flex min-w-max items-center justify-center px-4 ${variant === "semester" ? "gap-8" : "gap-10"}`}>
          {items.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                data-rail-item={item.id}
                className={`relative min-w-[7rem] px-1 text-center transition-opacity ${
                  active ? "text-[var(--primary)]" : "text-[var(--on-surface-variant)] opacity-40 hover:opacity-70"
                }`}
                onClick={() => onSelect(item.id)}
              >
                <div
                  className={
                    variant === "semester"
                      ? active
                        ? "text-[18px] font-bold leading-6"
                        : "text-[12px] font-semibold leading-4"
                      : active
                        ? "text-[12px] font-bold leading-4"
                        : "text-[12px] font-medium leading-4"
                  }
                >
                  {item.title}
                </div>
                {item.subtitle ? (
                  <div
                    className={
                      variant === "semester"
                        ? active
                          ? "text-[11px] font-medium leading-[14px] text-[var(--on-surface-variant)]"
                          : "text-[10px] uppercase tracking-[-0.04em]"
                        : active
                          ? "text-[10px] leading-3 text-[var(--on-surface-variant)]"
                          : "text-[10px] leading-3"
                    }
                  >
                    {item.subtitle}
                  </div>
                ) : null}
                {active && variant === "semester" ? (
                  <div className="absolute -bottom-[12px] left-0 right-0 h-0.5 bg-[var(--primary)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <IconButton label="Next" onClick={onNext} className="absolute right-2 top-1/2 z-10 -translate-y-1/2" disabled={selectedIndex >= items.length - 1}>
        <ChevronRightIcon className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
