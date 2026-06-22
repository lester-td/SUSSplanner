import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = {
  title: "Settings | SUSS Planner",
  description: "Standalone settings page draft for SUSS Planner preferences.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsPage()
{
  return (
    <AppShell
      activeSection={null}
      currentWeekLabel="Standalone settings"
      showNav={false}
      showFooter={false}
    >
      <SettingsClient />
    </AppShell>
  );
}
