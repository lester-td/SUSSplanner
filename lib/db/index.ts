import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
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

const sql =
  globalThis.__sussplanner_sql_client__ ??
  postgres(getDatabaseUrl(), {
    prepare: false,
  });

if (process.env.NODE_ENV !== "production")
{
  globalThis.__sussplanner_sql_client__ = sql;
}

export const db = drizzle(sql, { schema });

export type Database = typeof db;
