import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CACHE_TAG_VALUES, isCacheTag } from "@/lib/cache-tags";

export const runtime = "nodejs";

const revalidateRequestSchema = z.object({
  tags: z.array(z.string().trim().refine(isCacheTag)).min(1).optional(),
  paths: z.array(z.string().trim().min(1)).optional(),
}).strict();

function getProvidedSecret(request: NextRequest)
{
  return request.headers.get("x-revalidate-secret")
    ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    ?? "";
}

function normalizeTags(input: string[] | undefined)
{
  if (!input)
  {
    return [...CACHE_TAG_VALUES];
  }

  return [...new Set(input)];
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

  let body: unknown;
  try
  {
    body = await request.json();
  }
  catch
  {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = revalidateRequestSchema.safeParse(body);
  if (!parsedBody.success)
  {
    return NextResponse.json({ error: "Invalid revalidation payload" }, { status: 400 });
  }

  const tags = normalizeTags(parsedBody.data.tags);
  const paths = parsedBody.data.paths ?? [];

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
