import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body>{children}</body>
    </html>
  );
}
