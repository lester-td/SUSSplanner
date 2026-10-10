import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { curriculumPlans, curriculumPrerequisiteRules } from "../lib/db/schema";
import { mapPlanRecord, mapRuleRecord } from "../lib/data/prerequisites/database-records";
import { emptyTriage, materializeBatch, prepareReviewBatch, reviewBatch, validateBatch } from "../lib/data/prerequisites/batch-review";
import type { StoredCurriculum } from "../lib/data/prerequisites/batch-review";
import { renderBatchReport } from "../lib/data/prerequisites/batch-report";
import { verifyExtractedPdfEvidence } from "../lib/data/prerequisites/pdf-evidence";
import { generateReviewSql } from "../lib/data/prerequisites/import-review";
import type { CourseNodeSummary } from "../lib/data/prerequisites/types";

function option(name: string, fallback?: string)
{
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}
const json = async (file: string) => JSON.parse(await readFile(file, "utf8")) as unknown;
const writeJson = async (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
async function replaceJson(file: string, value: unknown)
{
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeJson(temp, value); await rename(temp, file);
}
async function main()
{
  if (process.argv.includes("--help"))
  {
    console.log("curriculum-batch --mode prepare|report|approve [--batch FILE] [--triage FILE] [--output-dir DIR] [--without-db]\nprepare extracts draft mappings and proposals; report renders triage without approval. approve requires --batch-id APPROVAL_ID --reviewer ALIAS; --apply imports transactionally and updates the checked-in review artifacts. DATABASE_URL is required unless preparation/report uses --without-db. Never runs in prebuild.");
    return;
  }
  const mode = option("mode", "prepare")!;
  if (!["prepare", "report", "approve"].includes(mode)) throw new Error("Use --mode prepare, report or approve");
  if (process.argv.includes("--apply") && mode !== "approve") throw new Error("--apply is only valid for explicit approval");
  if (mode === "approve" && process.argv.includes("--without-db")) throw new Error("Approval requires the current database state");
  loadEnvConfig(process.cwd());
  const output = option("output-dir", "scraper/data/output/curriculum/batch")!;
  const batchFile = option("batch", path.join(output, "batch.json"))!;
  const extractionFile = option("extraction", "scraper/data/output/curriculum/curriculum-plans.json")!;
  const registryFile = option("registry", "scraper/data/reviews/curriculum-plans.json")!;
  const reviewsFile = option("reviews", "scraper/data/reviews/prerequisite-rules.json")!;
  const bytes = await readFile(extractionFile);
  const extraction = JSON.parse(bytes.toString("utf8")) as unknown;
  const extractionHash = createHash("sha256").update(bytes).digest("hex");
  const index = await json("data/snapshots/course-index.json") as Array<{ courseCode: string; courseName: string | null; offeredSemesters: CourseNodeSummary["offeredSemesters"] }>;
  const catalogue: CourseNodeSummary[] = index.map(course => ({ courseCode: course.courseCode, courseName: course.courseName, href: `/courses/${encodeURIComponent(course.courseCode)}`, availability: "catalogued", offeredSemesters: course.offeredSemesters.map(({ semesterId, semesterName }) => ({ semesterId, semesterName })) }));
  let client: ReturnType<typeof postgres> | undefined;
  let stored: StoredCurriculum = { plans: [], rules: [] };
  try
  {
    if (!process.argv.includes("--without-db"))
    {
      if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required; migrate the reviewed tables before preparing the batch");
      client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15 });
      stored = await drizzle(client).transaction(async db => ({ plans: (await db.select().from(curriculumPlans)).map(mapPlanRecord), rules: (await db.select().from(curriculumPrerequisiteRules)).map(mapRuleRecord) }), { isolationLevel: "repeatable read", accessMode: "read only" });
    }
    const batch = mode === "prepare" ? prepareReviewBatch(extraction, extractionHash, await json(registryFile), await json(reviewsFile), stored, catalogue) : validateBatch(await json(batchFile));
    await verifyExtractedPdfEvidence(extraction, batch.registry, option("pdf-root", "scraper/data/input/curriculum-plans")!);
    const triageFile = option("triage");
    const triage = triageFile ? await json(triageFile) : emptyTriage(batch);
    const reviewed = reviewBatch(batch, triage);
    // Validate proposed publication with temporary in-memory decisions; no approvals
    // or reviewer records are written during prepare/report.
    const candidate = materializeBatch(batch, triage, extraction, extractionHash, stored, catalogue, mode === "approve" ? option("reviewer", "")! : "preview-only");
    if (mode === "approve" && option("batch-id") !== reviewed.approvalId) throw new Error(`Explicit approval requires --batch-id ${reviewed.approvalId}; inspect the report first`);
    if (mode === "approve" && !option("reviewer")?.trim()) throw new Error("--reviewer is required for batch approval");
    await mkdir(output, { recursive: true });
    if (mode === "prepare") { await writeJson(batchFile, batch); await writeJson(path.join(output, "registry-draft.json"), batch.registry); await writeJson(path.join(output, "triage-template.json"), emptyTriage(batch)); }
    const summary = { mode, batchId: batch.batchId, approvalId: reviewed.approvalId, policyVersion: batch.policyVersion, plans: Object.fromEntries(["included", "excluded", "pending"].map(state => [state, reviewed.plans.filter(plan => plan.decision === state).length])), rules: Object.fromEntries(["approved", "source_only", "pending", "excluded"].map(state => [state, reviewed.rules.filter(rule => rule.decision === state).length])), flaggedStatements: reviewed.rules.filter(rule => rule.reasons.length).length, extractionWarnings: batch.extractionIssues.length, reconciliation: { unmappedSources: candidate.next.report.unmappedSources, unmappedScopes: candidate.next.report.unmappedScopes, missingActiveRules: candidate.next.report.missingActiveRules }, proposedCoverage: candidate.coverage, approved: mode === "approve", applied: false };
    const links = Object.fromEntries(batch.registry.plans.map(plan => [plan.sourcePath, path.relative(output, path.resolve(option("pdf-root", "scraper/data/input/curriculum-plans")!, plan.sourcePath)).split(path.sep).map(part => encodeURIComponent(part)).join("/")]));
    await writeFile(path.join(output, "review.html"), renderBatchReport(batch, triage, links));
    await writeJson(path.join(output, "reviewed-triage.json"), reviewed.triage);
    if (mode === "approve")
    {
      const accepted = path.join(output, "approved", reviewed.approvalId.split(":").at(-1)!);
      await mkdir(accepted, { recursive: true });
      await writeJson(path.join(accepted, "curriculum-plans.json"), candidate.registry);
      await writeJson(path.join(accepted, "prerequisite-rules.json"), candidate.reviews);
      await writeJson(path.join(accepted, "approval.json"), { approvalId: reviewed.approvalId, batchId: batch.batchId, reviewerAlias: option("reviewer"), approvedAt: new Date().toISOString(), triage: reviewed.triage });
      const sql = generateReviewSql(stored, candidate.next);
      await writeFile(path.join(accepted, "reviewed-import.sql"), sql);
      if (process.argv.includes("--apply"))
      {
        await client!.unsafe(sql);
        summary.applied = true;
        await replaceJson(registryFile, candidate.registry);
        await replaceJson(reviewsFile, candidate.reviews);
      }
    }
    await writeJson(path.join(output, "summary.json"), summary);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Review report: ${path.resolve(output, "review.html")}`);
  }
  finally { await client?.end({ timeout: 5 }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
