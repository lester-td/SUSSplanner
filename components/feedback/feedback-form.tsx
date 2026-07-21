"use client";

import { useEffect, useMemo, useState } from "react";

import { CheckIcon, ContinueIcon } from "@/components/planner/icons";

const feedbackTypes = [
  "Bug",
  "Wrong course data",
  "Feature request",
  "Other",
] as const;

type FeedbackType = typeof feedbackTypes[number];
type FormStatus = "idle" | "submitting" | "success" | "error";

function getErrorMessage(error: unknown)
{
  return error instanceof Error ? error.message : "Feedback could not be sent right now.";
}

export function FeedbackForm()
{
  const [type, setType] = useState<FeedbackType>("Bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const messageLength = message.trim().length;
  const canSubmit = useMemo(() => {
    return status !== "submitting" && messageLength >= 10 && messageLength <= 3000;
  }, [messageLength, status]);

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>)
  {
    event.preventDefault();
    if (!canSubmit)
    {
      return;
    }

    setStatus("submitting");
    setStatusMessage("");

    try
    {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          message,
          contact,
          pageUrl,
          website,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
      {
        throw new Error(typeof payload.error === "string" ? payload.error : "Feedback could not be sent right now.");
      }

      setStatus("success");
      setStatusMessage("Thanks. Your feedback has been sent.");
      setMessage("");
      setContact("");
      setWebsite("");
    }
    catch (error)
    {
      setStatus("error");
      setStatusMessage(getErrorMessage(error));
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label htmlFor="feedback-type" className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
          Feedback type
        </label>
        <select
          id="feedback-type"
          value={type}
          onChange={(event) => setType(event.target.value as FeedbackType)}
          className="min-h-11 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[15px] font-semibold leading-6 text-[var(--on-surface)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20"
        >
          {feedbackTypes.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="feedback-message" className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
            Message
          </label>
          <span className="text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">
            {messageLength}/3000
          </span>
        </div>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          minLength={10}
          maxLength={3000}
          rows={8}
          required
          placeholder="Tell us what happened, what you expected, or which course data looks off."
          className="min-h-44 resize-y rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[15px] leading-6 text-[var(--on-surface)] outline-none transition placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="feedback-contact" className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
          Contact email
        </label>
        <input
          id="feedback-contact"
          type="email"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          maxLength={320}
          placeholder="Optional, only if you want us to follow up"
          className="min-h-11 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[15px] leading-6 text-[var(--on-surface)] outline-none transition placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[color:var(--primary)]/20"
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="feedback-website">Website</label>
        <input
          id="feedback-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {statusMessage ? (
        <div
          className={`rounded-[0.5rem] border px-3 py-2 text-[14px] font-semibold leading-5 ${
            status === "success"
              ? "border-[color:var(--tertiary)] bg-[var(--tertiary-soft)] text-[var(--on-surface)]"
              : "border-[color:var(--error)] bg-[var(--error-container)] text-[var(--on-surface)]"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[0.5rem] bg-[var(--primary)] px-4 py-2 text-[14px] font-bold leading-5 text-[var(--on-primary)] transition hover:bg-[var(--primary-container)] hover:text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "success" ? <CheckIcon className="h-4 w-4" /> : <ContinueIcon className="h-4 w-4" />}
          {status === "submitting" ? "Sending..." : "Send feedback"}
        </button>
      </div>
    </form>
  );
}
