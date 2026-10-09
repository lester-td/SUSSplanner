import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import postgres from "postgres";

// A private, consistent logical archive. Credentials are passed only in the child
// environment; neither connection strings nor role passwords enter artifacts.
nextEnv.loadEnvConfig(process.cwd());
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputIndex = process.argv.indexOf("--output");
if (process.argv.includes("--help")) {
  console.log("backup-database [--output DIR]\nCreates a full custom-format archive, password-free role definitions, public schema and verification manifest. Never changes the source database.");
  process.exit(0);
}
if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith("--"))) throw new Error("--output requires a directory");
const directory = path.resolve(outputIndex < 0 ? `scraper/data/db-backup/${stamp}` : process.argv[outputIndex + 1]);
const connection = process.env.DATABASE_BACKUP_URL || process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_BACKUP_URL or DATABASE_URL is required");
const uri = new URL(connection);
if (uri.hostname.includes("pooler.supabase.com") && uri.port === "6543") throw new Error("Use a direct or session-pooler connection for backups, not transaction port 6543");
const password = decodeURIComponent(uri.password);
const childEnv = { ...process.env, PGHOST: uri.hostname, PGPORT: uri.port || "5432", PGUSER: decodeURIComponent(uri.username), PGPASSWORD: password, PGDATABASE: decodeURIComponent(uri.pathname.slice(1)) || "postgres", PGSSLMODE: uri.searchParams.get("sslmode") || (uri.hostname.includes("supabase") ? "require" : "prefer") };
const redact = text => text.replaceAll(connection, "[database URL]").replaceAll(password || "\0", "[password]");
async function command(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${binary} failed (${code}): ${redact(stderr)}`)));
  });
}
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const client = postgres(connection, { prepare: false, max: 1, connect_timeout: 15 });
try {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const archive = path.join(directory, "database.dump");
  try { await stat(archive); throw new Error("Backup archive already exists; choose a new output directory"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const pgDumpVersion = (await command("pg_dump", ["--version"])).trim();
  const manifest = await client.begin("isolation level repeatable read read only", async sql => {
    const [snapshot] = await sql`SELECT pg_export_snapshot() AS id, current_setting('server_version') AS version, pg_database_size(current_database())::text AS bytes`;
    const tables = await sql`SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const counts = {};
    for (const table of tables) {
      const [count] = await sql.unsafe(`SELECT count(*)::text AS count FROM ${identifier(table.schemaname)}.${identifier(table.tablename)}`);
      counts[table.tablename] = Number(count.count);
    }
    console.log("Writing full database archive from a consistent snapshot...");
    await command("pg_dump", ["--format=custom", "--quote-all-identifiers", `--snapshot=${snapshot.id}`, `--file=${archive}`]);
    return { createdAt: new Date().toISOString(), sourceIdentitySha256: createHash("sha256").update(`${uri.hostname}:${uri.port || "5432"}${uri.pathname}`).digest("hex"), serverVersion: snapshot.version, databaseBytes: Number(snapshot.bytes), pgDumpVersion, publicTableCounts: counts };
  });
  const roles = path.join(directory, "roles.sql");
  await command("pg_dumpall", ["--roles-only", "--no-role-passwords", `--file=${roles}`]);
  const toc = await command("pg_restore", ["--list", archive]);
  if (!toc.includes("TABLE DATA")) throw new Error("Archive has no table data");
  const schema = path.join(directory, "public-schema-before.sql");
  await command("pg_restore", ["--schema-only", "--schema=public", "--no-owner", "--no-privileges", `--file=${schema}`, archive]);
  const bytes = await readFile(archive);
  await writeFile(path.join(directory, "archive-contents.txt"), toc, { mode: 0o600 });
  await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify({ ...manifest, archiveBytes: bytes.length, archiveSha256: createHash("sha256").update(bytes).digest("hex"), archiveReadable: true, restoreVerified: false, rolePasswordsIncluded: false }, null, 2)}\n`, { mode: 0o600 });
  for (const file of [archive, roles, schema]) await chmod(file, 0o600);
  console.log(`Backup created: ${directory}`);
  console.log(JSON.stringify({ archiveBytes: bytes.length, publicTableCounts: manifest.publicTableCounts, archiveReadable: true, restoreVerified: false }));
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally { await client.end({ timeout: 5 }); }
