import { z } from "zod";
import { courseCodeSchema } from "@/lib/validation/timetable";
import { canonicalizeRule, compareCodeUnits, courseLeaves, prerequisiteTextSchema, validateJsonBudget } from "./rule";
import { approvedRuleHash, normalizeTimestamp, publicationHash, publicationInput, ruleInput, reviewFileSchema, reviewInputHash, sortedOccurrences, stableSerialize, validateRegistry, validateReviewTime } from "./review-input";
import { validatePlanRecord, validateRuleRecord } from "./build-requisites";
import type { PlanRecord, RuleRecord } from "./types";

export const extractionSchema = z.object({
  metadata: z.object({ parserContractVersion: z.union([z.literal(1), z.literal(2)]), planCount: z.number().int().nonnegative(), entryCount: z.number().int().nonnegative(), courseLikeRowCount: z.number().int().nonnegative() }).passthrough(),
  review: z.object({
    plans: z.array(z.object({ planKey: z.string(), sourceHash: z.string(), sourcePath: z.string(), courseLikeRowCount: z.number().int().nonnegative(), entryCount: z.number().int().nonnegative() }).passthrough()),
    sourceEntries: z.array(z.object({ planKey: z.string(), courseCode: z.string(), recordType: z.string(), section: z.string().nullable(), sourcePage: z.number().int().positive(), sourceTable: z.number().int().positive().nullable(), sourceRow: z.number().int().positive().nullable(), prerequisite: z.string().nullable(), remarks: z.string().nullable().optional(), prerequisiteSourceFields: z.array(z.enum(["prerequisite", "remarks"])).max(2).optional(), prerequisiteRemarksCategories: z.array(z.string()).optional(), prerequisiteEvidenceText: prerequisiteTextSchema.optional(), prerequisiteNormalizedText: prerequisiteTextSchema.optional(), prerequisiteNotes: z.array(z.string()).optional(), parserContractVersion: z.union([z.literal(1), z.literal(2)]).optional(), parseStatus: z.enum(["parsed", "review_required", "unparsed"]).optional(), parserRule: z.unknown().optional(), prerequisiteDiagnostics: z.array(z.string()).optional(), warnings: z.array(z.string()).optional() }).passthrough()),
    issues: z.array(z.object({ severity: z.string(), issue: z.string() }).passthrough()),
  }).passthrough(),
}).passthrough();

export function prerequisiteEvidence(entry: { prerequisite: string | null; remarks?: string | null; prerequisiteEvidenceText?: string; parserContractVersion?: number; prerequisiteSourceFields?: Array<"prerequisite" | "remarks"> })
{
  if (entry.parserContractVersion === 2)
  {
    const fields = entry.prerequisiteSourceFields;
    if (!fields) throw new Error("Source entry missing remarks scan; regenerate extraction");
    const expected = [...(entry.prerequisite ? ["prerequisite"] : []), ...(entry.remarks && (entry.prerequisite || fields.length) ? ["remarks"] : [])];
    if (stableSerialize(fields) !== stableSerialize(expected)) throw new Error("Prerequisite source cells were omitted or do not exist");
    if (!fields.length)
    {
      if (entry.prerequisiteEvidenceText !== undefined) throw new Error("Unexpected prerequisite evidence without source cells");
      return null;
    }
    const evidence = [...(entry.prerequisite ? [entry.prerequisite] : []), ...(entry.remarks ? [`Remarks: ${entry.remarks}`] : [])].join("\n");
    prerequisiteTextSchema.parse(evidence);
    if (entry.prerequisiteEvidenceText !== evidence) throw new Error("Prerequisite evidence differs from its source cells");
    return evidence;
  }
  if (!entry.prerequisite) return null;
  const refersToRemarks = /(?:see|refer to)\s+(?:the\s+)?remarks\b/i.test(entry.prerequisite);
  const evidence = entry.prerequisite + (refersToRemarks && entry.remarks ? `\nRemarks: ${entry.remarks}` : "");
  prerequisiteTextSchema.parse(evidence);
  if (entry.prerequisiteEvidenceText !== undefined && entry.prerequisiteEvidenceText !== evidence) throw new Error("Prerequisite evidence differs from its source cells");
  return evidence;
}

