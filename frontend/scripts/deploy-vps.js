#!/usr/bin/env node
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const validatePath = path.join(__dirname, "validate-env.js");
execSync(`node ${validatePath}`, { stdio: "inherit" });
console.log("Building Docker containers for VPS deployment...");
execSync("docker compose build --pull", { stdio: "inherit" });
execSync("docker compose up -d", { stdio: "inherit" });
console.log("VPS deployment complete. Services are running in Docker Compose.");
