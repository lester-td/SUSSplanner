import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUSS Planner",
  description: "Academic planning hub for SUSS timetables, courses, study plans, and GPA estimates.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
  return (
    <html lang="en">
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body>{children}</body>
    </html>
  );
}
