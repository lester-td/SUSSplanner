import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { downloadVariant } from "./downloadCoursePdfs.js";
import { loadCourseDownloadManifest, type VariantDownloadResult } from "../lib/courseDownloadManifest.js";
import { loadCourseCodeFilter } from "../lib/courseCodeFilter.js";

const execFileAsync = promisify(execFile);
const loader = import.meta.resolve("tsx");
const freshPdf = `%PDF${"fresh content ".repeat(500)}`;
const oldPdf = "%PDF old course details";

for (const scenario of [
  { name: "HTTP 404", response: () => new Response("missing", { status: 404 }), status: "not_found", state: "missing" },
  { name: "HTTP 410", response: () => new Response("gone", { status: 410 }), status: "not_found", state: "missing" },
  { name: "No Record Found HTML", response: () => new Response("<p>No Record Found</p>", { headers: { "content-type": "text/html" } }), status: "not_found", state: "missing" },
  { name: "placeholder PDF", response: () => new Response("%PDF No Record Found"), status: "not_found", state: "missing" },
  { name: "HTTP 503", response: () => new Response("unavailable", { status: 503 }), status: "failed", state: "stale" },
  { name: "HTTP 429", response: () => new Response("rate limited", { status: 429 }), status: "failed", state: "stale" },
  { name: "unexpected HTML", response: () => new Response("<p>Temporary maintenance</p>", { headers: { "content-type": "text/html" } }), status: "failed", state: "stale" },
  { name: "network error", response: () => { throw new Error("connection reset"); }, status: "failed", state: "stale" },
  { name: "body read error", response: () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("body interrupted")); } })), status: "failed", state: "stale" },
  { name: "successful refresh", response: () => new Response(freshPdf), status: "downloaded", state: "fresh" },
] as const) {
  it(`forced download handles ${scenario.name} without silently reusing old content`, async t => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-course-download-"));
    t.after(() => fs.rm(outDir, { recursive: true, force: true }));
    const pdfPath = path.join(outDir, "daytime", "ACC201.pdf");
    await fs.mkdir(path.dirname(pdfPath));
    await fs.writeFile(pdfPath, oldPdf);
    t.mock.method(globalThis, "fetch", async () => scenario.response());
    const result = await downloadVariant("ACC201", "daytime", outDir, true);
    assert.equal(result.status, scenario.status);
    assert.equal(result.inputState, scenario.state);
    if (scenario.state === "missing") await assert.rejects(fs.access(pdfPath));
    else assert.equal(await fs.readFile(pdfPath, "utf8"), scenario.state === "fresh" ? freshPdf : oldPdf);
  });
}

it("a non-forced download accepts an existing valid PDF without fetching", async t => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-course-cache-"));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(outDir, "evening"));
  await fs.writeFile(path.join(outDir, "evening/ACC201.pdf"), oldPdf);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  const result = await downloadVariant("ACC201", "evening", outDir, false);
  assert.equal(result.status, "skipped");
  assert.equal(result.inputState, "cached");
  assert.equal(fetchMock.mock.callCount(), 0);
});

