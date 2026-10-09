"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./prerequisite-tree.module.css";

export function TreeViewport({ children, expanded = false, courseCode, height }: { children: ReactNode; expanded?: boolean; courseCode: string; height: number })
{
  const viewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centreCurrentCourse = () => {
      const current = viewport.querySelector('[aria-current="page"]');
      if (!current) return;
      const frame = viewport.getBoundingClientRect(), node = current.getBoundingClientRect();
      // Native scroll limits keep edge courses visible without adding blank canvas.
      viewport.scrollTo({
        left: viewport.scrollLeft + node.left - frame.left - viewport.clientLeft + node.width / 2 - viewport.clientWidth / 2,
        top: viewport.scrollTop + node.top - frame.top - viewport.clientTop + node.height / 2 - viewport.clientHeight / 2,
        behavior: "instant",
      });
    };
    centreCurrentCourse();
    const observer = new ResizeObserver(centreCurrentCourse);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [courseCode, expanded, height]);

  return <div ref={viewportRef} className={`${styles.treeViewport} ${expanded ? styles.expandedViewport : ""}`} style={expanded ? undefined : { height: Math.min(320, height) }} role="region" aria-label="Connected course prerequisite tree" tabIndex={0}>
    <div className={styles.graphCanvas}>{children}</div>
  </div>;
}
