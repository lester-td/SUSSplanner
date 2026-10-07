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

it("scrapeSchedule filters combined-source rows while retaining explicit intake ownership", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-single-schedule-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, "schedule.csv"), [
    "COURSE CODE,CRN / TG,SEMESTER TYPE,DELIVERY / EXAM MODE,DATE,START,END,CAMPUS",
    "ACC201,CRN01,Regular,FACE-TO-FACE,12/09/2026,07:00:00 PM,10:00:00 PM,CLE",
    "BUS101,TG01,Regular,FACE-TO-FACE,13/09/2026,07:00:00 PM,10:00:00 PM,AMK",
  ].join("\n"));
  await execFileAsync(process.execPath, [
    "--import", loader, fileURLToPath(new URL("./scrapeSchedule.ts", import.meta.url)),
    "--csv", "schedule.csv", "--regular-semester", "January 2026", "--codes", "ACC201",
  ], { cwd });
  const result = JSON.parse(await fs.readFile(path.join(cwd, "data/output/schedules/schedule.json"), "utf8"));
  assert.deepEqual(result.courses.map((course: { courseCode: string }) => course.courseCode), ["ACC201"]);
  assert.equal(result.classEvents[0].academicYear, "2025/2026");
  assert.equal(result.classEvents[0].semesterNo, 2);
  const sql = await fs.readFile(path.join(cwd, "data/output/schedules/schedule.sql"), "utf8");
  assert.match(sql, /ACC201/);
  assert.doesNotMatch(sql, /BUS101/);
});

for (const format of ["json", "sql"]) {
  it(`scrapeAll combines ${format}-only filtered output with intake ownership and cohort history`, async t => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-merged-schedule-"));
    t.after(() => fs.rm(cwd, { recursive: true, force: true }));
    await fs.mkdir(path.join(cwd, "data"));
    await fs.writeFile(path.join(cwd, "data/schedule-cohorts.json"), JSON.stringify({
      formatVersion: 1, sources: ["older.pdf"], eventStarts: { historical: "2024/2025#2" },
    }));
    await fs.writeFile(path.join(cwd, "schedule.csv"), [
      "COURSE CODE,CRN / TG,SEMESTER TYPE,DELIVERY / EXAM MODE,DATE,START,END,CAMPUS",
      "ACC201,CRN01,Regular,FACE-TO-FACE,12/09/2026,07:00:00 PM,10:00:00 PM,CLE",
      "BUS101,TG01,Regular,FACE-TO-FACE,13/09/2026,07:00:00 PM,10:00:00 PM,AMK",
    ].join("\n"));
    await fs.writeFile(path.join(cwd, "manifest.json"), JSON.stringify({ schedules: [
      { csv: "schedule.csv", scheduleType: "auto", intakes: { regular: "January 2026" } },
    ] }));

    await execFileAsync(process.execPath, [
      "--import", loader, fileURLToPath(new URL("./scrapeAll.ts", import.meta.url)),
      "--manifest", "manifest.json", "--format", format, "--code-prefix", "acc",
    ], { cwd });

    const jsonPath = path.join(cwd, "data/output/schedules/schedules.json");
    const sqlPath = path.join(cwd, "data/output/schedules/schedules.sql");
    if (format === "json") {
      const result = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      assert.deepEqual(result.courses.map((course: { courseCode: string }) => course.courseCode), ["ACC201"]);
      assert.equal(result.classes[0].academicYear, "2025/2026");
      assert.equal(result.classes[0].semesterNo, 2);
      assert.equal(result.classes[0].scheduleType, "evening");
      await assert.rejects(fs.access(sqlPath));
    } else {
      const sql = await fs.readFile(sqlPath, "utf8");
      assert.match(sql, /ACC201/);
      assert.doesNotMatch(sql, /BUS101/);
      await assert.rejects(fs.access(jsonPath));
    }
    assert.equal(await fs.readFile(path.join(cwd, "data/output/schedules/course-codes.txt"), "utf8"), "ACC201\n");
    const index = JSON.parse(await fs.readFile(path.join(cwd, "data/schedule-cohorts.json"), "utf8"));
    assert.equal(index.eventStarts.historical, "2024/2025#2");
    assert.equal(index.eventStarts["ACC201|evening|CRN|CRN01|CLASS|2026-09-12|19:00:00|22:00:00"], "2025/2026#2");
    assert.equal(index.eventStarts["BUS101|daytime|TG|TG01|CLASS|2026-09-13|19:00:00|22:00:00"], "2025/2026#2");
  });
}

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
