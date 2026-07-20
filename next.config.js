const { withBotId } = require("botid/next/config");

const envOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", ...envOrigins],
  outputFileTracingIncludes: {
    "/*": ["./data/snapshots/**/*.json"],
  },
};

module.exports = withBotId(nextConfig);
