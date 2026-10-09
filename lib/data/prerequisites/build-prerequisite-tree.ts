import { getDisplayPrerequisiteVariants } from "./display-variants";
import { getPrerequisiteSourceDetails } from "./source-details";
import type { CourseRequisitesSnapshot, ExpandedPrerequisiteRuleNode, PrerequisiteRuleNode, PrerequisiteTreeData } from "./types";

export async function buildPrerequisiteTree(
  courseCode: string,
  requisites: CourseRequisitesSnapshot,
  readRequisites: (courseCode: string) => Promise<CourseRequisitesSnapshot | null>,
): Promise<PrerequisiteTreeData>
{
  const result: PrerequisiteTreeData = { variants: [], remarks: [], sources: [] };
  const seen = new Set([courseCode]);
  let frontier = [{ courseCode, requisites, requirements: result.variants }];

  while (frontier.length)
  {
    const next: Extract<ExpandedPrerequisiteRuleNode, { type: "course" }>[] = [];
    for (const parent of frontier)
    {
      result.sources.push(...getPrerequisiteSourceDetails(parent.courseCode, parent.requisites));
      // Expand only reviewed course leaves. Conditions and original grouping
      // remain intact, and shared courses expand along their shortest route.
      const expandRule = (rule: PrerequisiteRuleNode): ExpandedPrerequisiteRuleNode => {
        if (rule.type === "course")
        {
          const course = parent.requisites.coursesByCode[rule.courseCode];
          const reference = seen.has(course.courseCode);
          const node: Extract<ExpandedPrerequisiteRuleNode, { type: "course" }> = {
            type: "course", courseCode: course.courseCode, course, requirements: [], ...(reference ? { reference: true } : {}),
          };
          if (!reference)
          {
            seen.add(course.courseCode);
            if (course.availability === "catalogued") next.push(node);
          }
          return node;
        }
        if (rule.type === "condition") return { type: "condition", text: rule.text };
        const children = rule.children.map(expandRule);
        return rule.type === "nOf" ? { type: "nOf", count: rule.count, children } : { type: rule.type, children };
      };
      const variants = getDisplayPrerequisiteVariants(parent.requisites);
      variants.forEach((variant, index) => {
        parent.requirements.push({ key: variant.key, rule: variant.rule ? expandRule(variant.rule) : null });
        const texts = variant.rule ? variant.rule.displayRemarks ?? [] : [...new Set(variant.ruleKeys.map(key => parent.requisites.sourcesByRuleKey[key].rawText))];
        if (texts.length) result.remarks.push({ courseCode: parent.courseCode, key: variant.key,
          ...(variants.length > 1 ? { number: index + 1 } : {}), pending: variant.reviewStatus === "pending", texts });
      });
    }
    const snapshots = await Promise.all(next.map(node => readRequisites(node.courseCode)));
    frontier = next.flatMap((node, index) => {
      const requisites = snapshots[index];
      return requisites ? [{ courseCode: node.courseCode, requisites, requirements: node.requirements }] : [];
    });
  }

  return result;
}
