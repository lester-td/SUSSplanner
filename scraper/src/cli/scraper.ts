import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createInterface, type Interface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { OutputFormat } from "../lib/outputFormat.js";

type Action = "all" | "weeks" | "schedules" | "courses" | "curriculum";

const scraperRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const virtualEnvironmentBin = path.join(scraperRoot, "venv", process.platform === "win32" ? "Scripts" : "bin");
const virtualEnvironmentPython = path.join(
  virtualEnvironmentBin,
  process.platform === "win32" ? "python.exe" : "python3"
);

interface PreflightResult {
  passed: boolean;
  fixes: string[];
}

function childEnvironment(): NodeJS.ProcessEnv {
  if (!fs.existsSync(virtualEnvironmentBin)) return process.env;

  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === "path") ?? "PATH";
  return {
    ...process.env,
    VIRTUAL_ENV: path.join(scraperRoot, "venv"),
    [pathKey]: `${virtualEnvironmentBin}${path.delimiter}${process.env[pathKey] ?? ""}`
  };
}

const actionAliases = new Map<string, Action>([
  ["1", "all"],
  ["2", "weeks"],
  ["3", "schedules"],
  ["4", "courses"],
  ["5", "curriculum"]
]);

function printHeader(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function printCheck(passed: boolean, label: string, details?: string): void {
  console.log(`${passed ? "✓" : "✗"} ${label}${details ? ` — ${details}` : ""}`);
}

function commandVersion(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    cwd: scraperRoot,
    env: childEnvironment(),
    encoding: "utf8",
    timeout: 10_000
  });
  if (result.status !== 0 || result.error) return null;
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/)[0] || "available";
}

