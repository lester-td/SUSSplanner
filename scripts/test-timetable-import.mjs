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
const start = async (page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /^Dismiss announcement:/ }).first().waitFor({ timeout: 1000 }).catch(() => {});
  const popups = page.locator(".app-notification-stack").getByRole("button", { name: /^(Dismiss|Snooze)/ });
  while (await popups.count()) await popups.first().click();
  const notifications = page.getByRole("button", { name: /^(Dismiss|Snooze)/ });
  while (await notifications.count()) await notifications.first().click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
};
const open = async (page) => {
  await start(page);
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
      await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Removed", exact: true }), "NIE301 TG01");
      await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Added", exact: true }), "NIE301 TG02");
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
  await scenario("warning cancellation, effective comparison, protected links, and mobile layout", async (page) => {
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
    for (const category of ["Kept", "Changed"]) assert.equal(await dialog(page).getByRole("region", { name: category, exact: true }).count(), 0);
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG02"), "unchanged protected link is omitted from comparison");
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Removed", exact: true }), "NIE351 TG02");
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Added", exact: true }), "ICT302 CRN01");
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
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Added", exact: true }), "NIE301 TG02");
    assert.equal(await saved(page), null);
    await page.keyboard.press("Escape");
    await seed(page, state([group("NIE301", "TG02")], { "28": semester(28, [group("NIE301", "TG02", 14)]) }));
    await open(page);
    await assertIncludes(dialog(page), "This timetable matches your saved timetable.");
    assert.equal(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    const hidden = state([group("NIE301", "TG02")], { "28": semester(28, [group("NIE301", "TG02", 14)]) });
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
    assert.equal(await dialog(page).getByRole("region", { name: "Kept", exact: true }).count(), 0);
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Removed", exact: true }), "NIE301 TG02 · continuation");
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
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }).getByRole("region", { name: "Removed", exact: true }), "NIE351 TG02");
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
    await start(page);
    await seen;
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    release();
    await page.unrouteAll({ behavior: "wait" });
    assert.equal(await dialog(page).count(), 0);
    assert.equal(await saved(page), before);
  });

  const origin3 = semester(3, [group("NIE301")]);
  const independent = group("NIE301", "TG03");
  const crossState = () => state([group("NIE301", "TG01", 3), independent], {
    "3": structuredClone(origin3),
    "28": semester(28, [group("NIE301", "TG01", 3), group("NIE301", "TG03", 14)]),
  });
  async function capture(page, prefix)
  {
    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
    for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 390, 844]])
    {
      await page.setViewportSize({ width, height });
      const box = await dialog(page).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.height <= height, `${name}: dialog fits`);
      assert.ok(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth), `${name}: no horizontal overflow`);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${prefix}-${name}.png` });
    }
  }
  await scenario("cross-semester replacement reconciles links and preserves independent enrolments through reload", async (page) => {
    await page.goto(`${baseUrl}/share?sem=3&classes=NIE301:TG02`);
    const initial = crossState();
    initial.semesterStates["14"].hiddenClasses = ["NIE301:daytime:TG:TG01@3"];
    initial.hiddenClasses = initial.semesterStates["14"].hiddenClasses;
    await seed(page, initial);
    const before = await saved(page);
    await open(page);
    const july = dialog(page).getByRole("region", { name: "July 2026", exact: true });
    const january = dialog(page).getByRole("region", { name: "January 2027", exact: true });
    await assertIncludes(july.getByRole("region", { name: "Removed", exact: true }), "NIE301 TG01");
    await assertIncludes(july.getByRole("region", { name: "Added", exact: true }), "NIE301 TG02");
    await assertIncludes(january.getByRole("region", { name: "Removed", exact: true }), "NIE301 TG01 · continuation from July 2026");
    await assertIncludes(january.getByRole("region", { name: "Added", exact: true }), "NIE301 TG02 · continuation from July 2026");
    await assertIncludes(dialog(page).getByRole("region", { name: "July 2027", exact: true }), "Removed");
    assert.ok(!(await dialog(page).innerText()).includes("TG03"));
    assert.equal(await saved(page), before);
    await capture(page, "146-cross-semester");
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.semesterStates["3"].selectedClasses, [group("NIE301", "TG02")]);
    assert.deepEqual(result.semesterStates["14"].selectedClasses, [group("NIE301", "TG02", 3), independent]);
    assert.deepEqual(result.semesterStates["28"].selectedClasses, [group("NIE301", "TG03", 14)]);
    assert.deepEqual(result.semesterStates["14"].hiddenClasses, []);
    await page.reload();
    assert.deepEqual((await read(page)).semesterStates, result.semesterStates);
  });

  await scenario("omitting a start discloses and removes its entire linked enrolment", async (page) => {
    await page.goto(`${baseUrl}/share?sem=3&classes=NIE351:TG03`);
    await seed(page, crossState());
    const before = await saved(page);
    await open(page);
    for (const semesterName of ["July 2026", "January 2027", "July 2027"])
      await assertIncludes(dialog(page).getByRole("region", { name: semesterName, exact: true }).getByRole("region", { name: "Removed", exact: true }), "NIE301 TG01");
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.semesterStates["3"].selectedClasses, [group("NIE351", "TG03")]);
    assert.deepEqual(result.semesterStates["14"].selectedClasses, [independent, group("NIE351", "TG03", 3)]);
    assert.deepEqual(result.semesterStates["28"].selectedClasses, [group("NIE301", "TG03", 14)]);
  });

  await scenario("ambiguity defaults, keyboard choices, cancellation, focus, and mobile layout", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,NIE301:TG01,NIE301:TG02,NIE351:TG03,NIE351:TG02`);
    await seed(page, null);
    for (const dismiss of ["cancel", "escape", "backdrop"])
    {
      await start(page);
      await dialog(page).getByRole("radio").first().waitFor();
      assert.equal(await dialog(page).getByRole("radio").count(), 4);
      assert.equal(await dialog(page).getByRole("radio", { checked: true }).count(), 2);
      assert.ok(await dialog(page).getByRole("radio", { name: /NIE301 TG02/ }).isChecked());
      assert.ok(await dialog(page).getByRole("radio", { name: /NIE351 TG03/ }).isChecked());
      assert.ok(await dialog(page).getByRole("radio").first().evaluate((el) => el === document.activeElement));
      assert.equal(await saved(page), null);
      if (dismiss === "cancel") await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
      if (dismiss === "escape") await page.keyboard.press("Escape");
      if (dismiss === "backdrop") await page.getByRole("button", { name: "Close modal", exact: true }).click({ position: { x: 2, y: 2 } });
      await dialog(page).waitFor({ state: "hidden" });
      assert.equal(await saved(page), null);
      assert.ok(await page.getByRole("button", { name: "Import", exact: true }).evaluate((el) => el === document.activeElement));
    }
    await start(page);
    await dialog(page).getByRole("radio").first().focus();
    await page.keyboard.press("ArrowDown");
    assert.ok(await dialog(page).getByRole("radio", { name: /NIE301 TG01/ }).isChecked());
    await capture(page, "146-group-choice");
    await dialog(page).getByRole("button", { name: "Review import", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).waitFor();
    await assertIncludes(dialog(page).getByRole("region", { name: "January 2027", exact: true }), "NIE301 TG01");
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG02"));
    assert.equal(await saved(page), null);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    assert.deepEqual((await read(page)).semesterStates["14"].selectedClasses, [group("NIE301"), group("NIE351", "TG03")]);
    assert.deepEqual((await read(page)).semesterStates["28"].selectedClasses, [group("NIE301", "TG01", 14), group("NIE351", "TG03", 14)]);
  });

  await scenario("accepting the default group and exact duplicates", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,NIE301:TG01`);
    await seed(page, null);
    await start(page);
    await dialog(page).getByRole("button", { name: "Review import", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    assert.deepEqual((await read(page)).selectedClasses, [group("NIE301", "TG02")]);
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,NIE301:TG02`);
    await open(page);
    assert.ok(!(await dialog(page).innerText()).includes("Choose incoming groups"));
    await assertIncludes(dialog(page), "This timetable matches your saved timetable.");
  });

  await scenario("a chosen unresolved group preserves its previous enrolment without switching groups", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,NIE301:TG99,ICT302:CRN01`);
    const initial = state([group("NIE301")], { "28": semester(28, [group("NIE301", "TG01", 14)]) });
    await seed(page, initial);
    const before = await saved(page);
    await start(page);
    await dialog(page).getByRole("radio", { name: /NIE301 TG99/ }).check();
    await dialog(page).getByRole("button", { name: "Review import", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).waitFor();
    await assertIncludes(dialog(page), "NIE301 TG99");
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG02"));
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG01"));
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.selectedClasses, [group("ICT302", "CRN01"), group("NIE301")]);
    assert.deepEqual(result.semesterStates["28"], initial.semesterStates["28"]);
  });

  await scenario("destination capacity rejects all competitors and restores a failed replacement", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,NIE351:TG03,ICT302:CRN01`);
    const fillers = Array.from({ length: 49 }, (_, index) => group(`FILL${index}`));
    const initial = state([group("NIE301")], { "28": semester(28, [group("NIE301", "TG01", 14), ...fillers]) });
    await seed(page, initial);
    const before = await saved(page);
    await open(page);
    await assertIncludes(dialog(page), "Some classes will be skipped");
    await assertIncludes(dialog(page), "NIE301 TG02");
    await assertIncludes(dialog(page), "NIE351 TG03");
    await assertIncludes(dialog(page), "class limit");
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    await assertIncludes(dialog(page).getByRole("region", { name: "Added", exact: true }), "ICT302 CRN01");
    assert.equal(await dialog(page).getByRole("region", { name: "Removed", exact: true }).count(), 0);
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.selectedClasses, [group("ICT302", "CRN01"), group("NIE301")]);
    assert.deepEqual(result.semesterStates["28"], initial.semesterStates["28"]);
  });

  await scenario("unverifiable destination warns before removing obsolete links", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    const initial = state([group("NIE301")], { "28": semester(28, [group("NIE301", "TG01", 14)]) });
    await seed(page, initial);
    await page.route("**/api/classes?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("sem") === "28") await route.fulfill({ status: 503, body: "Unavailable" });
      else await route.continue();
    });
    const before = await saved(page);
    await open(page);
    await assertIncludes(dialog(page).getByRole("alert"), "Continuation information could not be verified");
    await assertIncludes(dialog(page).getByRole("alert"), "may be incomplete");
    await assertIncludes(dialog(page).getByRole("region", { name: "July 2027", exact: true }), "Removed");
    assert.equal(await saved(page), before);
    await page.keyboard.press("Escape");
    assert.equal(await saved(page), before);
    await open(page);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    assert.deepEqual((await read(page)).selectedClasses, [group("NIE301", "TG02")]);
    assert.deepEqual((await read(page)).semesterStates["28"].selectedClasses, []);
  });

  await scenario("continuation-only changes are actionable, then become a true no-op", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await seed(page, state([group("NIE301", "TG02")]));
    await open(page);
    assert.equal(await dialog(page).getByRole("region", { name: "January 2027", exact: true }).count(), 0);
    await assertIncludes(dialog(page).getByRole("region", { name: "July 2027", exact: true }), "NIE301 TG02");
    assert.ok(!(await dialog(page).innerText()).includes("This timetable matches"));
    assert.ok(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isEnabled());
    const before = await saved(page);
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await saved(page), before);
    await open(page);
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await open(page);
    await assertIncludes(dialog(page), "This timetable matches your saved timetable.");
    assert.ok(await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).isDisabled());
  });

  await scenario("a destination changed before confirmation requires fresh capacity review", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02,ICT302:CRN01`);
    const fillers = Array.from({ length: 49 }, (_, index) => group(`FILL${index}`));
    const initial = state([group("NIE301")], { "28": semester(28, fillers) });
    await seed(page, initial);
    await open(page);
    await assertIncludes(dialog(page).getByRole("region", { name: "July 2027", exact: true }), "Added");
    const updated = structuredClone(initial);
    updated.semesterStates["28"].selectedClasses.push(group("FILL49"));
    await seed(page, updated); // Final confirmation must re-read without an event.
    const before = await saved(page);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).waitFor();
    await assertIncludes(dialog(page), "Your saved timetable changed");
    await assertIncludes(dialog(page), "NIE301 TG02");
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Proceed", exact: true }).click();
    assert.equal(await dialog(page).getByRole("region", { name: "July 2027", exact: true }).count(), 0);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.selectedClasses, [group("ICT302", "CRN01"), group("NIE301")]);
    assert.deepEqual(result.semesterStates["28"], updated.semesterStates["28"]);
  });

  await scenario("a cancelled asynchronous response cannot replace a newer review", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG02`);
    await seed(page, state([group("NIE301")]));
    let release;
    const gate = new Promise((done) => { release = done; });
    let requested;
    const seen = new Promise((done) => { requested = done; });
    let held = false;
    await page.route("**/api/classes?*", async (route) => {
      if (!held && new URL(route.request().url()).searchParams.get("sem") === "28")
      {
        held = true;
        const response = await route.fetch();
        requested();
        await gate;
        await route.fulfill({ response });
      }
      else await route.continue();
    });
    await start(page);
    await seen;
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await seed(page, state([group("ICT302", "CRN01")]));
    const before = await saved(page);
    await open(page);
    release();
    await page.unrouteAll({ behavior: "wait" });
    await assertIncludes(dialog(page).getByRole("region", { name: "Removed", exact: true }), "ICT302 CRN01");
    assert.ok(!(await dialog(page).innerText()).includes("NIE301 TG01"));
    assert.equal(await saved(page), before);
    await dialog(page).getByRole("button", { name: "Confirm import", exact: true }).click();
    await page.waitForURL("**/timetable");
    const result = await read(page);
    assert.deepEqual(result.selectedClasses, [group("NIE301", "TG02")]);
    assert.deepEqual(result.semesterStates["28"].selectedClasses, [group("NIE301", "TG02", 14)]);
  });

  await scenario("legacy restoration preserves metadata through navigation and reload without redundant writes", async (page) => {
    await page.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      window.timetableWrites = 0;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) window.timetableWrites += 1;
        return setItem.call(this, name, value);
      };
    }, key);
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
    const initial = state([group("NIE301")], { "3": semester(3, [group("ICT302", "CRN01")]) });
    initial.hiddenClasses = initial.semesterStates["14"].hiddenClasses = ["NIE301:daytime:TG:TG01"];
    initial.courseColorsByCourseCode = initial.semesterStates["14"].courseColorsByCourseCode = { NIE301: "theme-color:2" };
    await seed(page, initial);
    await page.goto(`${baseUrl}/timetable`);
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).semesterStates["28"]?.selectedClasses.length === 1, key);
    const restored = await read(page);
    assert.deepEqual(restored.semesterStates["28"].selectedClasses, [group("NIE301", "TG01", 14)]);
    for (const id of ["3", "14"]) assert.deepEqual(restored.semesterStates[id], initial.semesterStates[id]);
    assert.equal(await page.evaluate(() => window.timetableWrites), 1);
    await page.locator('[data-rail-item="28"]').first().click();
    await page.getByRole("button", { name: "Remove course", exact: true }).waitFor();
    await page.locator('[data-rail-item="14"]').first().click();
    await page.reload();
    await page.waitForLoadState("networkidle");
    assert.deepEqual((await read(page)).semesterStates["28"], restored.semesterStates["28"]);
    assert.equal(await page.evaluate(() => window.timetableWrites), 0);
  });

  await scenario("legacy conflicts remain add-only and display a warning on desktop and mobile", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
    const initial = state([group("NIE301")], { "28": { ...semester(28, [group("NIE301", "TG02", 14)]),
      hiddenClasses: ["NIE301:daytime:TG:TG02@14"], selectedWeekId: 7 } });
    await seed(page, initial);
    const before = await saved(page);
    await page.goto(`${baseUrl}/timetable`);
    await page.getByText(/Some continuation links could not be restored for NIE301/).waitFor();
    assert.equal(await saved(page), before);
    const announcements = page.getByRole("button", { name: /^Dismiss announcement:/ });
    while (await announcements.count()) await announcements.first().click();
    for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 390, 844]])
    {
      await page.setViewportSize({ width, height });
      const notice = page.getByText(/Some continuation links could not be restored for NIE301/);
      assert.ok(await notice.evaluate((el) => el.scrollWidth <= el.clientWidth), `${name}: restoration notice wraps`);
      if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/139-restoration-${name}.png`, fullPage: true });
    }
  });

  async function holdLegacyDestination(page)
  {
    let release;
    const gate = new Promise((done) => { release = done; });
    let requested;
    const seen = new Promise((done) => { requested = done; });
    let held = false;
    await page.route("**/api/classes?*", async (route) => {
      if (!held && new URL(route.request().url()).searchParams.get("sem") === "28")
      {
        held = true;
        const response = await route.fetch();
        requested();
        await gate;
        await route.fulfill({ response });
      }
      else await route.continue();
    });
    await page.goto(`${baseUrl}/timetable`);
    await seen;
    return async () => { release(); await page.unrouteAll({ behavior: "wait" }); await page.waitForLoadState("networkidle"); };
  }

  await scenario("a held legacy response cannot recreate a removed enrolment", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
    await seed(page, state([group("NIE301")]));
    const release = await holdLegacyDestination(page);
    await page.getByRole("button", { name: "Remove course", exact: true }).click();
    const before = await saved(page);
    await release();
    assert.equal(await saved(page), before);
    assert.deepEqual((await read(page)).selectedClasses, []);
    assert.equal((await read(page)).semesterStates["28"], undefined);
  });

  await scenario("an older held response cannot overwrite a newer group resolution", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
    await seed(page, state([group("NIE301")]));
    const release = await holdLegacyDestination(page);
    await seed(page, state([group("NIE301", "TG02")]));
    await page.evaluate((key) => window.dispatchEvent(new StorageEvent("storage", { key })), key);
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).semesterStates["28"]?.selectedClasses[0]?.groupCode === "TG02", key);
    const before = await saved(page);
    await release();
    assert.equal(await saved(page), before);
    assert.deepEqual((await read(page)).semesterStates["28"].selectedClasses, [group("NIE301", "TG02", 14)]);
  });

  for (const change of ["unrelated", "filled", "conflicting"])
  {
    await scenario(`legacy resolution rechecks a destination changed during its request: ${change}`, async (page) => {
      await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
      await seed(page, state([group("NIE301")]));
      const release = await holdLegacyDestination(page);
      const latest = await read(page);
      if (change === "unrelated") latest.semesterStates["3"] = semester(3, [group("ICT302", "CRN01")]);
      if (change === "filled") latest.semesterStates["28"] = semester(28, Array.from({ length: 50 }, (_, index) => group(`FILL${index}`)));
      if (change === "conflicting") latest.semesterStates["28"] = semester(28, [group("NIE301", "TG02", 14)]);
      await seed(page, latest); // Deliberately no event: test the final fresh read.
      const before = await saved(page);
      await release();
      if (change === "unrelated")
      {
        assert.deepEqual((await read(page)).semesterStates["3"], latest.semesterStates["3"]);
        assert.deepEqual((await read(page)).semesterStates["28"].selectedClasses, [group("NIE301", "TG01", 14)]);
      }
      else
      {
        const notice = page.getByText(/Some continuation links could not be restored/);
        await notice.waitFor();
        await assertIncludes(notice, change === "filled" ? "full destination timetables" : "conflicting saved selections");
        assert.equal(await saved(page), before);
      }
    });
  }

  await scenario("switching semesters cancels pending legacy restoration", async (page) => {
    await page.goto(`${baseUrl}/share?sem=14&classes=NIE301:TG01`);
    await seed(page, state([group("NIE301")]));
    const release = await holdLegacyDestination(page);
    await page.locator('[data-rail-item="28"]').first().click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).semesterId === 28, key);
    const before = await saved(page);
    await release();
    assert.equal(await saved(page), before);
    assert.deepEqual((await read(page)).selectedClasses, []);
  });

}
finally { await browser.close(); }
