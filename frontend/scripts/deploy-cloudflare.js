#!/usr/bin/env node
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const validatePath = path.join(__dirname, "validate-env.js");
execSync(`node ${validatePath}`, { stdio: "inherit" });
console.log("Publishing to Cloudflare Workers...");
execSync("npx wrangler publish", { stdio: "inherit" });
console.log("Cloudflare deployment complete.");
