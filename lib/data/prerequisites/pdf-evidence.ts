import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { PlanRecord, RuleRecord } from "./types";
import { validateExtraction } from "./import-review";
import type { PlanRegistry } from "./review-input";

export async function verifyExtractedPdfEvidence(input: unknown, registry: PlanRegistry, pdfRoot: string)
{
  const extraction = validateExtraction(input);
  const root = await realpath(pdfRoot);
  const counts = new Map<string, number>();
  for (const source of extraction.review.plans)
  {
    const binding = registry.plans.find(plan => plan.sourceHash === source.sourceHash);
    const locator = await realpath(path.resolve(root, binding?.sourcePath ?? source.sourcePath));
    if (!locator.startsWith(`${root}${path.sep}`)) throw new Error("Source PDF locator escapes PDF root");
    const bytes = await readFile(locator);
    if (createHash("sha256").update(bytes).digest("hex") !== source.sourceHash) throw new Error(`Source PDF bytes differ from extraction: ${source.sourcePath}`);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    if (pages !== source.pageCount) throw new Error(`Source PDF page count differs: ${source.sourcePath}`);
    counts.set(source.planKey, pages);
  }
  for (const entry of extraction.review.sourceEntries)
    if (entry.sourcePage > (counts.get(entry.planKey) ?? 0)) throw new Error(`Source page outside original PDF: ${entry.planKey}`);
}

export async function verifyPublishedPdfEvidence(plans: PlanRecord[], rules: RuleRecord[], pdfRoot: string)
{
  for (const plan of plans)
  {
    if (plan.publicationStatus !== "included") continue;
    const root = await realpath(pdfRoot);
    const locator = await realpath(path.resolve(root, plan.sourcePath));
    if (!locator.startsWith(`${root}${path.sep}`)) throw new Error(`PDF locator escapes source root: ${plan.planKey}`);
    const bytes = await readFile(locator);
    if (createHash("sha256").update(bytes).digest("hex") !== plan.sourceHash) throw new Error(`PDF bytes differ from reviewed source: ${plan.planKey}`);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    for (const rule of rules)
      if (rule.planKey === plan.planKey && rule.recordStatus === "active" && (rule.sourceHash !== plan.sourceHash || rule.sourceOccurrences.some(occurrence => occurrence.page > pages))) throw new Error(`Source PDF/page binding invalid: ${rule.ruleKey}`);
  }
}