export function validateExtraction(input: unknown)
{
  const extraction = extractionSchema.parse(input);
  const { metadata, review } = extraction;
  if (metadata.planCount !== review.plans.length || metadata.entryCount !== review.sourceEntries.length || metadata.courseLikeRowCount !== review.sourceEntries.length || review.issues.some(issue => issue.severity === "error")) throw new Error("Extraction is incomplete or contains errors; import refused");
  if (new Set(review.plans.map(plan => plan.planKey)).size !== review.plans.length || new Set(review.plans.map(plan => plan.sourceHash)).size !== review.plans.length) throw new Error("Duplicate extracted source identity");
  for (const plan of review.plans)
    if (plan.courseLikeRowCount !== plan.entryCount || plan.entryCount !== review.sourceEntries.filter(entry => entry.planKey === plan.planKey).length) throw new Error(`Incomplete extraction: ${plan.sourcePath}`);
  const keys = new Set(review.plans.map(plan => plan.planKey));
  if (review.sourceEntries.some(entry => !keys.has(entry.planKey))) throw new Error("Entry references unknown extracted plan");
  for (const entry of review.sourceEntries)
  {
    if (metadata.parserContractVersion === 2 && entry.recordType === "offering" && entry.parserContractVersion !== 2) throw new Error("Source entry missing remarks scan; regenerate extraction");
    if (entry.recordType === "offering" || entry.prerequisite) prerequisiteEvidence(entry);
  }
  return extraction;
}

