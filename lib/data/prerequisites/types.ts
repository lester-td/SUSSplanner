export type PrerequisiteRuleNode = (
  | { type: "course"; courseCode: string }
  | { type: "all"; children: PrerequisiteRuleNode[] }
  | { type: "any"; children: PrerequisiteRuleNode[] }
  | { type: "nOf"; count: number; children: PrerequisiteRuleNode[] }
  | { type: "condition"; text: string }
) & { displayRemarks?: string[] };

export type SourceOccurrence = { page: number; table: number | null; row: number | null; section: string | null };
export type ReviewStatus = "pending" | "approved" | "source_only" | "excluded";
export type ParseStatus = "parsed" | "review_required" | "unparsed";
export type CourseNodeSummary = {
  courseCode: string;
  courseName: string | null;
  href: string | null;
  availability: "catalogued" | "unknown";
  offeredSemesters: Array<{ semesterId: number; semesterName: string }>;
};
export type PublicRuleSource = {
  planKey: string;
  programmeName: string;
  studyMode: "full-time" | "part-time" | null;
  curriculumVersion: string | null;
  effectiveFrom: string | null;
  applicabilityLabel: string;
  rawText: string;
  parseStatus: ParseStatus;
  source: { label: string; pages: number[]; url: string | null };
} & (
  | { reviewStatus: "approved" | "source_only"; reviewedAt: string }
  | { reviewStatus: "pending"; reviewedAt: null }
);
export type PrerequisiteVariant =
  | { key: string; reviewStatus: "approved"; rule: PrerequisiteRuleNode; ruleKeys: string[] }
  | { key: string; reviewStatus: "source_only" | "pending"; rule: null; ruleKeys: string[] };
export type CourseRequisitesSnapshot = {
  prerequisiteVariants: PrerequisiteVariant[];
  dependentCourses: Array<{ courseCode: string; ruleKeys: string[] }>;
  coursesByCode: Record<string, CourseNodeSummary>;
  sourcesByRuleKey: Record<string, PublicRuleSource>;
};
export type PostrequisiteNode = {
  course: CourseNodeSummary;
  dependents: PostrequisiteNode[];
  reference?: boolean;
};
export type ExpandedPrerequisiteRuleNode =
  | { type: "course"; courseCode: string; course: CourseNodeSummary; requirements: ExpandedPrerequisiteVariant[]; reference?: boolean }
  | { type: "condition"; text: string }
  | { type: "all"; children: ExpandedPrerequisiteRuleNode[] }
  | { type: "any"; children: ExpandedPrerequisiteRuleNode[] }
  | { type: "nOf"; count: number; children: ExpandedPrerequisiteRuleNode[] };
export type ExpandedPrerequisiteVariant = { key: string; rule: ExpandedPrerequisiteRuleNode | null };
export type PrerequisiteRemark = { courseCode: string; key: string; number?: number; pending: boolean; texts: string[] };
export type PrerequisiteSourceDetail = { courseCode: string; planKey: string; programme: string; prerequisites: string[]; remarks: string[]; pending: boolean };
export type PrerequisiteTreeData = { variants: ExpandedPrerequisiteVariant[]; remarks: PrerequisiteRemark[]; sources: PrerequisiteSourceDetail[] };
export type PlanRecord = {
  planKey: string;
  programmeName: string;
  studyMode: "full-time" | "part-time" | null;
  curriculumVersion: string | null;
  effectiveFrom: string | null;
  sourceHash: string;
  sourcePath: string;
  sourceLabel: string;
  sourceUrl: string | null;
  publicationInputHash: string;
  publicationStatus: "unreviewed" | "included" | "excluded";
  reviewedPublicationInputHash: string | null;
  publicationReviewedBy: string | null;
  publicationReviewedAt: string | null;
  publicationReviewNotes: string | null;
  lastUpdated: string;
};
export type RuleRecord = {
  ruleKey: string;
  planKey: string;
  courseCode: string;
  applicabilityKey: string;
  applicabilityLabel: string;
  rawText: string;
  parseStatus: ParseStatus;
  ruleJson: unknown;
  parserContractVersion: number;
  evidenceDiagnostics: string[];
  sourceHash: string;
  sourceOccurrences: SourceOccurrence[];
  recordStatus: "active" | "inactive";
  reviewStatus: ReviewStatus;
  reviewInputHash: string;
  reviewedInputHash: string | null;
  approvedRuleJson: PrerequisiteRuleNode | null;
  approvedRuleHash: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  lastUpdated: string;
};
