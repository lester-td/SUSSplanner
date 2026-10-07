import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const loader = import.meta.resolve("tsx");

for (const command of ["scrapeAll", "buildScheduleCohorts"]) {
  for (const customOutput of [false, true]) {
    it(`${command} keeps cohort output local and preserves history with ${customOutput ? "a custom" : "the default"} path`, async t => {
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "suss-scraper-output-"));
      t.after(() => fs.rm(workspace, { recursive: true, force: true }));
      const cwd = path.join(workspace, "scraper");
      await fs.mkdir(path.join(cwd, "data"), { recursive: true });
      await fs.mkdir(path.join(workspace, "data"));
      const appIndex = path.join(workspace, "data/schedule-cohorts.json");
      await fs.writeFile(appIndex, "application data stays unchanged");

      await fs.writeFile(path.join(cwd, "schedule.csv"), [
        "COURSE CODE,CRN / TG,SEMESTER TYPE,DELIVERY / EXAM MODE,DATE,START,END,CAMPUS",
        "ACC201,CRN01,Regular,FACE-TO-FACE,12/09/2026,07:00:00 PM,10:00:00 PM,CLE",
      ].join("\n"));
      await fs.writeFile(path.join(cwd, "manifest.json"), JSON.stringify({ schedules: [
        { csv: "schedule.csv", scheduleType: "evening", intakes: { regular: "January 2026" } },
      ] }));

      const output = customOutput ? "reviewed-cohorts.json" : "data/schedule-cohorts.json";
      await fs.writeFile(path.join(cwd, output), JSON.stringify({
        formatVersion: 1, sources: ["older.pdf"], eventStarts: { historical: "2024/2025#2" },
      }));
      const args = ["--manifest", "manifest.json"];
      if (command === "buildScheduleCohorts") args.push("--csv-dir", "extracted-csv");
      if (customOutput) args.push(command === "scrapeAll" ? "--cohorts-out" : "--out", output);
      await execFileAsync(process.execPath, [
        "--import", loader, fileURLToPath(new URL(`./${command}.ts`, import.meta.url)), ...args,
      ], { cwd });

      const index = JSON.parse(await fs.readFile(path.join(cwd, output), "utf8"));
      assert.deepEqual(index.sources, ["older.pdf", "schedule.csv"]);
      assert.deepEqual(index.eventStarts, {
        historical: "2024/2025#2",
        "ACC201|evening|CRN|CRN01|CLASS|2026-09-12|19:00:00|22:00:00": "2025/2026#2",
      });
      assert.equal(await fs.readFile(appIndex, "utf8"), "application data stays unchanged");
    });
  }
}
