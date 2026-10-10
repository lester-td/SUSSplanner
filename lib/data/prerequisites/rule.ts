import { z } from "zod";
import { courseCodeSchema } from "@/lib/validation/timetable";
import type { PrerequisiteRuleNode } from "./types";

export const PREREQUISITE_LIMITS = { nodes: 64, depth: 8, children: 32, textBytes: 4096, payloadBytes: 262144 } as const;
export const compareCodeUnits = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const utf8Length = (value: string) => new TextEncoder().encode(value).length;
export function stableSerialize(value: unknown): string
{
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort(compareCodeUnits).map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  throw new Error("Cannot fingerprint non-JSON value");
}
export const prerequisiteTextSchema = z.string().min(1).refine(value => value.trim().length > 0 && utf8Length(value) <= PREREQUISITE_LIMITS.textBytes, "Empty or oversized prerequisite text");

// Bound untrusted data before Zod's recursive validation or serialization.
export function validateJsonBudget(value: unknown, parser = false)
{
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  let items = 0;
  while (stack.length)
  {
    const item = stack.pop()!;
    if (++items > 2048 || item.depth > PREREQUISITE_LIMITS.depth * 3) throw new Error("Prerequisite JSON exceeds traversal budget");
    if (typeof item.value === "string" && utf8Length(item.value) > PREREQUISITE_LIMITS.textBytes) throw new Error("Prerequisite text exceeds byte budget");
    if (typeof item.value === "number" && !Number.isSafeInteger(item.value)) throw new Error("Prerequisite JSON numbers must be bounded integers");
    if (item.value === null || ["string", "boolean", "number"].includes(typeof item.value)) continue;
    if (typeof item.value !== "object") throw new Error("Non-JSON prerequisite value");
    if (Array.isArray(item.value))
    {
      if (item.value.length > PREREQUISITE_LIMITS.children) throw new Error("Too many prerequisite children");
      stack.push(...item.value.map(value => ({ value, depth: item.depth + 1 })));
    }
    else
    {
      if (Object.getPrototypeOf(item.value) !== Object.prototype) throw new Error("Prerequisite JSON must use plain objects");
      if ("type" in item.value && ++nodes > PREREQUISITE_LIMITS.nodes) throw new Error("Too many prerequisite nodes");
      stack.push(...Object.values(item.value).map(value => ({ value, depth: item.depth + 1 })));
    }
  }
  if (!parser && nodes === 0) throw new Error("Missing prerequisite node");
}

// Remarks annotate the complete approved requirement. Nested annotations are
// rejected so flattening groups can never discard or change their scope.
const childRuleSchema: z.ZodType<PrerequisiteRuleNode> = z.lazy(() => z.discriminatedUnion("type", nodeSchemas(false)));
function nodeSchemas(root: boolean)
{
  const displayRemarks = root ? z.array(prerequisiteTextSchema).min(1).max(PREREQUISITE_LIMITS.children).optional() : z.never().optional();
  return [
    z.object({ type: z.literal("course"), courseCode: courseCodeSchema, displayRemarks }).strict(),
    z.object({ type: z.literal("condition"), text: prerequisiteTextSchema, displayRemarks }).strict(),
    z.object({ type: z.literal("all"), children: z.array(childRuleSchema).min(1).max(PREREQUISITE_LIMITS.children), displayRemarks }).strict(),
    z.object({ type: z.literal("any"), children: z.array(childRuleSchema).min(1).max(PREREQUISITE_LIMITS.children), displayRemarks }).strict(),
    z.object({ type: z.literal("nOf"), count: z.number().int().min(1), children: z.array(childRuleSchema).min(1).max(PREREQUISITE_LIMITS.children), displayRemarks }).strict()
      .refine(node => node.count <= node.children.length, "N-of count exceeds choices"),
  ] as const;
}
export const prerequisiteRuleSchema: z.ZodType<PrerequisiteRuleNode> = z.lazy(() => z.discriminatedUnion("type", nodeSchemas(true)));

export function courseLeaves(rule: PrerequisiteRuleNode): string[]
{
  if (rule.type === "course") return [rule.courseCode];
  if (rule.type === "condition") return [];
  return [...new Set(rule.children.flatMap(courseLeaves))].sort(compareCodeUnits);
}

export function canonicalizeRule(input: unknown): PrerequisiteRuleNode
{
  validateJsonBudget(input);
  const parsed = prerequisiteRuleSchema.parse(input);
  function visit(node: PrerequisiteRuleNode, depth: number): PrerequisiteRuleNode
  {
    if (depth > PREREQUISITE_LIMITS.depth) throw new Error("Prerequisite rule exceeds depth budget");
    if (node.type === "course") return { type: "course", courseCode: node.courseCode };
    if (node.type === "condition") return { type: "condition", text: node.text.trim() };
    let children = node.children.map(child => visit(child, depth + 1));
    if (node.type !== "nOf") children = children.flatMap(child => child.type === node.type ? child.children : [child]);
    children.sort((a, b) => compareCodeUnits(stableSerialize(a), stableSerialize(b)));
    const serializations = children.map(stableSerialize);
    if (new Set(serializations).size !== children.length) throw new Error("Duplicate canonical prerequisite choice");
    if (children.length > PREREQUISITE_LIMITS.children) throw new Error("Flattened prerequisite exceeds child budget");
    if (node.type === "nOf")
    {
      const seen = new Set<string>();
      for (const child of children) for (const code of courseLeaves(child))
      {
        if (seen.has(code)) throw new Error(`Overlapping N-of course choice: ${code}`);
        seen.add(code);
      }
      return { type: "nOf", count: node.count, children };
    }
    return children.length === 1 ? children[0] : { type: node.type, children };
  }
  const normalized = visit(parsed, 1);
  if (!parsed.displayRemarks) return normalized;
  const displayRemarks = parsed.displayRemarks.map(text => text.trim());
  if (new Set(displayRemarks).size !== displayRemarks.length) throw new Error("Duplicate prerequisite display remark");
  return { ...normalized, displayRemarks };
}
