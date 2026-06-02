#!/usr/bin/env node
import "dotenv/config";

const required = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

function validateUrl(key) {
  try {
    new URL(process.env[key]);
  } catch {
    console.error(`Invalid URL for ${key}: ${process.env[key]}`);
    process.exit(1);
  }
}

validateUrl("SUPABASE_URL");
validateUrl("VITE_SUPABASE_URL");

if (process.env.REDIS_URL) {
  try {
    new URL(process.env.REDIS_URL);
  } catch {
    console.error(`Invalid REDIS_URL: ${process.env.REDIS_URL}`);
    process.exit(1);
  }
}

if (process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.warn("CLOUDFLARE_API_TOKEN is set but CLOUDFLARE_ACCOUNT_ID is missing.");
}

console.log("Environment validation passed.");