function versionAtLeast(versionText: string | null, minimumMajor: number, minimumMinor = 0): boolean {
  if (!versionText) return false;
  const match = versionText.match(/(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
}

function checkEnvironmentPrerequisites(): PreflightResult {
  printHeader("Prerequisite checks");
  const fixes: string[] = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const nodePassed = Number.isFinite(nodeMajor) && nodeMajor >= 20;
  printCheck(nodePassed, "Node.js 20+", `v${process.versions.node}`);
  if (!nodePassed) fixes.push("Install Node.js 20 or newer, then rerun `npm install` in the repository root and scraper folder.");

  const npmVersion = commandVersion(npmCommand, ["--version"]);
  const npmPassed = versionAtLeast(npmVersion, 10);
  printCheck(npmPassed, "npm 10+", npmVersion ?? "not found");
  if (!npmPassed) fixes.push("Install npm 10 or newer with Node.js 20 or newer.");

  const requiredNodePackages = ["tsx", "typescript", "csv-parse"];
  const missingNodePackages = requiredNodePackages.filter(packageName =>
    !fs.existsSync(path.join(scraperRoot, "node_modules", packageName, "package.json"))
  );
  printCheck(missingNodePackages.length === 0, "Scraper npm packages",
    missingNodePackages.length === 0 ? "installed" : `missing ${missingNodePackages.join(", ")}`);
  if (missingNodePackages.length > 0) fixes.push("Run `cd scraper && npm install`.");

  const venvPassed = fs.existsSync(virtualEnvironmentPython);
  printCheck(venvPassed, "Python virtual environment", venvPassed ? "scraper/venv" : "missing");
  if (!venvPassed) {
    const systemPython = commandVersion(process.platform === "win32" ? "py" : "python3",
      process.platform === "win32" ? ["-3", "--version"] : ["--version"]);
    printCheck(Boolean(systemPython), "System Python 3", systemPython ?? "not found");
    if (systemPython) {
      fixes.push(process.platform === "win32"
        ? "Run `cd scraper`, then `py -3 -m venv venv` and `venv\\Scripts\\python -m pip install -r requirements.txt`."
        : "Run `cd scraper`, then `python3 -m venv venv` and `venv/bin/python -m pip install -r requirements.txt`.");
    } else {
      fixes.push(process.platform === "win32"
        ? "Install Python 3, then create `scraper\\venv` and install `scraper\\requirements.txt`."
        : "Install Python 3 and the venv module (Ubuntu/WSL: `sudo apt install python3 python3-venv`), then create `scraper/venv`.");
    }
  } else {
    const pythonVersion = commandVersion(virtualEnvironmentPython, ["--version"]);
    const pythonPassed = versionAtLeast(pythonVersion, 3, 10);
    printCheck(pythonPassed, "Virtual-environment Python 3.10+", pythonVersion ?? "not executable");
    if (!pythonPassed) fixes.push("Delete and recreate `scraper/venv` with Python 3.10 or newer, then install `requirements.txt`.");

    const importCheck = spawnSync(virtualEnvironmentPython, [
      "-c",
      "import pdfplumber, pypdf; from fontTools.ttLib import TTFont"
    ], {
      cwd: scraperRoot,
      encoding: "utf8",
      timeout: 10_000
    });
    const importsPassed = pythonPassed && importCheck.status === 0 && !importCheck.error;
    printCheck(importsPassed, "Required Python packages",
      importsPassed ? "pdfplumber, pypdf, fontTools" : "missing or unusable");
    if (!importsPassed) fixes.push(process.platform === "win32"
      ? "Run `cd scraper && venv\\Scripts\\python -m pip install -r requirements.txt`."
      : "Run `cd scraper && venv/bin/python -m pip install -r requirements.txt`.");

    if (importsPassed) {
      const pipCheck = spawnSync(virtualEnvironmentPython, ["-m", "pip", "check"], {
        cwd: scraperRoot,
        encoding: "utf8",
        timeout: 30_000
      });
      const pipPassed = pipCheck.status === 0 && !pipCheck.error;
      printCheck(pipPassed, "Python dependency consistency", pipPassed ? "pip check passed" : "pip check failed");
      if (!pipPassed) fixes.push(process.platform === "win32"
        ? "Run `cd scraper && venv\\Scripts\\python -m pip install -r requirements.txt`, then `venv\\Scripts\\python -m pip check`."
        : "Run `cd scraper && venv/bin/python -m pip install -r requirements.txt`, then `venv/bin/python -m pip check`.");
    }

    const ocrValidation = spawnSync(virtualEnvironmentPython, [
      "tools/pdf_ocr.py",
      "--languages",
      "eng,tam"
    ], {
      cwd: scraperRoot,
      env: childEnvironment(),
      encoding: "utf8",
      timeout: 30_000
    });
    const ocrLanguagePassed = ocrValidation.status === 0 && !ocrValidation.error;
    printCheck(ocrLanguagePassed, "English and Tamil OCR", ocrLanguagePassed
      ? "OCRmyPDF, Tesseract eng+tam, and Tamil font ready"
      : "missing or unusable");
    if (!ocrLanguagePassed) fixes.push(process.platform === "win32"
      ? "Install `requirements-ocr.txt`, Tesseract English/Tamil data, and Noto Sans Tamil."
      : "Run `cd scraper && venv/bin/python -m pip install -r requirements-ocr.txt`, then `sudo apt install tesseract-ocr-eng tesseract-ocr-tam fonts-noto-core`.");

    const ghostscriptVersion = commandVersion(process.platform === "win32" ? "gswin64c" : "gs", ["--version"]);
    const ghostscriptPassed = Boolean(ghostscriptVersion);
    printCheck(ghostscriptPassed, "Ghostscript for OCR", ghostscriptVersion ?? "not found");
    if (!ghostscriptPassed) fixes.push(process.platform === "win32"
      ? "Install Ghostscript and ensure `gswin64c` is available on PATH."
      : "Run `sudo apt install ghostscript`.");
  }

  return { passed: fixes.length === 0, fixes };
}

function printOptionalCapabilities(): void {
  console.log("\nOptional capabilities:");
  const languageList = spawnSync("tesseract", ["--list-langs"], {
    cwd: scraperRoot,
    encoding: "utf8",
    timeout: 10_000
  });
  const chineseOcrReady = languageList.status === 0
    && /(?:^|\r?\n)chi_sim(?:\r?\n|$)/.test(languageList.stdout ?? "");
  printCheck(chineseOcrReady, "Simplified Chinese OCR language", chineseOcrReady
    ? "chi_sim installed"
    : "not required for current PDFs; their Chinese text is extractable Unicode");
  if (!chineseOcrReady && process.platform !== "win32") {
    console.log("  Optional future fallback: sudo apt install tesseract-ocr-chi-sim");
  }
}

function countPdfFiles(directory: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) count += countPdfFiles(itemPath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) count += 1;
  }
  return count;
}

