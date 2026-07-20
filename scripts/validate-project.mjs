#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();

const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "setup";
const runtimeEnv = mode === "build" || mode === "start" ? "production" : "development";

const filesToLoad = [
  ".env",
  `.env.${runtimeEnv}`,
  ".env.local",
  `.env.${runtimeEnv}.local`,
];

const collectedChecks = [];
const warnings = [];
const errors = [];

const envFromFiles = Object.assign({}, ...filesToLoad.map(loadEnvFile));
const resolvedEnv = {
  ...envFromFiles,
  ...process.env,
};

runChecks();
printReport();

if (errors.length > 0)
{
  process.exitCode = 1;
}

function runChecks()
{
  const packageJsonPath = path.join(projectRoot, "package.json");
  const envExamplePath = path.join(projectRoot, ".env.example");
  const hasPackageJson = fs.existsSync(packageJsonPath);
  const hasEnvExample = fs.existsSync(envExamplePath);

  addCheck(hasPackageJson, "Found package.json in the project root.", "package.json is missing from the project root.");
  addCheck(hasEnvExample, "Found .env.example for local setup guidance.", ".env.example is missing; local setup guidance will be incomplete.", "warning");

  checkNodeVersion();
  checkNpmVersion();
  checkInstalledDependencies();
  checkEnvironmentFiles();
  checkDatabaseUrl();
  checkSupabaseEnv();
  checkSnapshotArtifacts();
  checkFeedbackEmailEnv();
  checkAllowedDevOrigins();
}

function checkNodeVersion()
{
  const [majorString] = process.versions.node.split(".");
  const major = Number.parseInt(majorString ?? "0", 10);

  addCheck(
    Number.isFinite(major) && major >= 20,
    `Node.js ${process.versions.node} is supported.`,
    `Node.js ${process.versions.node} is too old. Use Node.js 20 or newer for this project.`
  );
}

function checkNpmVersion()
{
  const npmVersion = process.env.npm_config_user_agent?.match(/npm\/(\d+(?:\.\d+){0,2})/)?.[1];

  if (!npmVersion)
  {
    warnings.push("Could not detect the npm version from the current process. npm 10 or newer is recommended.");
    return;
  }

  const [majorString] = npmVersion.split(".");
  const major = Number.parseInt(majorString ?? "0", 10);
  addCheck(
    Number.isFinite(major) && major >= 10,
    `npm ${npmVersion} is supported.`,
    `npm ${npmVersion} is older than the recommended baseline. Use npm 10 or newer if setup issues appear.`,
    "warning"
  );
}

function checkInstalledDependencies()
{
  const packageJsonPath = path.join(projectRoot, "package.json");

  if (!fs.existsSync(packageJsonPath))
  {
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const declaredDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const missingDependencies = Object.keys(declaredDependencies).filter((dependencyName) => {
    const dependencyPath = path.join(projectRoot, "node_modules", ...dependencyName.split("/"), "package.json");
    return !fs.existsSync(dependencyPath);
  });

  addCheck(
    missingDependencies.length === 0,
    "Project dependencies are installed.",
    `Dependencies are missing: ${missingDependencies.join(", ")}. Run \`npm install\` before building or starting the app.`
  );
}

function checkEnvironmentFiles()
{
  const envCandidates = [
    ".env.local",
    `.env.${runtimeEnv}.local`,
    ".env",
    `.env.${runtimeEnv}`,
  ];

  const matchedFiles = envCandidates.filter((file) => fs.existsSync(path.join(projectRoot, file)));

  if (matchedFiles.length > 0)
  {
    collectedChecks.push(`Loaded environment values from ${matchedFiles.join(", ")} when present.`);
    return;
  }

  if (resolvedEnv.DATABASE_URL)
  {
    warnings.push("No local .env file was found, but DATABASE_URL is available from the shell environment.");
    return;
  }

  if (mode === "start")
  {
    collectedChecks.push("No local environment file is required to serve an existing data snapshot.");
    return;
  }

  errors.push("No environment file was found. Copy `.env.example` to `.env.local` and fill in the required values.");
}

function checkDatabaseUrl()
{
  const databaseUrl = resolvedEnv.DATABASE_URL?.trim();

  if (!databaseUrl)
  {
    if (mode === "start")
    {
      collectedChecks.push("DATABASE_URL is not required at runtime after snapshots have been generated.");
      return;
    }

    errors.push("DATABASE_URL is required to generate timetable and course snapshots.");
    return;
  }

  if (containsPlaceholder(databaseUrl))
  {
    errors.push("DATABASE_URL still contains placeholder values. Replace the example credentials with a real Postgres connection string.");
    return;
  }

  let parsedUrl;
  try
  {
    parsedUrl = new URL(databaseUrl);
  }
  catch
  {
    errors.push("DATABASE_URL is not a valid URL.");
    return;
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol))
  {
    errors.push("DATABASE_URL must use a `postgres://` or `postgresql://` connection string.");
    return;
  }

  if (!parsedUrl.hostname)
  {
    errors.push("DATABASE_URL is missing a database host.");
    return;
  }

  collectedChecks.push("DATABASE_URL is present and has a valid Postgres URL shape.");

  if (parsedUrl.hostname.endsWith(".pooler.supabase.com") && (parsedUrl.port || "5432") === "5432")
  {
    warnings.push(
      "DATABASE_URL uses the Supabase session pooler on port 5432. Use the transaction pooler on port 6543 for reliable snapshot generation from Vercel builds."
    );
  }
}

