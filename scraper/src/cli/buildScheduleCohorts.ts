import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, requireString } from "../lib/args.js";
import { buildScheduleCohortIndex } from "../lib/scheduleCohorts.js";
import type { ScheduleType } from "../lib/types.js";
import { parseScheduleCsv } from "../parsers/scheduleCsv.js";

async function main(): Promise<void> {
  const args = parseArgs();
  const manifestPath = requireString(args, "manifest");
  const csvDir = requireString(args, "csv-dir");
  const outputPath = typeof args.out === "string" ? args.out : "../data/schedule-cohorts.json";
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    schedules: Array<{ pdf?: string; csv?: string; scheduleType: ScheduleType }>;
  };
  const sources = await Promise.all(manifest.schedules.map(async item => {
    const source = item.pdf ?? item.csv;
    if (!source) throw new Error("Each schedule source needs a PDF or CSV path.");
    const csvPath = item.csv ?? path.join(csvDir, path.basename(source).replace(/\.pdf$/i, ".csv"));
    return { source, result: parseScheduleCsv(await fs.readFile(csvPath, "utf8"), item.scheduleType) };
  }));
  const index = buildScheduleCohortIndex(sources);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(index.eventStarts).length} continuation event origins to ${outputPath}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