function printInputReadiness(): void {
  console.log("\nInput readiness:");

  const weeksPath = path.join(scraperRoot, "data/input/weeks/semester-weeks.json");
  let weeksReady = false;
  try {
    const weeks = JSON.parse(fs.readFileSync(weeksPath, "utf8")) as { semesters?: unknown; weeks?: unknown };
    weeksReady = Array.isArray(weeks.semesters) && weeks.semesters.length > 0
      && Array.isArray(weeks.weeks) && weeks.weeks.length > 0;
  } catch {
    weeksReady = false;
  }
  printCheck(weeksReady, "Semester weeks input",
    weeksReady ? "data/input/weeks/semester-weeks.json" : "missing or invalid; create data/input/weeks/semester-weeks.json");

  const manifestPath = path.join(scraperRoot, "data/input/schedules/manifest.json");
  let scheduleCount = 0;
  let missingScheduleCount = 0;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      schedules?: Array<{ pdf?: string; csv?: string }>;
    };
    const schedules = Array.isArray(manifest.schedules) ? manifest.schedules : [];
    scheduleCount = schedules.length;
    missingScheduleCount = schedules.filter(item => {
      const source = item.pdf ?? item.csv;
      return !source || !fs.existsSync(path.resolve(scraperRoot, source));
    }).length;
  } catch {
    scheduleCount = 0;
    missingScheduleCount = 1;
  }
  const schedulesReady = scheduleCount > 0 && missingScheduleCount === 0;
  printCheck(schedulesReady, "Schedule manifest and source files", schedulesReady
    ? `${scheduleCount} source files ready`
    : `missing or invalid; check data/input/schedules/manifest.json (${missingScheduleCount} missing source files)`);

  const courseDirectory = path.join(scraperRoot, "data/input/courses");
  const coursesReady = fs.existsSync(courseDirectory);
  printCheck(coursesReady, "Course PDF folder", coursesReady
    ? "data/input/courses/"
    : "will be created automatically when course PDFs are downloaded");

  const curriculumDirectory = path.join(scraperRoot, "data/input/curriculum-plans");
  const curriculumCount = fs.existsSync(curriculumDirectory) ? countPdfFiles(curriculumDirectory) : 0;
  printCheck(curriculumCount > 0, "Curriculum-plan PDFs", curriculumCount > 0
    ? `${curriculumCount} PDFs ready`
    : "missing; add PDFs under data/input/curriculum-plans/");
}

function runPreflight(): void {
  const result = checkEnvironmentPrerequisites();
  printOptionalCapabilities();
  printInputReadiness();
  if (result.passed) {
    console.log("\nAll required environment checks passed. Review any optional/input notices above.");
    return;
  }

  console.error("\nSetup is required before the scraper can run:");
  for (const fix of [...new Set(result.fixes)]) console.error(`- ${fix}`);
  console.error("\nComplete the steps above, then run `npm run scraper` again.");
  throw new Error("Prerequisite checks failed; the task menu was not opened.");
}

function printDefaults(): void {
  console.log("\nDefault locations:");
  console.log("  Semester weeks:  data/input/weeks/");
  console.log("  Schedule PDFs:   data/input/schedules/");
  console.log("  Course PDFs:     data/input/courses/{daytime,evening}/");
  console.log("  Curriculum PDFs: data/input/curriculum-plans/");
  console.log("  Generated data:  data/output/{weeks,schedules,courses,curriculum}/");
}

