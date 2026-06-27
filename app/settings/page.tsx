import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { SettingsClient } from "@/components/settings/settings-client";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Settings | SUSS Planner",
  description: "Manage local SUSS Planner preferences for appearance, timetable defaults, and reminders.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SettingsPage()
{
  const semesterTree = await getSemestersWithWeeks();
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="settings" currentSemesterContext={currentSemesterContext}>
      <SettingsClient />
    </AppShell>
  );
}
