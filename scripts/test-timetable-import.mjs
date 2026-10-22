// Run against a local production server with Playwright installed separately:
// node scripts/test-timetable-import.mjs http://localhost:3100 /path/to/playwright/index.mjs /tmp/import-screenshots
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [baseUrl = "http://localhost:3100", modulePath, screenshotDir] = process.argv.slice(2);
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : "playwright");
const browser = await chromium.launch({ headless: true });
const key = "sussplanner.timetable.v1";
const group = (courseCode, groupCode = "TG01", originSemesterId) => ({ courseCode, groupCode,
  groupCodeType: groupCode.startsWith("CRN") ? "CRN" : "TG",
  scheduleType: groupCode.startsWith("CRN") ? "evening" : "daytime",
  ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const semester = (semesterId, selectedClasses) => ({ semesterId, selectedClasses, hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all" });
const state = (selectedClasses, origins = {}) => ({ ...semester(14, selectedClasses), orientation: "horizontal", viewMode: "class",
  semesterStates: { ...origins, "14": semester(14, selectedClasses) } });
const saved = (page) => page.evaluate((key) => localStorage.getItem(key), key);
const read = async (page) => JSON.parse(await saved(page));
const seed = (page, value) => page.evaluate(({ key, value }) => {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}, { key, value });
const dialog = (page) => page.getByRole("dialog");
const open = async (page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /^Dismiss announcement:/ }).first().waitFor({ timeout: 1000 }).catch(() => {});
  const notifications = page.getByRole("button", { name: /^(Dismiss|Snooze)/ });
  while (await notifications.count()) await notifications.first().click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await dialog(page).getByRole("button", { name: /Proceed|Confirm import/ }).waitFor();
};
const assertIncludes = async (locator, text) => assert.ok((await locator.innerText()).includes(text), `Expected ${text}`);
async function scenario(name, callback)
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  console.log(`RUN: ${name}`);
  try { await callback(page); console.log(`PASS: ${name}`); }
  finally { await context.close(); }
}

try
{
  await scenario("comparison cancellation, Escape, backdrop, navigation, and final persistence", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await seed(page, state([group("NIE301")]));
    const before = await saved(page);
    for (const dismiss of ["cancel", "escape", "backdrop"])
    {
      await open(page);
      await assertIncludes(dialog(page), "NIE301 TG01 → NIE301 TG02");
      assert.equal(await saved(page), before);
      if (dismiss === "cancel") await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
      if (dismiss === "escape") await page.keyboard.press("Escape");
      if (dismiss === "backdrop") await page.getByRole("button", { name: "Close modal", exact: true }).click({ position: { x: 2, y: 2 } });
      await dialog(page).waitFor({ state: "hidden" });
      assert.equal(await saved(page), before);
    }
    await open(page);
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    assert.equal(await saved(page), before);
    await open(page);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    assert.deepEqual((await read(page)).semesterStates["14"].selectedClasses, [group("NIE301", "TG02")]);
  });

  const links = [group("NIE301", "TG02", 3), group("NIE351", "TG03", 3)];
  const origins = { "3": semester(3, [group("NIE301", "TG02"), group("NIE351", "TG03")]) };
  const mixed = state([...links, group("NIE351", "TG02")], origins);
  const mixedUrl = `${baseUrl}/share?sem=14&classes=NIE301:TG01@3,NIE351:TG01@3,ICT302:CRN01,GONE:TG01`;
  await scenario("warning cancellation, effective comparison, kept links, and mobile layout", async (page) => {
    await page.goto(mixedUrl);
    await seed(page, mixed);
    const before = await saved(page);
    for (const dismiss of ["cancel", "escape", "backdrop"])
    {
      await open(page);
      await assertIncludes(dialog(page), "Some classes will be skipped");
      assert.equal(await saved(page), before);
      if (dismiss === "cancel") await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
      if (dismiss === "escape") await page.keyboard.press("Escape");
      if (dismiss === "backdrop") await page.getByRole("button", { name: "Close modal", exact: true }).click({ position: { x: 2, y: 2 } });
      await dialog(page).waitFor({ state: "hidden" });
      assert.equal(await saved(page), before);
    }
    await open(page);
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    await assertIncludes(dialog(page).getByRole("region", { name: "Kept", exact: true }), "NIE301 TG02 · continuation from July 2026");
    await assertIncludes(dialog(page).getByRole("region", { name: "Removed", exact: true }), "NIE351 TG02");
    await assertIncludes(dialog(page).getByRole("region", { name: "Added", exact: true }), "ICT302 CRN01");
    assert.ok(!(await dialog(page).innerText()).includes("GONE"));
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG01"));
    assert.equal(await saved(page), before);
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
    for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 390, 844]])
    {
      await page.setViewportSize({ width, height });
      const box = await dialog(page).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${name}: dialog fits viewport`);
      assert.ok(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth), `${name}: no horizontal overflow`);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/import-comparison-${name}.png` });
    }
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.semesterStates["14"].selectedClasses, [group("ICT302", "CRN01"), ...links]);
    assert.deepEqual(result.semesterStates["3"], origins["3"]);
  });

  await scenario("empty saved timetable, true no-op, view reset, and all-skipped safeguards", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await seed(page, null);
    await open(page);
    await assertIncludes(dialog(page).getByRole("region", { name: "Added", exact: true }), "NIE301 TG02");
    assert.equal(await saved(page), null);
    await page.keyboard.press("Escape");
    await seed(page, state([group("NIE301", "TG02")]));
    await open(page);
    await assertIncludes(dialog(page), "No changes will be made.");
    assert.equal(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    const hidden = state([group("NIE301", "TG02")]);
    hidden.hiddenClasses = hidden.semesterStates["14"].hiddenClasses = ["NIE301:daytime:TG:TG02"];
    await seed(page, hidden);
    await open(page);
    await assertIncludes(dialog(page), "show hidden classes and reset the week view");
    assert.equal(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isEnabled(), true);
    await page.goto(`${baseUrl}/share?sem=14&classes=GONE:TG01`);
    const before = await saved(page);
    await open(page);
    await assertIncludes(dialog(page), "There are no valid selections to import.");
    assert.equal(await dialog(page).getByRole("button", { name: "Proceed", exact: true }).isDisabled(), true);
    assert.equal(await saved(page), before);
    await page.goto(`${baseUrl}/share?sem=14`);
    await open(page);
    await assertIncludes(dialog(page), "This shared timetable is empty.");
    assert.equal(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isDisabled(), true);
    assert.equal(await saved(page), before);
  });

  await scenario("saved changes invalidate confirmation and refresh the skipped warning", async (page) => {
    await page.goto(mixedUrl);
    await seed(page, mixed);
    await open(page);
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    const updated = structuredClone(mixed);
    updated.semesterStates["3"].selectedClasses[0].groupCode = "TG04";
    await seed(page, updated); // No storage event: exercise the final guarded confirmation.
    const before = await saved(page);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).waitFor();
    await assertIncludes(dialog(page), "Your saved timetable changed.");
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    assert.ok(!(await dialog(page).getByRole("region", { name: "Kept", exact: true }).innerText()).includes("NIE301"));
    await assertIncludes(dialog(page).getByRole("region", { name: "Removed", exact: true }), "NIE301 TG02 · continuation");
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    assert.deepEqual((await read(page)).semesterStates["14"].selectedClasses, [group("ICT302", "CRN01"), links[1]]);
  });
  await scenario("storage events refresh a review and cancellation invalidates pending validation", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await seed(page, state([group("NIE301")]));
    await open(page);
    await seed(page, state([group("NIE351", "TG02")]));
    await page.evaluate((key) => window.dispatchEvent(new StorageEvent("storage", { key })), key);
    await dialog(page).getByText("Your saved timetable changed. Review this updated import before confirming.", { exact: true }).waitFor();
    await assertIncludes(dialog(page).getByRole("region", { name: "Removed", exact: true }), "NIE351 TG02");
    await page.keyboard.press("Escape");
    let release;
    const gate = new Promise((done) => { release = done; });
    let requested;
    const seen = new Promise((done) => { requested = done; });
    await page.route("**/api/classes?*", async (route) => {
      const response = await route.fetch();
      requested();
      await gate;
      await route.fulfill({ response });
    });
    const before = await saved(page);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await seen;
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    release();
    await page.unrouteAll({ behavior: "wait" });
    assert.equal(await dialog(page).count(), 0);
    assert.equal(await saved(page), before);
  });

}
finally { await browser.close(); }
