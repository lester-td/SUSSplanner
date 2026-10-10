"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LayersIcon } from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";
import styles from "./prerequisite-tree.module.css";

export function ExpandedTreeDialog({ courseCode, onClose, children }: { courseCode: string; onClose: () => void; children: ReactNode })
{
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = hostRef.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const targets = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length);
      const first = targets[0], last = targets.at(-1), active = document.activeElement;
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last))
      {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener("keydown", trapFocus, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", trapFocus, true);
    };
  }, []);

  return createPortal(<div ref={hostRef}>
    <Modal
      open
      title={`${courseCode} — Prerequisite Tree`}
      headerIcon={<LayersIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />}
      onClose={onClose}
      showCloseButton
      maxWidthClassName={styles.expandedSurface}
      bodyClassName={styles.expandedBody}
    >
      {children}
    </Modal>
  </div>, document.body);
}