it("the downloader writes fresh, stale, missing and failed states before returning non-zero", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-course-report-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "pdfs/daytime"), { recursive: true });
  await fs.mkdir(path.join(cwd, "pdfs/evening"), { recursive: true });
  await fs.writeFile(path.join(cwd, "pdfs/evening/ACC201.pdf"), oldPdf);
  await fs.writeFile(path.join(cwd, "pdfs/daytime/BUS101.pdf"), oldPdf);
  const mockPath = path.join(cwd, "fetch-mock.mjs");
  await fs.writeFile(mockPath, `globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.searchParams.get('crsecd') === 'BUS101') return new Response('missing', { status: 404 });
    if (url.searchParams.get('crsecd') === 'ACC201' && url.searchParams.get('isft') === '1') return new Response(${JSON.stringify(freshPdf)});
    throw new Error('network unavailable');
  };`);
  await assert.rejects(execFileAsync(process.execPath, [
    "--import", mockPath, "--import", loader, fileURLToPath(new URL("./downloadCoursePdfs.ts", import.meta.url)),
    "--force", "--codes", "ACC201,BUS101,NEW101", "--out-dir", "pdfs", "--delay-ms", "0",
  ], { cwd }), (error: unknown) => (error as { code: number }).code === 1);
  const manifest: VariantDownloadResult[] = JSON.parse(await fs.readFile(path.join(cwd, "data/output/courses/downloads.json"), "utf8"));
  assert.deepEqual(manifest.map(row => row.inputState), ["fresh", "stale", "missing", "missing", "failed", "failed"]);
  assert.equal(await fs.readFile(path.join(cwd, "pdfs/evening/ACC201.pdf"), "utf8"), oldPdf);
  await assert.rejects(fs.access(path.join(cwd, "pdfs/daytime/BUS101.pdf")));
  const report = await fs.readFile(path.join(cwd, "data/output/courses/download-report.tsv"), "utf8");
  assert.match(report, /ACC201\t✓\t\tdownloaded\tfailed\tfresh\tstale/);
  assert.match(report, /BUS101\t\t\tnot_found\tnot_found\tmissing\tmissing/);
  assert.match(report, /NEW101\t\t\tfailed\tfailed\tfailed\tfailed/);
});

it("parse:courses uses accepted manifest variants and reports excluded stale and missing inputs", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-course-parse-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "pdfs/daytime"), { recursive: true });
  await fs.mkdir(path.join(cwd, "pdfs/evening"), { recursive: true });
  await fs.mkdir(path.join(cwd, "tools"));
  // Exercise the CLI handoff without requiring real PDFs or Python PDF dependencies.
  await fs.writeFile(path.join(cwd, "tools/course_pdf_to_text.py"), `import sys, json
from pathlib import Path
args = sys.argv[1:]
Path(args[args.index('-o') + 1]).write_text(Path(args[0]).read_text())
Path(args[args.index('--json') + 1]).write_text(json.dumps({'warnings': []}))
`);
  const courseText = (code: string, name: string) => `${code} ${name}\n5 Credit Units\nCourse Synopsis\n${name} synopsis\nTopics\n• Accounting\nLearning Outcomes\n• Understand accounting\n`;
  const entries: VariantDownloadResult[] = [];
  for (const [code, variant, status, inputState, name] of [
    ["ACC201", "daytime", "downloaded", "fresh", "Fresh Accounting"],
    ["ACC201", "evening", "failed", "stale", "Obsolete Accounting"],
    ["BUS101", "evening", "skipped", "cached", "Cached Business"],
    ["BUS101", "daytime", "not_found", "missing", "Obsolete Business"],
  ] as const) {
    const pdfPath = path.join(cwd, "pdfs", variant, `${code}.pdf`);
    // Even a leftover file for a missing entry cannot be selected by the parser.
    await fs.writeFile(pdfPath, courseText(code, name));
    entries.push({ courseCode: code, scheduleType: variant, url: "https://example.test", pdfPath, status, inputState });
  }
  await fs.writeFile(path.join(cwd, "pdfs/evening/UNRELATED101.pdf"), courseText("UNRELATED101", "Unrelated Course"));
  await fs.writeFile(path.join(cwd, "pdfs/ACC201.pdf"), courseText("ACC201", "Obsolete Flat File"));
  await fs.writeFile(path.join(cwd, "manifest.json"), JSON.stringify(entries));
  await assert.rejects(execFileAsync(process.execPath, [
    "--import", loader, fileURLToPath(new URL("./parseCoursePdfs.ts", import.meta.url)),
    "--download-manifest", "manifest.json", "--pdf-dir", "pdfs",
  ], { cwd }), (error: unknown) => (error as { code: number }).code === 1);
  const results = JSON.parse(await fs.readFile(path.join(cwd, "data/output/courses/course-details.json"), "utf8"));
  assert.deepEqual(results.map((row: { course: { courseCode: string }; scheduleType: string }) =>
    [row.course.courseCode, row.scheduleType]), [["ACC201", "daytime"], ["BUS101", "evening"]]);
  const sql = await fs.readFile(path.join(cwd, "data/output/courses/course-details.sql"), "utf8");
  assert.match(sql, /Fresh Accounting/);
  assert.match(sql, /Cached Business/);
  assert.doesNotMatch(sql, /Obsolete|UNRELATED/);
  const issues = await fs.readFile(path.join(cwd, "data/output/courses/parse-issues.tsv"), "utf8");
  assert.match(issues, /ACC201\tevening\terror\tDownload input excluded \(stale, failed\)/);
  assert.match(issues, /BUS101\tdaytime\twarning\tDownload input excluded \(missing, not_found\)/);
});

