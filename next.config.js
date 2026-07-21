const { withBotId } = require("botid/next/config");

const envOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const snapshotManifest = "./data/snapshots/manifest.json";
const courseIndex = "./data/snapshots/course-index.json";
const courseSnapshots = "./data/snapshots/courses/*.json";
const scheduleSnapshots = "./data/snapshots/schedules/*.json";
const detailSnapshots = [courseIndex];
const metadataOnlyExcludes = [courseIndex, courseSnapshots, scheduleSnapshots];
const searchOnlyExcludes = [snapshotManifest, courseSnapshots, scheduleSnapshots];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...envOrigins],
  outputFileTracingExcludes: {
    "/api/calculator/courses": searchOnlyExcludes,
    "/api/courses/search": searchOnlyExcludes,
    "/api/classes": detailSnapshots,
    "/api/classes/counts": [courseSnapshots],
    "/api/courses/\\[courseCode\\]": detailSnapshots,
    "/api/export/ics": detailSnapshots,
    "/api/export/pdf": detailSnapshots,
    "/api/feedback": [snapshotManifest, courseIndex, courseSnapshots, scheduleSnapshots],
    "/calculators": metadataOnlyExcludes,
    "/courses/\\[courseCode\\]": detailSnapshots,
    "/feedback": metadataOnlyExcludes,
    "/planner": metadataOnlyExcludes,
    "/settings": metadataOnlyExcludes,
    "/share": detailSnapshots,
    "/timetable": metadataOnlyExcludes,
  },
};

module.exports = withBotId(nextConfig);
