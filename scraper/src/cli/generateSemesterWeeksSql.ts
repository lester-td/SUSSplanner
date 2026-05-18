import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, requireString } from "../lib/args.js";
import type { SemesterKey, SemesterWeekRecord } from "../lib/types.js";
import { generateSql } from "../sql/generateSql.js";

interface WeeksFileShape {
  semesters: SemesterKey[];
  weeks: SemesterWeekRecord[];
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputPath = requireString(args, "input");
  const outSql = typeof args.out === "string" ? args.out : "data/output/semester-weeks-import.sql";

  const parsed = JSON.parse(await fs.readFile(inputPath, "utf8")) as WeeksFileShape;

  await fs.mkdir(path.dirname(outSql), { recursive: true });

  const sql = generateSql({ semesters: parsed.semesters, weeks: parsed.weeks });
  await fs.writeFile(outSql, sql, "utf8");

  console.log(`Semesters: ${parsed.semesters.length}`);
  console.log(`Weeks: ${parsed.weeks.length}`);
  console.log(`SQL written to: ${outSql}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
