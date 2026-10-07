import fs from "node:fs/promises";
import path from "node:path";
import { optionalString, parseArgs } from "../lib/args.js";
import { parseOutputFormat, writesJson, writesSql } from "../lib/outputFormat.js";
import type { SemesterKey, SemesterWeekRecord } from "../lib/types.js";
import { generateSql } from "../sql/generateSql.js";

interface WeeksFileShape {
  semesters: SemesterKey[];
  weeks: SemesterWeekRecord[];
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputPath = optionalString(args, "input") ?? "data/input/weeks/semester-weeks.json";
  const outSql = optionalString(args, "out") ?? "data/output/weeks/semester-weeks.sql";
  const outJson = optionalString(args, "json") ?? "data/output/weeks/semester-weeks.json";
  const format = parseOutputFormat(args);

  const parsed = JSON.parse(await fs.readFile(inputPath, "utf8")) as WeeksFileShape;

  if (writesSql(format)) {
    await fs.mkdir(path.dirname(outSql), { recursive: true });
    const sql = generateSql({ semesters: parsed.semesters, weeks: parsed.weeks });
    await fs.writeFile(outSql, sql, "utf8");
  }
  if (writesJson(format)) {
    await fs.mkdir(path.dirname(outJson), { recursive: true });
    await fs.writeFile(outJson, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  }

  console.log(`Semesters: ${parsed.semesters.length}`);
  console.log(`Weeks: ${parsed.weeks.length}`);
  if (writesSql(format)) console.log(`SQL written to: ${outSql}`);
  if (writesJson(format)) console.log(`JSON written to: ${outJson}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
