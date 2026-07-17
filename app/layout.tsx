import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { GlobalRegistrationReminders } from "@/components/registration/global-registration-reminders";
import { SettingsProvider } from "@/components/settings/settings-provider";
import { APP_SETTINGS_STORAGE_KEY } from "@/lib/settings/app-settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SUSS Planner",
  description: "Academic planning hub for SUSS timetables, courses, semester planners, and GPA estimates.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const settingsBootstrapScript = `
(() => {
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(APP_SETTINGS_STORAGE_KEY)});
    const settings = raw ? JSON.parse(raw) : {};
    const preference = settings.colorScheme === "dark" || settings.colorScheme === "light" ? settings.colorScheme : "system";
    const resolved = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.colorScheme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.colorScheme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" />
        <script dangerouslySetInnerHTML={{ __html: settingsBootstrapScript }} />
      </head>
      <body>
        <SettingsProvider>
          {children}
          <GlobalRegistrationReminders />
        </SettingsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
