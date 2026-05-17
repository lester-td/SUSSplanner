import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

function getAllowedOrigin(request?: NextRequest)
{
  const allowedOrigin = process.env.FRONTEND_PUBLIC_ORIGIN?.trim();
  const requestOrigin = request?.headers.get("origin");

  if (!allowedOrigin)
  {
    return requestOrigin ?? "*";
  }

  if (!requestOrigin)
  {
    return allowedOrigin;
  }

  return requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;
}

export function json(payload: unknown, status = 200, request?: NextRequest)
{
  return NextResponse.json(payload, {
    status,
    headers: {
      "Access-Control-Allow-Origin": getAllowedOrigin(request),
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export function errorResponse(status: number, error: string, details?: unknown, request?: NextRequest)
{
  return NextResponse.json(
    details ? { error, details } : { error },
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}

export function zodErrorResponse(error: ZodError, request?: NextRequest)
{
  return errorResponse(400, "Validation failed.", error.flatten(), request);
}

export function routeErrorResponse(error: unknown, request?: NextRequest)
{
  if (error instanceof ZodError)
  {
    return zodErrorResponse(error, request);
  }

  if (typeof error === "object" && error && "code" in error)
  {
    const code = String(error.code);
    if (code === "23505")
    {
      return errorResponse(409, "A record with the same unique key already exists.", undefined, request);
    }

    if (code === "23503")
    {
      return errorResponse(400, "A referenced record could not be found.", undefined, request);
    }
  }

  if (error instanceof Error)
  {
    return errorResponse(500, error.message, undefined, request);
  }

  return errorResponse(500, "Unexpected server error.", undefined, request);
}

export function optionsResponse(request?: NextRequest)
{
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getAllowedOrigin(request),
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