function printHelp(): void {
  console.log(`SUSS scraper

Usage:
  npm start                  Open the interactive task menu

All Items generates files only; it never changes the database.`);
  printDefaults();
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: childEnvironment(),
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${reason}.`));
    });
  });
}

async function runNpmScript(script: string, args: string[] = [], cwd = scraperRoot): Promise<void> {
  const npmArgs = ["run", script];
  if (args.length > 0) npmArgs.push("--", ...args);
  await run(npmCommand, npmArgs, cwd);
}

function formatArgs(format: OutputFormat): string[] {
  return ["--format", format];
}

async function generateWeeks(format: OutputFormat): Promise<void> {
  printHeader("Generating semester weeks");
  await runNpmScript("generate:weeks", formatArgs(format));
}

async function scrapeSchedules(format: OutputFormat, courseFilterArgs: string[]): Promise<void> {
  printHeader("Parsing schedule PDFs");
  await runNpmScript("scrape:all", [...formatArgs(format), ...courseFilterArgs]);
}

async function refreshCourses(format: OutputFormat, courseFilterArgs: string[]): Promise<void> {
  printHeader("Downloading fresh course synopsis PDFs");
  await runNpmScript("download:courses", ["--force", ...courseFilterArgs]);

  printHeader("Parsing course synopsis PDFs");
  await runNpmScript("parse:courses", [...formatArgs(format), ...courseFilterArgs]);
}

async function parseCurriculumPlans(format: OutputFormat): Promise<void> {
  printHeader("Parsing curriculum-plan PDFs");
  await runNpmScript("parse:curriculum", [...formatArgs(format), "--ocr-on-cid"]);
}

async function runScheduleFlow(format: OutputFormat, courseFilterArgs: string[]): Promise<void> {
  await generateWeeks(format);
  await scrapeSchedules(format, courseFilterArgs);
  console.log("\nSchedule outputs are ready in data/output/schedules/.");
}

async function runAll(format: OutputFormat, courseFilterArgs: string[]): Promise<void> {
  printHeader("All Items");
  console.log("This generates local artifacts and does not modify the database.");
  await runScheduleFlow(format, courseFilterArgs);
  await refreshCourses(format, courseFilterArgs);
  await parseCurriculumPlans(format);
  console.log("\nAll Items finished. Review data/output/. Curriculum SQL is preview-only until a schema is approved.");
}

async function executeAction(action: Action, format: OutputFormat, courseFilterArgs: string[]): Promise<void> {
  switch (action) {
    case "all":
      await runAll(format, courseFilterArgs);
      return;
    case "weeks":
      await generateWeeks(format);
      console.log("\nSemester-week outputs are ready in data/output/weeks/.");
      return;
    case "schedules":
      await scrapeSchedules(format, courseFilterArgs);
      console.log("\nSchedule outputs are ready in data/output/schedules/.");
      return;
    case "courses":
      await refreshCourses(format, courseFilterArgs);
      console.log("\nCourse outputs are ready in data/output/courses/.");
      return;
    case "curriculum":
      await parseCurriculumPlans(format);
      console.log("\nCurriculum outputs are ready in data/output/curriculum/.");
      return;
  }
}

function parseAction(value: string | undefined): Action | undefined {
  if (!value) return undefined;
  return actionAliases.get(value.toLowerCase());
}

async function promptOutputFormat(readline: Interface): Promise<OutputFormat> {
  console.log(`\nOutput format
  1. Both JSON and SQL (default)
  2. JSON only
  3. SQL only`);
  const answer = (await readline.question("\nChoose an output format [1]: ")).trim();
  if (answer === "" || answer === "1") return "both";
  if (answer === "2") return "json";
  if (answer === "3") return "sql";
  throw new Error("Unknown output format. Run the scraper again and choose 1-3.");
}

async function promptCourseFilter(readline: Interface): Promise<string[]> {
  const answer = (await readline.question(
    "\nCourse filter [all] (examples: TLL* or TLL101,TLL201): "
  )).trim().toUpperCase();
  if (!answer) return [];

  const values = answer.split(/[\s,]+/).map(value => value.trim()).filter(Boolean);
  const prefixes = values.filter(value => value.endsWith("*")).map(value => value.slice(0, -1)).filter(Boolean);
  const exactCodes = values.filter(value => !value.endsWith("*"));
  const args: string[] = [];
  if (prefixes.length > 0) args.push("--code-prefix", prefixes.join(","));
  if (exactCodes.length > 0) args.push("--codes", exactCodes.join(","));
  return args;
}

async function interactiveMenu(): Promise<void> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\nSUSS scraper — what would you like to do?
  1. All Items
  2. Generate Semester Weeks
  3. Parse Schedule PDFs
  4. Download and Parse Course PDFs
  5. Parse Curriculum Plan PDFs
  6. Exit`);

    const answer = (await readline.question("\nChoose an option [1]: ")).trim();
    if (answer === "6") return;

    const action = parseAction(answer || "1");
    if (!action) throw new Error("Unknown option. Run the scraper again and choose 1-6.");
    const format = await promptOutputFormat(readline);
    const courseFilterArgs = action === "all" || action === "schedules" || action === "courses"
      ? await promptCourseFilter(readline)
      : [];
    await executeAction(action, format, courseFilterArgs);
  } finally {
    readline.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  if (argv.length > 0) throw new Error("This command uses an interactive menu and does not accept task arguments.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("The scraper menu requires an interactive terminal.");

  runPreflight();
  await interactiveMenu();
}

main().catch(error => {
  console.error((error as Error).message);
  process.exit(1);
});
