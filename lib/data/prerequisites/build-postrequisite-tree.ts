import type { CourseRequisitesSnapshot, PostrequisiteNode } from "./types";

// Traverse breadth-first so a shared course expands along its shortest path.
// Every edge remains visible, but each course is loaded and expanded only once.
export async function buildPostrequisiteTree(
  courseCode: string,
  requisites: CourseRequisitesSnapshot,
  readRequisites: (courseCode: string) => Promise<CourseRequisitesSnapshot | null>,
): Promise<PostrequisiteNode[]>
{
  const roots: PostrequisiteNode[] = [];
  const seen = new Set([courseCode]);
  let frontier = [{ requisites, dependents: roots }];

  while (frontier.length)
  {
    const next: PostrequisiteNode[] = [];
    for (const parent of frontier)
    {
      for (const dependent of parent.requisites.dependentCourses)
      {
        const course = parent.requisites.coursesByCode[dependent.courseCode];
        const reference = seen.has(course.courseCode);
        const node: PostrequisiteNode = { course, dependents: [], ...(reference ? { reference: true } : {}) };
        parent.dependents.push(node);
        if (reference) continue;
        seen.add(course.courseCode);
        if (course.availability === "catalogued") next.push(node);
      }
    }
    const snapshots = await Promise.all(next.map(node => readRequisites(node.course.courseCode)));
    frontier = next.flatMap((node, index) => {
      const requisites = snapshots[index];
      return requisites ? [{ requisites, dependents: node.dependents }] : [];
    });
  }

  return roots;
}