it("empty or invalid download manifests never fall back to directory scanning", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-empty-manifest-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "pdfs/evening"), { recursive: true });
  await fs.writeFile(path.join(cwd, "pdfs/evening/ACC201.pdf"), oldPdf);
  await fs.writeFile(path.join(cwd, "manifest.json"), "[]");
  await assert.rejects(execFileAsync(process.execPath, [
    "--import", loader, fileURLToPath(new URL("./parseCoursePdfs.ts", import.meta.url)),
    "--download-manifest", "manifest.json", "--pdf-dir", "pdfs",
  ], { cwd }), (error: unknown) => (error as { code: number }).code === 1);
  assert.equal(await fs.readFile(path.join(cwd, "data/output/courses/parse-issues.tsv"), "utf8"),
    "course_code\tschedule_type\tseverity\tissue\n");
  await assert.rejects(fs.access(path.join(cwd, "data/output/courses/course-details.sql")));
  await fs.writeFile(path.join(cwd, "manifest.json"), "{}");
  for (const manifestArgs of [["--download-manifest", "manifest.json"], ["--download-manifest"]]) {
    await assert.rejects(execFileAsync(process.execPath, [
      "--import", loader, fileURLToPath(new URL("./parseCoursePdfs.ts", import.meta.url)),
      "--pdf-dir", "pdfs", ...manifestArgs,
    ], { cwd }), (error: unknown) => (error as { code: number }).code === 1);
    await assert.rejects(fs.access(path.join(cwd, "data/output/courses/course-details.sql")));
  }
});

it("manifest selection applies filters and rejects conflicting or missing accepted inputs", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-manifest-validation-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const pdfPath = path.join(cwd, "ACC201.pdf");
  const manifestPath = path.join(cwd, "manifest.json");
  await fs.writeFile(pdfPath, oldPdf);
  const row = { courseCode: "ACC201", scheduleType: "evening", pdfPath, status: "skipped" };
  await fs.writeFile(manifestPath, JSON.stringify([row]));
  const filter = await loadCourseCodeFilter({ codes: "BUS101" });
  assert.deepEqual(await loadCourseDownloadManifest(manifestPath, filter), { accepted: [], excluded: [] });
  const all = await loadCourseCodeFilter({});
  assert.equal((await loadCourseDownloadManifest(manifestPath, all)).accepted[0].inputState, "cached");
  await fs.writeFile(manifestPath, JSON.stringify([{ ...row, inputState: "stale" }]));
  await assert.rejects(loadCourseDownloadManifest(manifestPath, all), /Inconsistent input state/);
  await fs.writeFile(manifestPath, JSON.stringify([row, row]));
  await assert.rejects(loadCourseDownloadManifest(manifestPath, all), /Duplicate course variant/);
  await fs.writeFile(manifestPath, JSON.stringify([row]));
  await fs.rm(pdfPath);
  await assert.rejects(loadCourseDownloadManifest(manifestPath, all), /ENOENT/);
});
