import type { CourseRequisitesSnapshot, PrerequisiteSourceDetail } from "./types";

export function getPrerequisiteSourceDetails(courseCode: string, requisites: CourseRequisitesSnapshot): PrerequisiteSourceDetail[]
{
  const entries = new Map<string, PrerequisiteSourceDetail>();
  // Use every published variant: display deduplication must not discard plans
  // whose recorded text happens to match another plan.
  for (const variant of requisites.prerequisiteVariants) for (const key of variant.ruleKeys)
  {
    const source = requisites.sourcesByRuleKey[key];
    let entry = entries.get(source.planKey);
    if (!entry)
    {
      entry = { courseCode, planKey: source.planKey,
        programme: [source.programmeName, source.studyMode, source.curriculumVersion].filter(Boolean).join(" · "),
        prerequisites: [], remarks: [], pending: false };
      entries.set(source.planKey, entry);
    }
    const marker = /^\s*Remarks\s*:\s*/im.exec(source.rawText);
    const prerequisite = (marker ? source.rawText.slice(0, marker.index) : source.rawText).trim();
    const recordedRemark = marker ? source.rawText.slice(marker.index + marker[0].length).trim() : "";
    const remarks = variant.rule?.displayRemarks?.length ? variant.rule.displayRemarks : recordedRemark ? [recordedRemark] : [];
    if (prerequisite && !entry.prerequisites.includes(prerequisite)) entry.prerequisites.push(prerequisite);
    for (const text of remarks)
    {
      const remark = text.replace(/^\s*Remarks\s*:\s*/i, "").trim();
      if (remark && !entry.remarks.includes(remark)) entry.remarks.push(remark);
    }
    entry.pending ||= source.reviewStatus === "pending";
  }
  return [...entries.values()];
}
