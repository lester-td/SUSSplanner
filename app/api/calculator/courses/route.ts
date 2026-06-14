import { NextRequest, NextResponse } from "next/server";

import { searchCalculatorCourses } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const courses = await searchCalculatorCourses(query);

  return NextResponse.json({ courses });
}
