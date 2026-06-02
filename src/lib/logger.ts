const levels = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof levels)[number];

const configuredLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
const currentLevel = levels.includes(configuredLevel) ? configuredLevel : "info";
const logJson = (process.env.LOG_FORMAT ?? "json").toLowerCase() === "json";

function shouldLog(level: LogLevel) {
  return levels.indexOf(level) <= levels.indexOf(currentLevel);
}

function format(level: LogLevel, message: unknown, details?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  if (logJson) {
    return JSON.stringify({ timestamp, level, message, details: details ?? null });
  }
  const payload = typeof message === "string" ? message : JSON.stringify(message, null, 2);
  return `[${timestamp}] [${level.toUpperCase()}] ${payload}${details ? ` ${JSON.stringify(details)}` : ""}`;
}

function write(level: LogLevel, message: unknown, details?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const output = format(level, message, details);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  error: (message: unknown, details?: Record<string, unknown>) => write("error", message, details),
  warn: (message: unknown, details?: Record<string, unknown>) => write("warn", message, details),
  info: (message: unknown, details?: Record<string, unknown>) => write("info", message, details),
  debug: (message: unknown, details?: Record<string, unknown>) => write("debug", message, details),
};