function clearRuleDecision(rule: RuleRecord): RuleRecord
{
  return { ...rule, reviewStatus: "pending", reviewedInputHash: null, approvedRuleJson: null, approvedRuleHash: null, reviewedBy: null, reviewedAt: null, reviewNotes: null };
}
function content(record: PlanRecord | RuleRecord)
{
  const { lastUpdated: _lastUpdated, ...rest } = record;
  return stableSerialize(rest);
}
export function reconcileReviews(extractionInput: unknown, registryInput: unknown, reviewsInput: unknown, stored: { plans: PlanRecord[]; rules: RuleRecord[] }, now = new Date())
{
  const extraction = validateExtraction(extractionInput);
  const registry = validateRegistry(registryInput);
  const reviews = reviewFileSchema.parse(reviewsInput);
  const nowIso = now.toISOString();
  const extracted = extraction.review;
  const extractedPlans = new Map(extracted.plans.map(plan => [plan.planKey, plan]));
  const plans = new Map(stored.plans.map(plan => [plan.planKey, plan]));
  const rules = new Map(stored.rules.map(rule => [rule.ruleKey, rule]));
  const sourceRegistry = new Map(registry.plans.map(plan => [plan.sourceHash, plan]));
  const report = { unmappedSources: [] as string[], unmappedScopes: [] as string[], missingActiveRules: [] as string[], diagnostics: [] as { ruleKey: string; messages: string[] }[], inputs: [] as { ruleKey: string; expectedInputHash: string; parseStatus: string; input: ReturnType<typeof ruleInput> }[], publicationInputs: [] as { planKey: string; expectedInputHash: string; input: ReturnType<typeof publicationInput> }[] };
  const touchedPlanKeys = new Set<string>();
  for (const source of extracted.plans)
  {
    const binding = sourceRegistry.get(source.sourceHash);
    if (!binding) { report.unmappedSources.push(source.sourcePath); continue; }
    touchedPlanKeys.add(binding.planKey);
    const previous = plans.get(binding.planKey);
    const { scopes: _scopes, sectionMappings: _mappings, occurrenceScopeOverrides: _overrides, publication, ...metadata } = binding;
    const inputHash = publicationHash(metadata);
    let plan: PlanRecord = { ...metadata, publicationInputHash: inputHash, publicationStatus: "unreviewed", reviewedPublicationInputHash: null, publicationReviewedBy: null, publicationReviewedAt: null, publicationReviewNotes: null, lastUpdated: nowIso };
    if (previous?.publicationInputHash === inputHash) plan = { ...previous, ...metadata };
    if (publication)
    {
      if (publication.expectedInputHash !== inputHash) throw new Error(`Stale publication decision: ${binding.planKey}; expected ${inputHash}`);
      validateReviewTime(publication.reviewedAt, now);
      plan = { ...plan, publicationStatus: publication.decision, reviewedPublicationInputHash: inputHash, publicationReviewedBy: publication.reviewerAlias, publicationReviewedAt: normalizeTimestamp(publication.reviewedAt), publicationReviewNotes: publication.notes ?? null };
    }
    plans.set(plan.planKey, plan);
    report.publicationInputs.push({ planKey: plan.planKey, expectedInputHash: inputHash, input: publicationInput(plan) });
  }
  for (const binding of registry.plans)
  {
    if (binding.publication && !touchedPlanKeys.has(binding.planKey)) throw new Error(`Publication decision has no current extracted source: ${binding.planKey}`);
  }
  const deactivations = new Set<string>();
  for (const entry of reviews.deactivations)
  {
    validateReviewTime(entry.reviewedAt, now);
    const previous = rules.get(entry.ruleKey);
    if (!previous || previous.reviewInputHash !== entry.expectedInputHash || deactivations.has(entry.ruleKey)) throw new Error(`Unknown/duplicate/stale deactivation: ${entry.ruleKey}`);
    deactivations.add(entry.ruleKey);
    rules.set(entry.ruleKey, { ...previous, recordStatus: "inactive" });
  }
  const incoming = new Map<string, RuleRecord>();
  for (const entry of extracted.sourceEntries)
  {
    const source = extractedPlans.get(entry.planKey);
    if (!source) throw new Error(`Entry references unknown extracted plan: ${entry.planKey}`);
    const binding = sourceRegistry.get(source.sourceHash);
    if (!binding || entry.recordType !== "offering") continue;
    const evidence = prerequisiteEvidence(entry);
    if (!evidence) continue;
    const override = (binding.occurrenceScopeOverrides ?? []).find(item => item.page === entry.sourcePage && item.table === entry.sourceTable && item.row === entry.sourceRow);
    const scopeKey = override?.applicabilityKey ?? binding.sectionMappings.find(mapping => mapping.extractedSection === entry.section)?.applicabilityKey;
    if (!scopeKey) { report.unmappedScopes.push(`${binding.planKey}: ${entry.section ?? "(no section)"}`); continue; }
    const scope = binding.scopes.find(item => item.applicabilityKey === scopeKey)!;
    if (entry.parserContractVersion !== extraction.metadata.parserContractVersion || !entry.parseStatus || entry.parserRule === undefined) throw new Error("Source entry missing parser contract; regenerate extraction");
    const code = courseCodeSchema.parse(entry.courseCode);
    const ruleKey = `prerequisite:${binding.planKey}:${code}:${scopeKey}`;
    if (entry.parserRule !== null) validateJsonBudget(entry.parserRule, true);
    const rule: RuleRecord = { ruleKey, planKey: binding.planKey, courseCode: code, applicabilityKey: scopeKey, applicabilityLabel: scope.applicabilityLabel, rawText: evidence, parseStatus: entry.parseStatus, ruleJson: entry.parserRule, parserContractVersion: entry.parserContractVersion, sourceHash: source.sourceHash, sourceOccurrences: [{ page: entry.sourcePage, table: entry.sourceTable, row: entry.sourceRow, section: entry.section }], recordStatus: "active", reviewStatus: "pending", reviewInputHash: "", reviewedInputHash: null, approvedRuleJson: null, approvedRuleHash: null, reviewedBy: null, reviewedAt: null, reviewNotes: null, lastUpdated: nowIso };
    const duplicate = incoming.get(ruleKey);
    if (duplicate)
    {
      if (duplicate.rawText !== rule.rawText || duplicate.parseStatus !== rule.parseStatus || stableSerialize(duplicate.ruleJson) !== stableSerialize(rule.ruleJson)) throw new Error(`Conflicting occurrences in scope: ${ruleKey}`);
      duplicate.sourceOccurrences = sortedOccurrences([...duplicate.sourceOccurrences, ...rule.sourceOccurrences]);
    }
    else incoming.set(ruleKey, rule);
    const diagnostics = [...(entry.prerequisiteDiagnostics ?? []), ...(entry.warnings ?? []).filter(warning => /prerequisite/i.test(warning))];
    if (diagnostics.length) report.diagnostics.push({ ruleKey, messages: diagnostics });
  }
  for (const [key, incomingRule] of incoming)
  {
    const previous = rules.get(key);
    if (previous?.recordStatus === "inactive") continue; // Retain historical evidence.
    incomingRule.reviewInputHash = reviewInputHash(plans.get(incomingRule.planKey)!, incomingRule);
    rules.set(key, previous?.reviewInputHash === incomingRule.reviewInputHash ? { ...incomingRule, reviewStatus: previous.reviewStatus, reviewedInputHash: previous.reviewedInputHash, approvedRuleJson: previous.approvedRuleJson, approvedRuleHash: previous.approvedRuleHash, reviewedBy: previous.reviewedBy, reviewedAt: previous.reviewedAt, reviewNotes: previous.reviewNotes, lastUpdated: previous.lastUpdated } : incomingRule);
  }
  for (const [key, rule] of rules)
  {
    if (rule.recordStatus !== "active") continue;
    const plan = plans.get(rule.planKey);
    if (!plan) throw new Error(`Rule has unknown plan: ${key}`);
    if (touchedPlanKeys.has(plan.planKey) && !incoming.has(key)) report.missingActiveRules.push(key);
    if (rule.sourceHash !== plan.sourceHash)
    {
      if (plan.publicationStatus === "included") throw new Error(`Changed PDF has unrefreshed active evidence: ${key}; refresh or explicitly deactivate it`);
      continue;
    }
    const inputHash = reviewInputHash(plan, rule);
    if (rule.reviewInputHash !== inputHash) rules.set(key, { ...clearRuleDecision(rule), reviewInputHash: inputHash });
  }
  const decisionPairs = new Set<string>();
  const currentKeys = new Set<string>();
  for (const entry of reviews.reviews)
  {
    validateReviewTime(entry.reviewedAt, now);
    const rule = rules.get(entry.ruleKey);
    const pair = `${entry.ruleKey}|${entry.expectedInputHash}`;
    if (!rule || decisionPairs.has(pair)) throw new Error(`Unknown/duplicate review entry: ${entry.ruleKey}`);
    decisionPairs.add(pair);
    if (entry.archived) continue;
    if (currentKeys.has(entry.ruleKey) || entry.expectedInputHash !== rule.reviewInputHash) throw new Error(`Conflicting/stale review decision: ${entry.ruleKey}; expected ${rule.reviewInputHash}`);
    currentKeys.add(entry.ruleKey);
    const tree = entry.decision === "approved" ? canonicalizeRule(entry.approvedRule) : null;
    if (tree && courseLeaves(tree).includes(rule.courseCode)) throw new Error(`Self-prerequisite approval: ${entry.ruleKey}`);
    if (tree && (/\(cid:\d+\)/i.test(rule.rawText) || report.diagnostics.some(item => item.ruleKey === entry.ruleKey && item.messages.some(message => /unresolved.*(?:glyph|ocr)|interpretation/i.test(message))))) throw new Error(`Unresolved source interpretation: ${entry.ruleKey}`);
    rules.set(entry.ruleKey, { ...rule, reviewStatus: entry.decision, reviewedInputHash: rule.reviewInputHash, approvedRuleJson: tree, approvedRuleHash: tree ? approvedRuleHash(tree) : null, reviewedBy: entry.reviewerAlias, reviewedAt: normalizeTimestamp(entry.reviewedAt), reviewNotes: entry.notes ?? null });
  }
  for (const plan of plans.values()) validatePlanRecord(plan);
  for (const rule of rules.values())
  {
    validateRuleRecord(rule, plans.get(rule.planKey)!, rule.recordStatus === "active" && rule.sourceHash === plans.get(rule.planKey)!.sourceHash);
    if (rule.recordStatus === "active") report.inputs.push({ ruleKey: rule.ruleKey, expectedInputHash: rule.reviewInputHash, parseStatus: rule.parseStatus, input: ruleInput(plans.get(rule.planKey)!, rule) });
  }
  const finalize = <T extends PlanRecord | RuleRecord>(records: Map<string, T>, previousRecords: T[], key: "planKey" | "ruleKey") => {
    const previous = new Map(previousRecords.map(record => [record[key as keyof T], record]));
    return [...records.values()].map(record => { const old = previous.get(record[key as keyof T]); return old && content(old) === content(record) ? old : { ...record, lastUpdated: nowIso }; }).sort((a, b) => compareCodeUnits(String(a[key as keyof T]), String(b[key as keyof T])));
  };
  report.unmappedSources.sort(compareCodeUnits); report.unmappedScopes = [...new Set(report.unmappedScopes)].sort(compareCodeUnits); report.missingActiveRules.sort(compareCodeUnits); report.inputs.sort((a, b) => compareCodeUnits(a.ruleKey, b.ruleKey)); report.publicationInputs.sort((a, b) => compareCodeUnits(a.planKey, b.planKey)); report.diagnostics.sort((a, b) => compareCodeUnits(a.ruleKey, b.ruleKey));
  return { plans: finalize(plans, stored.plans, "planKey"), rules: finalize(rules, stored.rules, "ruleKey"), report };
}

