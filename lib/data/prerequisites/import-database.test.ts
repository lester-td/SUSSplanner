import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { curriculumPlans, curriculumPrerequisiteRules } from "@/lib/db/schema";
import { mapPlanRecord, mapRuleRecord } from "./database-records";
import { generateReviewSql } from "./import-review";
import { fixturePlan, fixtureRule } from "./fixtures";

// Only an explicitly supplied disposable database is ever mutated by tests.
const databaseUrl = process.env.PREREQUISITE_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("isolated transactional curriculum importer", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    sql = postgres(databaseUrl!, { prepare: false, max: 2, onnotice: () => {} });
    await apply(await readFile("scraper/schema.sql", "utf8"));
    await sql`TRUNCATE curriculum_prerequisite_rules, curriculum_plans`;
  });
  afterAll(async () => { await sql?.end({ timeout: 2 }); });
  async function stored()
  {
    const db = drizzle(sql);
    return { plans: (await db.select().from(curriculumPlans)).map(mapPlanRecord), rules: (await db.select().from(curriculumPrerequisiteRules)).map(mapRuleRecord) };
  }
  async function apply(text: string)
  {
    // A failed generated transaction is explicitly rolled back on this reserved
    // connection, matching psql ON_ERROR_STOP/disconnect behavior.
    const connection = await sql.reserve();
    try { await connection.unsafe(text); }
    catch (error) { await connection`ROLLBACK`; throw error; }
    finally { connection.release(); }
  }
  it("inserts reviewed records and preserves timestamps/approvals on re-import", async () => {
    const plan = fixturePlan(); const rule = fixtureRule(plan);
    await apply(generateReviewSql({ plans: [], rules: [] }, { plans: [plan], rules: [rule] }));
    const before = await stored(); await apply(generateReviewSql(before, before));
    expect(await stored()).toEqual(before);
  });
  it("blocks stale SQL after a newer correction with an unchanged input hash", async () => {
    const before = await stored(); const text = generateReviewSql(before, before);
    await sql`UPDATE curriculum_prerequisite_rules SET review_notes = 'new correction', reviewed_at = reviewed_at + interval '1 second'`;
    await expect(apply(text)).rejects.toThrow(/Stale curriculum SQL/);
    expect((await stored()).rules[0].reviewNotes).toBe("new correction");
  });
  it("guards expected absence for inserts and preserves decision state on deactivation", async () => {
    const before = await stored();
    await expect(apply(generateReviewSql({ plans: [], rules: [] }, before))).rejects.toThrow(/record set changed/);
    const next = { ...before, rules: [{ ...before.rules[0], recordStatus: "inactive" as const }] };
    await apply(generateReviewSql(before, next));
    const result = await stored();
    expect(result.rules[0].recordStatus).toBe("inactive"); expect(result.rules[0].approvedRuleHash).toBe(before.rules[0].approvedRuleHash);
    expect(result.rules[0].lastUpdated).not.toBe(before.rules[0].lastUpdated);
  });
  it("rolls back plan changes if a later rule constraint fails", async () => {
    const before = await stored();
    const next = { plans: [{ ...before.plans[0], sourcePath: "new-location.pdf" }], rules: [{ ...before.rules[0], courseCode: "INVALID-CODE" }] };
    await expect(apply(generateReviewSql(before, next))).rejects.toThrow();
    expect(await stored()).toEqual(before);
  });
  it("serializes concurrent importers using the transaction advisory lock", async () => {
    const connection = await sql.reserve();
    try
    {
      await connection`BEGIN`; await connection`SELECT pg_advisory_xact_lock(1937077072, 1)`;
      const [{ acquired }] = await sql`SELECT pg_try_advisory_xact_lock(1937077072, 1) AS acquired`;
      expect(acquired).toBe(false);
      await connection`ROLLBACK`;
    }
    finally { connection.release(); }
  });
});