function checkSupabaseEnv()
{
  const supabaseUrl = resolvedEnv.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = resolvedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl && !anonKey)
  {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are unset. That is currently allowed, but keep them ready if browser-side Supabase features are added.");
    return;
  }

  if (supabaseUrl)
  {
    if (containsPlaceholder(supabaseUrl))
    {
      warnings.push("NEXT_PUBLIC_SUPABASE_URL still contains placeholder text.");
    }
    else
    {
      try
      {
        const parsedUrl = new URL(supabaseUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol))
        {
          warnings.push("NEXT_PUBLIC_SUPABASE_URL should use http:// or https://.");
        }
        else
        {
          collectedChecks.push("NEXT_PUBLIC_SUPABASE_URL is well-formed.");
        }
      }
      catch
      {
        warnings.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
      }
    }
  }

  if (anonKey && containsPlaceholder(anonKey))
  {
    warnings.push("NEXT_PUBLIC_SUPABASE_ANON_KEY still contains placeholder text.");
  }

  if ((supabaseUrl && !anonKey) || (!supabaseUrl && anonKey))
  {
    warnings.push("Only one Supabase public variable is set. Keep NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in sync if you plan to use them.");
  }
}

function checkSnapshotArtifacts()
{
  if (mode !== "start")
  {
    return;
  }

  const manifestPath = path.join(projectRoot, "data", "snapshots", "manifest.json");
  const courseIndexPath = path.join(projectRoot, "data", "snapshots", "course-index.json");
  addCheck(
    fs.existsSync(manifestPath) && fs.existsSync(courseIndexPath),
    "Generated data snapshot artifacts are present.",
    "Generated data snapshots are missing. Run `npm run data:build` before starting the production server."
  );
}

function checkFeedbackEmailEnv()
{
  const resendApiKey = resolvedEnv.RESEND_API_KEY?.trim();
  const from = resolvedEnv.FEEDBACK_EMAIL_FROM?.trim();
  const to = resolvedEnv.FEEDBACK_EMAIL_TO?.trim();
  const values = [resendApiKey, from, to];

  if (values.every((value) => !value))
  {
    warnings.push("Feedback email variables are unset. `/feedback` will render, but submissions need RESEND_API_KEY, FEEDBACK_EMAIL_FROM, and FEEDBACK_EMAIL_TO.");
    return;
  }

  if (values.some((value) => !value))
  {
    warnings.push("Only some feedback email variables are set. Configure RESEND_API_KEY, FEEDBACK_EMAIL_FROM, and FEEDBACK_EMAIL_TO together.");
    return;
  }

  if ((resendApiKey && containsPlaceholder(resendApiKey)) || (to && containsPlaceholder(to)))
  {
    warnings.push("Feedback email variables still contain placeholder text.");
    return;
  }

  const recipients = to
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0 || recipients.some((email) => !isLikelyEmail(email)))
  {
    warnings.push("FEEDBACK_EMAIL_TO should contain one email address, or comma-separated email addresses.");
    return;
  }

  if (!from.includes("@"))
  {
    warnings.push("FEEDBACK_EMAIL_FROM should be a sender address from your verified Resend domain.");
    return;
  }

  collectedChecks.push("Feedback email variables are configured.");
}

function checkAllowedDevOrigins()
{
  const rawOrigins = resolvedEnv.NEXT_ALLOWED_DEV_ORIGINS?.trim();

  if (!rawOrigins)
  {
    return;
  }

  const invalidOrigins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => !isValidAllowedOrigin(origin));

  if (invalidOrigins.length > 0)
  {
    warnings.push(`NEXT_ALLOWED_DEV_ORIGINS contains invalid entries: ${invalidOrigins.join(", ")}.`);
    return;
  }

  collectedChecks.push("NEXT_ALLOWED_DEV_ORIGINS entries look valid.");
}

function containsPlaceholder(value)
{
  return /<[^>]+>/.test(value);
}

function isLikelyEmail(value)
{
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidAllowedOrigin(origin)
{
  if (/^[a-z0-9.-]+$/i.test(origin)) return true;

  try
  {
    const parsedUrl = new URL(origin);
    return ["http:", "https:"].includes(parsedUrl.protocol) && Boolean(parsedUrl.hostname);
  }
  catch
  {
    return false;
  }
}

function loadEnvFile(filename)
{
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath))
  {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  return parseEnvContent(content);
}

function parseEnvContent(content)
{
  const entries = {};

  for (const rawLine of content.split(/\r?\n/u))
  {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    const value = withoutExport.slice(separatorIndex + 1).trim();

    if (!key) continue;
    entries[key] = stripWrappingQuotes(value);
  }

  return entries;
}

function stripWrappingQuotes(value)
{
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  )
  {
    return value.slice(1, -1);
  }

  return value;
}

function addCheck(ok, successMessage, failureMessage, severity = "error")
{
  if (ok)
  {
    collectedChecks.push(successMessage);
    return;
  }

  if (severity === "warning")
  {
    warnings.push(failureMessage);
    return;
  }

  errors.push(failureMessage);
}

function printReport()
{
  const labelByMode = {
    setup: "setup",
    dev: "development startup",
    build: "production build",
    start: "production startup",
  };

  const label = labelByMode[mode] ?? mode;

  console.log(`\nSUSS Planner validation for ${label}\n`);

  for (const message of collectedChecks)
  {
    console.log(`[ok] ${message}`);
  }

  for (const message of warnings)
  {
    console.warn(`[warn] ${message}`);
  }

  for (const message of errors)
  {
    console.error(`[error] ${message}`);
  }

  if (errors.length === 0)
  {
    console.log("\nValidation passed.");
    return;
  }

  console.error("\nValidation failed.");
}
