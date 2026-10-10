import { z } from "zod";
import { courseCodeSchema } from "@/lib/validation/timetable";
import { buildRequisites } from "./build-requisites";
import { prerequisiteEvidence, reconcileReviews, validateExtraction } from "./import-review";
import { canonicalizeRule, compareCodeUnits, courseLeaves } from "./rule";
import { fingerprint, occurrenceSchema, registrySchema, reviewFileSchema, stableSerialize, validateRegistry, validateReviewTime } from "./review-input";
import type { PlanRegistry, RuleReviewFile } from "./review-input";
import type { CourseNodeSummary, PlanRecord, PrerequisiteRuleNode, RuleRecord } from "./types";

export const BATCH_POLICY_VERSION = 1;
export type StoredCurriculum = { plans: PlanRecord[]; rules: RuleRecord[] };
const decisionSchema = z.enum(["approved", "source_only", "excluded", "pending"]);
const ruleProposalSchema = z.object({ ruleKey: z.string(), expectedInputHash: z.string(), decision: decisionSchema, approvedRule: z.unknown().nullable(), reasons: z.array(z.string()), rawText: z.string(), normalizedText: z.string().optional(), parserNotes: z.array(z.string()).optional(), programmeName: z.string(), courseCode: z.string(), applicabilityLabel: z.string(), sourcePath: z.string(), pages: z.array(z.number().int().positive()), sourceOccurrences: z.array(occurrenceSchema), parseStatus: z.enum(["parsed", "review_required", "unparsed"]) }).strict();
const payloadSchema = z.object({ formatVersion: z.literal(1), policyVersion: z.literal(BATCH_POLICY_VERSION), createdAt: z.iso.datetime(), extractionSha256: z.string().regex(/^[a-f0-9]{64}$/), storedStateHash: z.string(), catalogueHash: z.string(), registry: registrySchema, baseReviews: reviewFileSchema,
  plans: z.array(z.object({ planKey: z.string(), expectedInputHash: z.string(), decision: z.enum(["included", "excluded", "pending"]), reasons: z.array(z.string()) }).strict()), rules: z.array(ruleProposalSchema),
  extractionIssues: z.array(z.object({ severity: z.string(), issue: z.string(), planKey: z.string().nullable(), courseCode: z.string().nullable(), page: z.number().int().nullable() }).strict()),
}).strict();
export const batchSchema = payloadSchema.extend({ batchId: z.string() }).strict();
export type ReviewBatch = z.infer<typeof batchSchema>;
export const triageSchema = z.object({ formatVersion: z.literal(1), batchId: z.string(), plans: z.array(z.object({ planKey: z.string(), expectedInputHash: z.string(), decision: z.enum(["included", "excluded", "pending"]), notes: z.string().optional() }).strict()), rules: z.array(z.object({ ruleKey: z.string(), expectedInputHash: z.string(), decision: decisionSchema, approvedRule: z.unknown().optional(), notes: z.string().optional() }).strict()) }).strict();
export type BatchTriage = z.infer<typeof triageSchema>;
const sorted = <T>(values: T[], key: (value: T) => string) => [...values].sort((a, b) => compareCodeUnits(key(a), key(b)));
export const storedStateHash = (stored: StoredCurriculum) => fingerprint("curriculum-state", { plans: sorted(stored.plans, plan => plan.planKey), rules: sorted(stored.rules, rule => rule.ruleKey) });
export const catalogueHash = (catalogue: CourseNodeSummary[]) => fingerprint("curriculum-catalogue", sorted(catalogue, course => course.courseCode));
const digestSlug = (value: string) => fingerprint("scope", value).slice(-12);
const slug = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function draftRegistry(extraction: ReturnType<typeof validateExtraction>, previous: PlanRegistry): PlanRegistry
{
  const plans: PlanRegistry["plans"] = [];
  const used = new Set(previous.plans.map(plan => plan.planKey));
  for (const source of sorted(extraction.review.plans, plan => plan.sourceHash))
  {
    const old = previous.plans.find(plan => plan.sourceHash === source.sourceHash) ?? previous.plans.find(plan => plan.sourcePath === source.sourcePath);
    const programmeName = z.string().trim().min(1).parse(source.programmeName);
    const studyMode = z.enum(["full-time", "part-time"]).nullable().parse(source.studyMode ?? null);
    const baseKey = slug([programmeName, studyMode].filter(Boolean).join(" ")) || `programme-${source.sourceHash.slice(0, 12)}`;
    const planKey = old?.planKey ?? (used.has(baseKey) ? `${baseKey}-${source.sourceHash.slice(0, 12)}` : baseKey);
    if (!old && used.has(planKey)) throw new Error("Automatic programme identity collision; assign a plan key explicitly");
    used.add(planKey);
    const plan = old ? structuredClone(old) : { planKey, programmeName, studyMode, curriculumVersion: null, effectiveFrom: null, sourceHash: source.sourceHash, sourcePath: source.sourcePath, sourceLabel: `${programmeName} curriculum plan`, sourceUrl: null, scopes: [], sectionMappings: [], publication: null } as PlanRegistry["plans"][number];
    plan.sourcePath = source.sourcePath;
    if (plan.sourceHash !== source.sourceHash) { plan.sourceHash = source.sourceHash; plan.publication = null; }
    const entries = extraction.review.sourceEntries.filter(entry => entry.planKey === source.planKey && entry.recordType === "offering" && prerequisiteEvidence(entry));
    for (const section of [...new Set(entries.map(entry => entry.section))].sort((a, b) => compareCodeUnits(a ?? "", b ?? "")))
    {
      if (plan.sectionMappings.some(mapping => mapping.extractedSection === section)) continue;
      const applicabilityKey = section === null ? "unidentified-section" : `section-${digestSlug(section)}`;
      if (plan.scopes.some(scope => scope.applicabilityKey === applicabilityKey)) throw new Error("Scope identity collision; assign scope explicitly");
      plan.scopes.push({ applicabilityKey, applicabilityLabel: section === null ? "Source section unidentified; applicability unverified" : `Source section: ${section}` });
      plan.sectionMappings.push({ extractedSection: section, applicabilityKey });
    }
    // A document without statements is still visible in the programme review list.
    if (!plan.scopes.length) plan.scopes.push({ applicabilityKey: "no-statements", applicabilityLabel: "No extracted prerequisite statements" });
    // Preserve conflicting occurrences separately for triage rather than choosing one.
    const groups = new Map<string, typeof entries>();
    for (const entry of entries)
    {
      const scope = plan.sectionMappings.find(mapping => mapping.extractedSection === entry.section)!.applicabilityKey;
      const key = `${courseCodeSchema.parse(entry.courseCode)}:${scope}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    for (const group of groups.values())
    {
      if (new Set(group.map(entry => stableSerialize({ rawText: prerequisiteEvidence(entry), parserRule: entry.parserRule, parseStatus: entry.parseStatus }))).size <= 1) continue;
      for (const entry of group)
      {
        if (entry.sourceTable === null || entry.sourceRow === null) throw new Error("Conflicting source lacks table/row coordinates");
        plan.occurrenceScopeOverrides ??= [];
        if (plan.occurrenceScopeOverrides.some(item => item.page === entry.sourcePage && item.table === entry.sourceTable && item.row === entry.sourceRow)) continue;
        const applicabilityKey = `occurrence-${entry.sourcePage}-${entry.sourceTable}-${entry.sourceRow}`;
        if (!plan.scopes.some(scope => scope.applicabilityKey === applicabilityKey)) plan.scopes.push({ applicabilityKey, applicabilityLabel: `Conflicting source occurrence: page ${entry.sourcePage}, table ${entry.sourceTable}, row ${entry.sourceRow}; scope requires verification` });
        plan.occurrenceScopeOverrides.push({ page: entry.sourcePage, table: entry.sourceTable, row: entry.sourceRow, applicabilityKey });
      }
    }
    plans.push(plan);
  }
  // Retain omitted registered identities without claiming a current source decision.
  for (const old of previous.plans) if (!plans.some(plan => plan.planKey === old.planKey)) plans.push({ ...structuredClone(old), publication: null });
  return validateRegistry({ formatVersion: 1, plans: sorted(plans, plan => plan.planKey) });
}

function archiveStaleReviews(reviews: RuleReviewFile, current: Map<string, string>): RuleReviewFile
{
  return { ...reviews, reviews: reviews.reviews.map(review => !review.archived && current.get(review.ruleKey) !== review.expectedInputHash ? { ...review, archived: true } : review) };
}

export function prepareReviewBatch(extractionInput: unknown, extractionSha256: string, registryInput: unknown, reviewsInput: unknown, stored: StoredCurriculum, catalogue: CourseNodeSummary[], now = new Date()): ReviewBatch
{
  const extraction = validateExtraction(extractionInput);
  const registry = draftRegistry(extraction, validateRegistry(registryInput));
  const reviews = reviewFileSchema.parse(reviewsInput);
  const initial = reconcileReviews(extraction, registry, { ...reviews, reviews: [] }, stored, now);
  const baseReviews = archiveStaleReviews(reviews, new Map(initial.report.inputs.map(input => [input.ruleKey, input.expectedInputHash])));
  const next = reconcileReviews(extraction, registry, baseReviews, stored, now);
  const known = new Set(catalogue.map(course => course.courseCode));
  const plans = next.report.publicationInputs.map(input => {
    const record = next.plans.find(plan => plan.planKey === input.planKey)!;
    return { planKey: input.planKey, expectedInputHash: input.expectedInputHash, decision: record.publicationStatus === "unreviewed" ? "included" as const : record.publicationStatus, reasons: ["Automatically prepared source/programme mapping; batch approval confirms it", ...(!record.studyMode ? ["Study mode not supplied; displayed as unknown"] : []), ...(!record.curriculumVersion ? ["Curriculum version not supplied; no cohort/version inferred"] : [])] };
  });
  const rules = next.rules.filter(rule => rule.recordStatus === "active" && next.report.inputs.some(input => input.ruleKey === rule.ruleKey)).map(rule => {
    const plan = next.plans.find(plan => plan.planKey === rule.planKey)!;
    const reasons = next.report.diagnostics.filter(item => item.ruleKey === rule.ruleKey).flatMap(item => item.messages);
    if (rule.applicabilityKey === "unidentified-section" || rule.applicabilityKey.startsWith("occurrence-")) reasons.push("Applicability requires triage before a structured approval");
    if (!known.has(rule.courseCode)) reasons.push("Target course absent from catalogue snapshot");
    let tree: PrerequisiteRuleNode | null = null;
    if (rule.parseStatus === "parsed" && rule.ruleJson !== null)
    {
      try { tree = canonicalizeRule(rule.ruleJson); }
      catch (error) { reasons.push(`Invalid candidate: ${(error as Error).message}`); }
    }
    if (tree)
    {
      if (courseLeaves(tree).includes(rule.courseCode)) reasons.push("Self-reference requires triage");
      const unknown = courseLeaves(tree).filter(code => !known.has(code));
      if (unknown.length) reasons.push(`References absent from catalogue snapshot: ${unknown.join(", ")}`);
    }
    else reasons.push("No fully consumed supported expression; preserve original text");
    const decision = rule.reviewStatus !== "pending" ? rule.reviewStatus : tree && !reasons.length ? "approved" : "source_only";
    const sourcePlan = extraction.review.plans.find(source => source.sourceHash === plan.sourceHash);
    const sourceEntry = extraction.review.sourceEntries.find(entry => entry.planKey === sourcePlan?.planKey && rule.sourceOccurrences.some(occurrence => occurrence.page === entry.sourcePage && occurrence.table === entry.sourceTable && occurrence.row === entry.sourceRow));
    return { ruleKey: rule.ruleKey, expectedInputHash: rule.reviewInputHash, decision, approvedRule: decision === "approved" ? rule.approvedRuleJson ?? tree : tree, reasons: [...new Set(reasons)].sort(compareCodeUnits), rawText: rule.rawText, ...(sourceEntry?.prerequisiteNormalizedText ? { normalizedText: sourceEntry.prerequisiteNormalizedText } : {}), ...(sourceEntry?.prerequisiteNotes?.length ? { parserNotes: sourceEntry.prerequisiteNotes } : {}), programmeName: plan.programmeName, courseCode: rule.courseCode, applicabilityLabel: rule.applicabilityLabel, sourcePath: plan.sourcePath, pages: [...new Set(rule.sourceOccurrences.map(item => item.page))].sort((a, b) => a - b), sourceOccurrences: rule.sourceOccurrences, parseStatus: rule.parseStatus };
  });
  const payload = payloadSchema.parse({ formatVersion: 1, policyVersion: BATCH_POLICY_VERSION, createdAt: now.toISOString(), extractionSha256, storedStateHash: storedStateHash(stored), catalogueHash: catalogueHash(catalogue), registry, baseReviews, plans: sorted(plans, plan => plan.planKey), rules: sorted(rules, rule => rule.ruleKey), extractionIssues: extraction.review.issues.map(issue => ({ severity: issue.severity, issue: issue.issue, planKey: typeof issue.planKey === "string" ? issue.planKey : null, courseCode: typeof issue.courseCode === "string" ? issue.courseCode : null, page: typeof issue.sourcePage === "number" ? issue.sourcePage : null })) });
  return { ...payload, batchId: fingerprint("curriculum-batch", payload) };
}

export function validateBatch(input: unknown): ReviewBatch
{
  const batch = batchSchema.parse(input);
  const { batchId, ...payload } = batch;
  if (fingerprint("curriculum-batch", payload) !== batchId) throw new Error("Batch contents changed; prepare a new batch");
  if (new Set(batch.plans.map(plan => plan.planKey)).size !== batch.plans.length || new Set(batch.rules.map(rule => rule.ruleKey)).size !== batch.rules.length) throw new Error("Duplicate batch proposal");
  return batch;
}
export const emptyTriage = (batch: ReviewBatch): BatchTriage => ({ formatVersion: 1, batchId: batch.batchId, plans: [], rules: [] });
export function reviewBatch(batchInput: unknown, triageInput?: unknown)
{
  const batch = validateBatch(batchInput);
  const triage = triageSchema.parse(triageInput ?? emptyTriage(batch));
  if (triage.batchId !== batch.batchId) throw new Error("Triage belongs to a different batch");
  const check = (entries: Array<{ expectedInputHash: string }>, keys: string[], proposals: Array<{ expectedInputHash: string }>, proposalKeys: string[]) => {
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate triage decision");
    entries.forEach((entry, index) => { const proposal = proposals[proposalKeys.indexOf(keys[index])]; if (!proposal || proposal.expectedInputHash !== entry.expectedInputHash) throw new Error("Unknown or stale triage decision"); });
  };
  check(triage.plans, triage.plans.map(plan => plan.planKey), batch.plans, batch.plans.map(plan => plan.planKey));
  check(triage.rules, triage.rules.map(rule => rule.ruleKey), batch.rules, batch.rules.map(rule => rule.ruleKey));
  const normalized = { ...triage, plans: sorted(triage.plans, plan => plan.planKey), rules: sorted(triage.rules.map(rule => ({ ...rule, ...(rule.decision === "approved" && rule.approvedRule !== undefined ? { approvedRule: canonicalizeRule(rule.approvedRule) } : {}) })), rule => rule.ruleKey) };
  const plans = batch.plans.map(plan => ({ ...plan, ...normalized.plans.find(entry => entry.planKey === plan.planKey) }));
  const rules = batch.rules.map(rule => {
    const edited = normalized.rules.find(entry => entry.ruleKey === rule.ruleKey);
    const result = { ...rule, ...edited };
    if (result.decision === "approved")
    {
      const tree = canonicalizeRule(result.approvedRule);
      result.approvedRule = tree;
      if (courseLeaves(tree).includes(result.courseCode)) throw new Error("Self-reference cannot be batch approved");
      if (result.reasons.some(reason => /Applicability requires triage/.test(reason))) throw new Error("Resolve applicability in the registry and prepare a new batch before structuring this rule");
    }
    return result;
  });
  return { batch, plans, rules, triage: normalized, approvalId: fingerprint("curriculum-batch-approval", { batchId: batch.batchId, triage: normalized }) };
}

export function materializeBatch(batchInput: unknown, triageInput: unknown, extraction: unknown, extractionSha256: string, stored: StoredCurriculum, catalogue: CourseNodeSummary[], reviewerAlias: string, now = new Date())
{
  if (!reviewerAlias.trim()) throw new Error("Reviewer alias is required for explicit batch approval");
  validateReviewTime(now.toISOString(), now);
  const reviewed = reviewBatch(batchInput, triageInput);
  const { batch } = reviewed;
  if (batch.extractionSha256 !== extractionSha256) throw new Error("Extraction changed; prepare a new batch");
  if (batch.storedStateHash !== storedStateHash(stored)) throw new Error("Database decisions or records changed; prepare a new batch");
  if (batch.catalogueHash !== catalogueHash(catalogue)) throw new Error("Catalogue changed; prepare a new batch");
  const registry = structuredClone(batch.registry);
  const reviews = structuredClone(batch.baseReviews);
  for (const proposal of reviewed.plans)
  {
    const plan = registry.plans.find(plan => plan.planKey === proposal.planKey);
    if (!plan) throw new Error("Unknown publication proposal");
    if (proposal.decision === "pending")
    {
      if (stored.plans.some(old => old.planKey === proposal.planKey && old.publicationStatus !== "unreviewed" && old.publicationInputHash === proposal.expectedInputHash)) throw new Error("Pending cannot silently revoke publication; explicitly exclude or retain it");
      plan.publication = null; continue;
    }
    if (plan.publication?.decision === proposal.decision && plan.publication.expectedInputHash === proposal.expectedInputHash) continue;
    plan.publication = { decision: proposal.decision, expectedInputHash: proposal.expectedInputHash, reviewerAlias: reviewerAlias.trim(), reviewedAt: now.toISOString(), notes: proposal.notes ?? `Batch approval ${reviewed.approvalId}; prepared by policy ${BATCH_POLICY_VERSION}` };
  }
  for (const proposal of reviewed.rules)
  {
    const existing = reviews.reviews.find(entry => !entry.archived && entry.ruleKey === proposal.ruleKey);
    if (proposal.decision === "pending")
    {
      if (existing || stored.rules.some(rule => rule.ruleKey === proposal.ruleKey && rule.reviewStatus !== "pending" && rule.reviewInputHash === proposal.expectedInputHash)) throw new Error("Pending cannot silently revoke an existing decision; explicitly exclude or retain it");
      continue;
    }
    const tree = proposal.decision === "approved" ? canonicalizeRule(proposal.approvedRule) : null;
    if (existing?.expectedInputHash === proposal.expectedInputHash && existing.decision === proposal.decision && (proposal.decision !== "approved" || existing.decision === "approved" && stableSerialize(canonicalizeRule(existing.approvedRule)) === stableSerialize(tree))) continue;
    if (existing)
    {
      if (existing.expectedInputHash === proposal.expectedInputHash) reviews.reviews.splice(reviews.reviews.indexOf(existing), 1);
      else existing.archived = true;
    }
    const base = { ruleKey: proposal.ruleKey, expectedInputHash: proposal.expectedInputHash, reviewerAlias: reviewerAlias.trim(), reviewedAt: now.toISOString(), notes: proposal.notes ?? `Batch approval ${reviewed.approvalId}; prepared by policy ${BATCH_POLICY_VERSION}` };
    reviews.reviews.push(proposal.decision === "approved" ? { ...base, decision: "approved", approvedRule: tree } : { ...base, decision: proposal.decision });
  }
  const next = reconcileReviews(extraction, registry, reviews, stored, now);
  for (const proposal of reviewed.plans) if (!next.report.publicationInputs.some(input => input.planKey === proposal.planKey && input.expectedInputHash === proposal.expectedInputHash)) throw new Error("Publication evidence differs from inspected batch");
  for (const proposal of reviewed.rules) if (!next.report.inputs.some(input => input.ruleKey === proposal.ruleKey && input.expectedInputHash === proposal.expectedInputHash)) throw new Error("Rule evidence differs from inspected batch");
  return { ...reviewed, registry, reviews, next, coverage: buildRequisites(next.plans, next.rules, catalogue).report };
}
