import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { VariantDownloadResult } from "../lib/courseDownloadManifest.js";

const execFileAsync = promisify(execFile);
const loader = import.meta.resolve("tsx");
const cli = fileURLToPath(new URL("./downloadCoursePdfs.ts", import.meta.url));
const pdf = `%PDF${"mock course content ".repeat(500)}`;

for (const symlinked of [false, true]) {
  it(`executes the ${symlinked ? "symlinked" : "direct"} CLI for errors and successful downloads`, async t => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-download-cli-"));
    t.after(() => fs.rm(cwd, { recursive: true, force: true }));
    await fs.symlink(path.dirname(cli), path.join(cwd, "cli-link"), "dir");
    const entry = symlinked ? path.join(cwd, "cli-link", path.basename(cli)) : cli;
    const missing = path.join(cwd, "missing-codes.txt");
    await assert.rejects(execFileAsync(process.execPath, ["--import", loader, entry, "--codes-file", missing], { cwd }),
      (error: unknown) => {
        const result = error as { code: number; stderr: string };
        assert.equal(result.code, 1);
        assert.match(result.stderr, /ENOENT/);
        assert.ok(result.stderr.includes(missing));
        return true;
      });
    const mock = path.join(cwd, "fetch-mock.mjs");
    await fs.writeFile(mock, `globalThis.fetch = async () => new Response(${JSON.stringify(pdf)});`);
    const codes = path.join(cwd, "codes.txt");
    await fs.writeFile(codes, "ACC201\n");
    const result = await execFileAsync(process.execPath, ["--import", mock, "--import", loader, entry,
      "--codes-file", codes, "--out-dir", "pdfs", "--delay-ms", "0"], { cwd });
    assert.match(result.stdout, /Course codes processed: 1/);
    assert.match(result.stdout, /Downloaded: 2/);
    const manifest: VariantDownloadResult[] = JSON.parse(await fs.readFile(path.join(cwd, "data/output/courses/downloads.json"), "utf8"));
    assert.deepEqual(manifest.map(item => [item.courseCode, item.scheduleType, item.status, item.inputState]),
      [["ACC201", "daytime", "downloaded", "fresh"], ["ACC201", "evening", "downloaded", "fresh"]]);
    for (const item of manifest) assert.equal(await fs.readFile(item.pdfPath, "utf8"), pdf);
    const report = await fs.readFile(path.join(cwd, "data/output/courses/download-report.tsv"), "utf8");
    assert.match(report, /ACC201\t✓\t✓\tdownloaded\tdownloaded\tfresh\tfresh/);
  });
}

it("imports downloadVariant without executing the CLI", async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "suss-download-import-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const importer = path.join(cwd, "import.mjs");
  await fs.writeFile(importer, `
    globalThis.fetch = () => { throw new Error('unexpected download'); };
    const module = await import(${JSON.stringify(pathToFileURL(cli).href)});
    if (typeof module.downloadVariant !== 'function') throw new Error('missing export');
  `);
  const result = await execFileAsync(process.execPath, ["--import", loader, importer, "--codes", "ACC201"], { cwd });
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.deepEqual(await fs.readdir(cwd), ["import.mjs"]);
});
