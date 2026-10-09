"use client";

import { useState } from "react";
import { LayersIcon } from "@/components/planner/icons";
import type { CourseRequisitesSnapshot, PostrequisiteNode, PrerequisiteSourceDetail, PrerequisiteTreeData } from "@/lib/data/prerequisites/types";
import { getPrerequisiteSourceDetails } from "@/lib/data/prerequisites/source-details";
import { CourseGraph } from "./course-graph";
import { ExpandedTreeDialog } from "./expanded-tree-dialog";
import styles from "./prerequisite-tree.module.css";

function SourceEntries({ entries, courseCode, field }: { entries: PrerequisiteSourceDetail[]; courseCode: string; field: "prerequisites" | "remarks" })
{
  const groups = new Map<string, PrerequisiteSourceDetail[]>();
  for (const entry of entries)
  {
    if (!entry[field].length) continue;
    const group = groups.get(entry.courseCode) ?? [];
    group.push(entry); groups.set(entry.courseCode, group);
  }
  if (!groups.size) return null;
  return <>{[...groups].map(([code, sources]) => <div key={code} className={styles.sourceGroup}>
    {code !== courseCode ? <h3 className={styles.sourceCourse}>{code}</h3> : null}
    <ul className={styles.sourceList}>
      {sources.map(source => <li key={source.planKey}>
        <strong className={styles.programme}>{source.programme}</strong>
        {source.pending ? <p className={styles.reviewState}>Needs verification</p> : null}
        {source[field].map((text, index) => <p key={index} className={styles.sourceText}>{text}</p>)}
      </li>)}
    </ul>
  </div>)}</>;
}

type TreeProps = { courseCode: string; requisites: CourseRequisitesSnapshot; postrequisites?: PostrequisiteNode[]; prerequisites?: PrerequisiteTreeData };

function TreeContent({ courseCode, requisites, postrequisites, prerequisites, sources, expanded = false }: TreeProps & { sources: PrerequisiteSourceDetail[]; expanded?: boolean })
{
  const idPrefix = expanded ? "expanded-" : "";
  const hasPrerequisites = sources.some(source => source.prerequisites.length);
  const hasRemarks = sources.some(source => source.remarks.length);
  return <div className={expanded ? styles.expandedContent : styles.body}>
    <p className={styles.intro}>Prerequisite trees are experimental and may not reflect true accuracy. Always check your programme&apos;s curriculum plan for the updated information. Other requirements may apply.</p>
    <CourseGraph courseCode={courseCode} requisites={requisites} prerequisites={prerequisites} postrequisites={postrequisites} expanded={expanded} idPrefix={idPrefix} />
    {hasPrerequisites || hasRemarks ? <div className={expanded ? styles.expandedSources : undefined}>
      {hasPrerequisites ? <details className={styles.disclosure}>
        <summary>Prerequisite</summary>
        <div id={`${idPrefix}prerequisite-details`} className={styles.sourceContent}>
          <SourceEntries entries={sources} courseCode={courseCode} field="prerequisites" />
        </div>
      </details> : null}
      {hasRemarks ? <details className={styles.disclosure}>
        <summary>Remarks</summary>
        <div id={`${idPrefix}prerequisite-remarks`} className={styles.sourceContent}>
          <SourceEntries entries={sources} courseCode={courseCode} field="remarks" />
        </div>
      </details> : null}
    </div> : null}
  </div>;
}

export function PrerequisiteTree({ courseCode, requisites, postrequisites, prerequisites }: TreeProps)
{
  const [expanded, setExpanded] = useState(false);
  if (!requisites.prerequisiteVariants.length && !(postrequisites?.length ?? requisites.dependentCourses.length)) return null;
  const sources = prerequisites?.sources ?? getPrerequisiteSourceDetails(courseCode, requisites);

  return (
    <section id="prerequisites" tabIndex={-1} aria-labelledby="prerequisite-tree-heading" className={`app-aero-panel course-detail-prerequisites ${styles.section}`}>
      <div className="app-aero-panel-heading course-detail-prerequisites__header">
        <h2 id="prerequisite-tree-heading" className="flex min-w-0 items-center gap-[0.6rem] text-[16px] font-semibold leading-5">
          <LayersIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
          Prerequisite Tree
        </h2>
        <button type="button" className={`course-detail-expand-tree ${styles.expandButton}`} aria-haspopup="dialog" aria-expanded={expanded} onClick={() => setExpanded(true)}>
          Expand tree
        </button>
      </div>
      <TreeContent courseCode={courseCode} requisites={requisites} postrequisites={postrequisites} prerequisites={prerequisites} sources={sources} />
      {expanded ? <ExpandedTreeDialog courseCode={courseCode} onClose={() => setExpanded(false)}>
        <TreeContent courseCode={courseCode} requisites={requisites} postrequisites={postrequisites} prerequisites={prerequisites} sources={sources} expanded />
      </ExpandedTreeDialog> : null}
    </section>
  );
}
