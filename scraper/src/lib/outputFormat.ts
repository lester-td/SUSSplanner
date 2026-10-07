import { optionalString } from "./args.js";

export type OutputFormat = "json" | "sql" | "both";

export function parseOutputFormat(
  args: Record<string, string | boolean>,
  defaultFormat: OutputFormat = "both"
): OutputFormat {
  const value = (optionalString(args, "format") ?? defaultFormat).toLowerCase();
  if (value === "json" || value === "sql" || value === "both") return value;
  throw new Error("--format must be 'json', 'sql', or 'both'.");
}

export function writesJson(format: OutputFormat): boolean {
  return format === "json" || format === "both";
}

export function writesSql(format: OutputFormat): boolean {
  return format === "sql" || format === "both";
}
