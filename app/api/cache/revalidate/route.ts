import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { CACHE_TAG_VALUES, isCacheTag } from "@/lib/cache-tags";

export const runtime = "nodejs";

type RevalidateRequestBody = {
  tags?: string[];
  paths?: string[];
};

function getProvidedSecret(request: NextRequest)
{
  return request.headers.get("x-revalidate-secret")
    ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    ?? "";
}

function normalizePaths(input: unknown)
{
  if (!Array.isArray(input))
  {
    return [] as string[];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTags(input: unknown)
{
  if (!Array.isArray(input))
  {
    return [...CACHE_TAG_VALUES];
  }

  const tags = input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(isCacheTag);

  return tags.length > 0 ? tags : [...CACHE_TAG_VALUES];
}

export async function POST(request: NextRequest)
{
  const expectedSecret = process.env.CACHE_REVALIDATE_SECRET;
  if (!expectedSecret)
  {
    return NextResponse.json(
      { error: "CACHE_REVALIDATE_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (getProvidedSecret(request) !== expectedSecret)
  {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} satisfies RevalidateRequestBody));
  const tags = normalizeTags((body as RevalidateRequestBody).tags);
  const paths = normalizePaths((body as RevalidateRequestBody).paths);

  for (const tag of tags)
  {
    revalidateTag(tag, "max");
  }

  for (const path of paths)
  {
    revalidatePath(path);
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    paths,
    now: Date.now(),
  });
}
