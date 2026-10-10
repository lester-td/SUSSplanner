import { buildCourseGraph, graphRuleText, layoutCourseGraph } from "@/lib/data/prerequisites/course-graph";
import type { CourseRequisitesSnapshot, PostrequisiteNode, PrerequisiteTreeData } from "@/lib/data/prerequisites/types";
import { CourseNode } from "./course-node";
import { TreeViewport } from "./tree-viewport";
import styles from "./prerequisite-tree.module.css";

export function CourseGraph({ courseCode, requisites, prerequisites, postrequisites, expanded = false, idPrefix = "" }: { courseCode: string; requisites: CourseRequisitesSnapshot; prerequisites?: PrerequisiteTreeData; postrequisites?: PostrequisiteNode[]; expanded?: boolean; idPrefix?: string })
{
  const graph = buildCourseGraph(courseCode, requisites, prerequisites, postrequisites);
  const layout = layoutCourseGraph(graph);
  return <>
    <TreeViewport courseCode={courseCode} expanded={expanded} height={layout.height}>
      <div data-tree-graph className={styles.graph} style={{ width: layout.width, height: layout.height }}>
        <svg className={styles.graphLines} width={layout.width} height={layout.height} aria-hidden="true">
          {layout.paths.map(edge => <path key={`${edge.from}:${edge.to}`} data-from={edge.from} data-to={edge.to} d={edge.path} />)}
        </svg>
        <ul className={styles.graphNodes} aria-label="Courses and requirements">
          {layout.nodes.map(node => <li key={node.id} data-graph-node={node.id} data-node-kind={node.kind} data-course-column={node.kind === "course" ? node.column : undefined} className={`${styles.graphNode} ${node.kind === "condition" ? styles.graphCondition : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
            {node.kind === "course" && node.course ? <CourseNode course={node.course} column={node.column} current={node.id === graph.root} />
              : node.href ? <a className={node.kind === "remarks" ? styles.remarksLink : `${styles.graphLabel} ${styles.detailsLink}`} href={node.href.replace(/^#/, `#${idPrefix}`)} aria-label={node.title}>{node.label}</a>
              : <span className={styles.graphLabel} title={node.title}>{node.label}</span>}
          </li>)}
        </ul>
      </div>
    </TreeViewport>
    <ul className="sr-only" aria-label="Prerequisite requirements">
      {graph.requirements.map(item => <li key={item.courseCode}>{item.courseCode}: {item.rules.length + Number(item.textOnly) > 1 ? "requirements vary by programme: " : ""}{item.rules.map(graphRuleText).join("; ")}{item.textOnly ? "; see recorded requirements below" : ""}.</li>)}
    </ul>
    {graph.postrequisites.length ? <ul className="sr-only" aria-label="Postrequisite courses">
      {graph.postrequisites.map(item => <li key={`${item.courseCode}:${item.prerequisite}`}>{item.courseCode} needs {item.prerequisite}.</li>)}
    </ul> : null}
  </>;
}
