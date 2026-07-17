import { checkBotId } from "botid/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const feedbackTypes = [
  "Bug",
  "Wrong course data",
  "Feature request",
  "Other",
] as const;

const feedbackRequestSchema = z.object({
  type: z.enum(feedbackTypes),
  message: z.string().trim().min(10).max(3000),
  contact: z.string().trim().max(320).optional(),
  pageUrl: z.string().trim().max(2048).optional(),
  website: z.string().trim().max(0).optional(),
}).strict();

type RateLimitEntry = { count: number; resetAt: number };
type RateLimitPolicy = {
  windowMs: number;
  maxAttempts: number;
  store: Map<string, RateLimitEntry>;
  error: string;
};

const rateLimitPolicies: RateLimitPolicy[] = [
  {
    windowMs: 10 * 60 * 1000,
    maxAttempts: 3,
    store: new Map<string, RateLimitEntry>(),
    error: "Please wait before sending more feedback.",
  },
  {
    windowMs: 24 * 60 * 60 * 1000,
    maxAttempts: 10,
    store: new Map<string, RateLimitEntry>(),
    error: "Daily feedback limit reached. Please try again tomorrow.",
  },
];

function getFeedbackRecipients()
{
  return (process.env.FEEDBACK_EMAIL_TO ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function getClientKey(request: NextRequest)
{
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

function checkRateLimit(clientKey: string)
{
  const now = Date.now();

  for (const policy of rateLimitPolicies)
  {
    const current = policy.store.get(clientKey);
    if (current && current.resetAt > now && current.count >= policy.maxAttempts)
    {
      return { limited: true, error: policy.error };
    }
  }

  for (const policy of rateLimitPolicies)
  {
    const current = policy.store.get(clientKey);
    if (!current || current.resetAt <= now)
    {
      policy.store.set(clientKey, {
        count: 1,
        resetAt: now + policy.windowMs,
      });
      continue;
    }

    current.count += 1;
  }

  return { limited: false, error: null };
}

function escapeHtml(value: string)
{
  return value.replace(/[&<>"']/g, (character) => {
    switch (character)
    {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function normalizeOptionalText(value: string | undefined)
{
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function buildEmailText({
  type,
  message,
  contact,
  pageUrl,
  userAgent,
  submittedAt,
}: {
  type: typeof feedbackTypes[number];
  message: string;
  contact: string | null;
  pageUrl: string | null;
  userAgent: string;
  submittedAt: string;
})
{
  return [
    "New SUSS Planner feedback",
    "",
    `Type: ${type}`,
    `Contact: ${contact ?? "Not provided"}`,
    `Page: ${pageUrl ?? "Not provided"}`,
    `Submitted: ${submittedAt}`,
    "",
    "Message:",
    message,
    "",
    "User agent:",
    userAgent || "Unavailable",
  ].join("\n");
}

function buildEmailHtml({
  type,
  message,
  contact,
  pageUrl,
  userAgent,
  submittedAt,
}: {
  type: typeof feedbackTypes[number];
  message: string;
  contact: string | null;
  pageUrl: string | null;
  userAgent: string;
  submittedAt: string;
})
{
  const rows = [
    ["Type", type],
    ["Contact", contact ?? "Not provided"],
    ["Page", pageUrl ?? "Not provided"],
    ["Submitted", submittedAt],
    ["User agent", userAgent || "Unavailable"],
  ];

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#17202a;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 16px">New SUSS Planner feedback</h1>
      <table style="border-collapse:collapse;margin-bottom:16px">
        <tbody>
          ${rows.map(([label, value]) => `
            <tr>
              <th style="padding:4px 16px 4px 0;text-align:left;vertical-align:top;color:#5f6f7c">${escapeHtml(label)}</th>
              <td style="padding:4px 0;vertical-align:top">${escapeHtml(value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="padding:14px 16px;border:1px solid #d8dee4;border-radius:8px;background:#f6f8fa;white-space:pre-wrap">${escapeHtml(message)}</div>
    </div>
  `;
}

async function sendFeedbackEmail({
  type,
  message,
  contact,
  pageUrl,
  userAgent,
}: {
  type: typeof feedbackTypes[number];
  message: string;
  contact: string | null;
  pageUrl: string | null;
  userAgent: string;
})
{
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_EMAIL_FROM;
  const to = getFeedbackRecipients();

  if (!apiKey || !from || to.length === 0)
  {
    throw new Error("Feedback email environment variables are not configured");
  }

  const submittedAt = new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date());
  const emailPayload: Record<string, unknown> = {
    from,
    to,
    subject: `SUSS Planner feedback: ${type}`,
    text: buildEmailText({ type, message, contact, pageUrl, userAgent, submittedAt }),
    html: buildEmailHtml({ type, message, contact, pageUrl, userAgent, submittedAt }),
  };

  if (contact)
  {
    emailPayload.reply_to = contact;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok)
  {
    const responseText = await response.text().catch(() => "");
    throw new Error(`Resend feedback email failed: ${response.status} ${responseText}`);
  }
}

export async function POST(request: NextRequest)
{
  const botVerification = await checkBotId({
    advancedOptions: {
      checkLevel: "basic",
    },
  });
  if (botVerification.isBot)
  {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const clientKey = getClientKey(request);
  const rateLimit = checkRateLimit(clientKey);
  if (rateLimit.limited)
  {
    return NextResponse.json({ error: rateLimit.error }, { status: 429 });
  }

  let body: unknown;
  try
  {
    body = await request.json();
  }
  catch
  {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedBody = feedbackRequestSchema.safeParse(body);
  if (!parsedBody.success)
  {
    return NextResponse.json({ error: "Please check the feedback form and try again." }, { status: 400 });
  }

  const contact = normalizeOptionalText(parsedBody.data.contact);
  if (contact)
  {
    const contactEmail = z.string().email().safeParse(contact);
    if (!contactEmail.success)
    {
      return NextResponse.json({ error: "Please enter a valid contact email or leave it blank." }, { status: 400 });
    }
  }

  try
  {
    await sendFeedbackEmail({
      type: parsedBody.data.type,
      message: parsedBody.data.message,
      contact,
      pageUrl: normalizeOptionalText(parsedBody.data.pageUrl),
      userAgent: request.headers.get("user-agent") ?? "",
    });
  }
  catch (error)
  {
    console.error(error);
    return NextResponse.json({ error: "Feedback could not be sent right now." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
