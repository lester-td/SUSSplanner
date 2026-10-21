import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { parseArgs } from "./args.js";
import { filterCourseCodes, loadCourseCodeFilter, parseCourseCodes, resolveInputCourseCodes } from "./courseCodeFilter.js";

const availableCodes = ["abc101", "ACC101", "bus101", "BUS102", "DEF101", "ZZZ101", "acc101"];

for (const scenario of [
  { name: "no selectors", inline: false, file: false, prefix: false, expected: ["ACC101", "BUS101", "DEF101"] },
  { name: "inline codes", inline: true, file: false, prefix: false, expected: ["ABC101", "BUS101"] },
  { name: "file codes", inline: false, file: true, prefix: false, expected: ["ACC101", "BUS101", "BUS102"] },
  { name: "prefix", inline: false, file: false, prefix: true, expected: ["ACC101"] },
  { name: "file and inline codes", inline: true, file: true, prefix: false, expected: ["ABC101", "ACC101", "BUS101", "BUS102"] },
  { name: "inline codes and prefix", inline: true, file: false, prefix: true, expected: ["ABC101", "ACC101", "BUS101"] },
  { name: "file codes and prefix", inline: false, file: true, prefix: true, expected: ["ACC101", "BUS101", "BUS102"] },
  { name: "all selectors", inline: true, file: true, prefix: true, expected: ["ABC101", "ACC101", "BUS101", "BUS102"] },
]) {
  it(`resolves ${scenario.name} with shared case-insensitive union semantics`, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-code-filter-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const defaultFile = path.join(dir, "default.txt");
    const explicitFile = path.join(dir, "courses.txt");
    await fs.writeFile(defaultFile, "acc101\nBUS101\tdef101\nACC101\n");
    await fs.writeFile(explicitFile, "bus101\nBUS102 acc101\nBus101\n");
    const argv: string[] = [];
    if (scenario.inline) argv.push("--codes", "abc101, BUS101 AbC101 bus101");
    if (scenario.file) argv.push("--codes-file", explicitFile);
    if (scenario.prefix) argv.push("--code-prefix", "acc,ACC");
    const args = parseArgs(argv);

    assert.deepEqual(await resolveInputCourseCodes(args, defaultFile), scenario.expected);

    // Parsing and JSON-to-SQL conversion apply this filter to their own inputs.
    const filter = await loadCourseCodeFilter(args);
    assert.deepEqual(filterCourseCodes(availableCodes, filter),
      argv.length > 0 ? scenario.expected : ["ABC101", "ACC101", "BUS101", "BUS102", "DEF101", "ZZZ101"]);
    assert.equal(filter.active, argv.length > 0);
    assert.deepEqual(filter.prefixes, scenario.prefix ? ["ACC"] : []);
  });
}

it("inline codes alone do not require the default codes file", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-inline-codes-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const missingFile = path.join(dir, "missing.txt");
  assert.deepEqual(await resolveInputCourseCodes({ codes: "abc101,ABC101" }, missingFile), ["ABC101"]);
  await assert.rejects(resolveInputCourseCodes({ codes: "abc101", "code-prefix": "ACC" }, missingFile), /ENOENT/);
});

it("an explicit codes file is required even when inline codes are supplied", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-explicit-codes-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const defaultFile = path.join(dir, "default.txt");
  await fs.writeFile(defaultFile, "DEF101");
  await assert.rejects(resolveInputCourseCodes({
    codes: "abc101",
    "codes-file": path.join(dir, "missing.txt"),
  }, defaultFile), /ENOENT/);
});

it("an explicit file and inline codes do not require the default file", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-codes-union-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const explicitFile = path.join(dir, "courses.txt");
  await fs.writeFile(explicitFile, "bus101\nBUS101");
  assert.deepEqual(await resolveInputCourseCodes({
    codes: "abc101",
    "codes-file": explicitFile,
  }, path.join(dir, "missing.txt")), ["ABC101", "BUS101"]);
});

it("multiple prefixes union with inline codes over the default file", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-code-prefixes-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const defaultFile = path.join(dir, "default.txt");
  await fs.writeFile(defaultFile, "acc101\nBUS101\nDEF101\nACC101");
  assert.deepEqual(await resolveInputCourseCodes({
    codes: "abc101",
    "code-prefix": "acc,BUS,Acc",
  }, defaultFile), ["ABC101", "ACC101", "BUS101"]);
});

it("preserves suffixes, partial prefixes, and normalized selector unions", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-code-suffixes-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const codesFile = path.join(dir, "codes.txt");
  await fs.writeFile(codesFile, "bus557Ae\nCDO303ACI\nmgt558o\nBUS557AE\n");
  assert.deepEqual(parseCourseCodes("bus557Ae, CDO303ACI\tmgt558o"), ["BUS557AE", "CDO303ACI", "MGT558O"]);
  assert.deepEqual(await resolveInputCourseCodes({ "code-prefix": "bus5, cdo3,m" }, codesFile),
    ["BUS557AE", "CDO303ACI", "MGT558O"]);
  assert.deepEqual(await resolveInputCourseCodes({ codes: "acc201", "codes-file": codesFile, "code-prefix": "bus5" }, "missing.txt"),
    ["ACC201", "BUS557AE", "CDO303ACI", "MGT558O"]);
});

for (const unsafe of ["../../ACC201", "..\\..\\ACC201", "/tmp/ACC201", "C:\\tmp\\ACC201", "ACC/201", "ACC\\201", "ACC201.pdf", "ACC201?x=1", "ACC201\0", "ACCé201"]) {
  it(`rejects unsafe selectors from every shared input source: ${JSON.stringify(unsafe)}`, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suss-unsafe-code-"));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const codesFile = path.join(dir, "codes.txt");
    await fs.writeFile(codesFile, `ACC201\n${unsafe}\n`);
    await assert.rejects(resolveInputCourseCodes({ codes: `ACC201,${unsafe}` }, "missing.txt"), /Invalid course selector/);
    await assert.rejects(loadCourseCodeFilter({ "code-prefix": unsafe }), /Invalid course selector/);
    await assert.rejects(resolveInputCourseCodes({ codes: "BUS101", "codes-file": codesFile }, "missing.txt"), /Invalid course selector/);
    await assert.rejects(resolveInputCourseCodes({}, codesFile), /Invalid course selector/);
    // Invalid default-file candidates must not disappear behind a prefix filter.
    await assert.rejects(resolveInputCourseCodes({ "code-prefix": "BUS" }, codesFile), /Invalid course selector/);
  });
}
