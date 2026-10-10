import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PDFDocument } from "pdf-lib";
import { curriculumPlans, curriculumPrerequisiteRules } from "../lib/db/schema";
import { mapPlanRecord, mapRuleRecord } from "../lib/data/prerequisites/database-records";
import { generateReviewSql, reconcileReviews } from "../lib/data/prerequisites/import-review";
import { buildRequisites } from "../lib/data/prerequisites/build-requisites";
import { validateRegistry } from "../lib/data/prerequisites/review-input";
import type { CourseNodeSummary, PlanRecord, RuleRecord } from "../lib/data/prerequisites/types";

function option(name: string, fallback?: string)
{
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error(`--${name} requires a value`);
  return process.argv[index + 1];
}
async function json(file: string) { return JSON.parse(await readFile(file, "utf8")) as unknown; }
async function main()
{
  if (process.argv.includes("--help"))
  {
    console.log("review-curriculum --mode report|sql|apply [--extraction FILE] [--registry FILE] [--reviews FILE] [--pdf-root DIR] [--with-db] [--output FILE]\nReport is database-free by default. SQL/apply require DATABASE_URL and migrated tables. Apply is explicit and never runs during a build.");
    return;
  }
  const mode = option("mode", "report");
  if (!["report", "sql", "apply"].includes(mode!)) throw new Error("Unknown mode; use report, sql or apply");
  loadEnvConfig(process.cwd());
  const extraction = await json(option("extraction", "scraper/data/output/curriculum/curriculum-plans.json")!) as { review: { plans: Array<{ planKey: string; sourcePath: string; sourceHash: string; pageCount: number }>; sourceEntries: Array<{ planKey: string; sourcePage: number }> } };
  const registry = validateRegistry(await json(option("registry", "scraper/data/reviews/curriculum-plans.json")!));
  const reviews = await json(option("reviews", "scraper/data/reviews/prerequisite-rules.json")!);
  const root = await realpath(option("pdf-root", "scraper/data/input/curriculum-plans")!);
  const pageCounts = new Map<string, number>();
  for (const source of extraction.review.plans)
  {
    const binding = registry.plans.find(plan => plan.sourceHash === source.sourceHash);
    const locator = await realpath(path.resolve(root, binding?.sourcePath ?? source.sourcePath));
    if (!locator.startsWith(`${root}${path.sep}`)) throw new Error("Source PDF locator escapes PDF root");
    const bytes = await readFile(locator);
    if (createHash("sha256").update(bytes).digest("hex") !== source.sourceHash) throw new Error(`Source PDF bytes differ from extraction: ${source.sourcePath}`);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    if (pages !== source.pageCount) throw new Error(`Source PDF page count differs: ${source.sourcePath}`);
    pageCounts.set(source.planKey, pages);
  }
  for (const entry of extraction.review.sourceEntries)
    if (entry.sourcePage > (pageCounts.get(entry.planKey) ?? 0)) throw new Error(`Source page outside original PDF: ${entry.planKey}`);
  const useDb = mode !== "report" || process.argv.includes("--with-db");
  let client: ReturnType<typeof postgres> | undefined;
  let stored: { plans: PlanRecord[]; rules: RuleRecord[] } = { plans: [], rules: [] };
  try
  {
    if (useDb)
    {
      if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for stored-state reconciliation");
      client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15 });
      stored = await drizzle(client).transaction(async db => {
        try { return { plans: (await db.select().from(curriculumPlans)).map(mapPlanRecord), rules: (await db.select().from(curriculumPrerequisiteRules)).map(mapRuleRecord) }; }
        catch (error) { throw new Error("Reviewed curriculum tables are missing or incompatible. Inspect the target database against scraper/schema.sql and verify schema changes in an isolated database first.", { cause: error }); }
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    }
    const next = reconcileReviews(extraction, registry, reviews, stored);
    // Retained active evidence still has to fit the original, current PDF.
    for (const rule of next.rules)
    {
      const plan = next.plans.find(plan => plan.planKey === rule.planKey)!;
      if (rule.recordStatus !== "active" || plan.publicationStatus !== "included") continue;
      const source = extraction.review.plans.find(source => source.sourceHash === rule.sourceHash);
      if (!source || rule.sourceOccurrences.some(occurrence => occurrence.page > pageCounts.get(source.planKey)!)) throw new Error(`Included active rule lacks verified PDF/page evidence: ${rule.ruleKey}`);
    }
    let catalogue: CourseNodeSummary[] = [];
    try
    {
      const index = await json("data/snapshots/course-index.json") as Array<{ courseCode: string; courseName: string | null; offeredSemesters: CourseNodeSummary["offeredSemesters"] }>;
      catalogue = index.map(course => ({ courseCode: course.courseCode, courseName: course.courseName, href: `/courses/${encodeURIComponent(course.courseCode)}`, availability: "catalogued", offeredSemesters: course.offeredSemesters.map(({ semesterId, semesterName }) => ({ semesterId, semesterName })) }));
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const projection = buildRequisites(next.plans, next.rules, catalogue);
    console.log(JSON.stringify({ mode, ...next.report, coverage: projection.report, changes: { plans: next.plans.filter(plan => plan.lastUpdated !== stored.plans.find(old => old.planKey === plan.planKey)?.lastUpdated).length, rules: next.rules.filter(rule => rule.lastUpdated !== stored.rules.find(old => old.ruleKey === rule.ruleKey)?.lastUpdated).length } }, null, 2));
    if (mode === "sql")
    {
      const output = option("output", "scraper/data/output/curriculum/reviewed-import.sql")!;
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, generateReviewSql(stored, next), "utf8");
      console.log(`Guarded SQL written to ${output}`);
    }
    if (mode === "apply") await client!.unsafe(generateReviewSql(stored, next));
  }
  finally { await client?.end({ timeout: 5 }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