const jsonColumns = new Set(["rule_json", "approved_rule_json", "source_occurrences"]);
const snake = (value: string) => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
export const sqlLiteral = (value: string) => `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
function sqlValue(column: string, value: unknown): string
{
  if (value === null) return "NULL";
  if (jsonColumns.has(column)) return `${sqlLiteral(stableSerialize(value))}::jsonb`;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return sqlLiteral(value);
  throw new Error(`Unsupported SQL field: ${column}`);
}
export function generateReviewSql(stored: { plans: PlanRecord[]; rules: RuleRecord[] }, next: { plans: PlanRecord[]; rules: RuleRecord[] })
{
  const lines = ["-- Reviewed curriculum import. Generated against the entire retained record state.", "BEGIN;", "SELECT pg_advisory_xact_lock(1937077072, 1);", "LOCK TABLE curriculum_plans, curriculum_prerequisite_rules IN SHARE ROW EXCLUSIVE MODE;"];
  for (const [table, oldRows, newRows, identity] of [["curriculum_plans", stored.plans, next.plans, "planKey"], ["curriculum_prerequisite_rules", stored.rules, next.rules, "ruleKey"]] as const)
  {
    let guard = `BEGIN IF (SELECT count(*) FROM ${table}) <> ${oldRows.length} THEN RAISE EXCEPTION 'Stale curriculum SQL: record set changed'; END IF; `;
    for (const row of oldRows)
    {
      const predicate = Object.entries(row).map(([key, value]) => { const column = snake(key); return `${column} IS NOT DISTINCT FROM ${sqlValue(column, value)}${value !== null && (column.endsWith("_at") || column === "last_updated") ? "::timestamptz" : ""}`; }).join(" AND ");
      guard += `IF NOT EXISTS (SELECT 1 FROM ${table} WHERE ${predicate}) THEN RAISE EXCEPTION 'Stale curriculum SQL: input, decision or activity changed'; END IF; `;
    }
    guard += "END";
    lines.push(`DO ${sqlLiteral(guard)};`);
    const old = new Map(oldRows.map(row => [String(row[identity as keyof typeof row]), row]));
    for (const row of newRows)
    {
      const previous = old.get(String(row[identity as keyof typeof row]));
      if (previous && content(previous) === content(row)) continue;
      const entries = Object.entries(row);
      if (!previous) lines.push(`INSERT INTO ${table} (${entries.map(([key]) => snake(key)).join(", ")}) VALUES (${entries.map(([key, value]) => key === "lastUpdated" ? "now()" : sqlValue(snake(key), value)).join(", ")});`);
      else lines.push(`UPDATE ${table} SET ${entries.filter(([key]) => key !== identity).map(([key, value]) => `${snake(key)} = ${key === "lastUpdated" ? "now()" : sqlValue(snake(key), value)}`).join(", ")} WHERE ${snake(identity)} = ${sqlLiteral(String(row[identity as keyof typeof row]))};`);
    }
  }
  lines.push("COMMIT;", "");
  return lines.join("\n");
}
