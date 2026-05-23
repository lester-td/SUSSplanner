import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUSS Planner",
  description: "Timetable planner for SUSS students.",
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
