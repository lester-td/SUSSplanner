export function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return value ? "TRUE" : "FALSE";
}

export function sqlNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "NULL";
  return String(value);
}

export function sqlDate(value: string | null | undefined): string {
  if (!value) return "NULL";
  return `DATE ${sqlString(value)}`;
}

export function sqlTime(value: string | null | undefined): string {
  if (!value) return "NULL";
  return `TIME ${sqlString(value)}`;
}

export function sqlJson(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}
