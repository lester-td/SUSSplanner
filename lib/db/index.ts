import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global
{
  var __sussplanner_sql_client__: ReturnType<typeof postgres> | undefined;
}

function getDatabaseUrl()
{
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
  {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return databaseUrl;
}

const sql = globalThis.__sussplanner_sql_client__ ?? postgres(getDatabaseUrl(), {
  prepare: false,
  max: process.env.NODE_ENV === "production" ? 3 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== "production")
{
  globalThis.__sussplanner_sql_client__ = sql;
}

export const db = drizzle(sql, { schema });

export type Database = typeof db;
