import type { RegistrationEvent } from "@/lib/registration/types";

const SOURCE_LABEL = "User-provided SUSS registration schedule";
const SOURCE_UPDATED_AT = "2026-07-01";

export const REGISTRATION_EVENTS: RegistrationEvent[] = [
  {
    id: "ecr-2026-03",
    title: "eCR Period",
    eventType: "ecr",
    startsAt: "2026-03-17T00:00:00+08:00",
    endsAt: "2026-03-24T23:59:59+08:00",
    scheduleVersion: "ecr-2026-03-v1",
    sourceLabel: SOURCE_LABEL,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
  },
  {
    id: "ecr-2026-10",
    title: "eCR Period",
    eventType: "ecr",
    startsAt: "2026-10-12T00:00:00+08:00",
    endsAt: "2026-10-23T23:59:59+08:00",
    scheduleVersion: "ecr-2026-10-v1",
    sourceLabel: SOURCE_LABEL,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
  },
  {
    id: "add-drop-2026-07",
    title: "Add-Drop Period",
    eventType: "add-drop",
    startsAt: "2026-07-17T00:00:00+08:00",
    endsAt: "2026-07-28T23:59:59+08:00",
    scheduleVersion: "add-drop-2026-07-v1",
    sourceLabel: SOURCE_LABEL,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
  },
  {
    id: "add-drop-2026-12",
    title: "Add-Drop Period",
    eventType: "add-drop",
    startsAt: "2026-12-18T00:00:00+08:00",
    endsAt: "2026-12-29T23:59:59+08:00",
    scheduleVersion: "add-drop-2026-12-v1",
    sourceLabel: SOURCE_LABEL,
    sourceUpdatedAt: SOURCE_UPDATED_AT,
  },
];
