let client: any;

function getRedisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL environment variable. Redis is required for queue and websocket state management.");
  }
  return url;
}

export async function getRedisClient() {
  if (typeof window !== "undefined") {
    throw new Error("Redis client is server-only.");
  }

  if (client) {
    return client;
  }

  const { createClient } = await import("redis");
  client = createClient({
    url: getRedisUrl(),
    socket: {
      tls: process.env.REDIS_TLS === "true",
      rejectUnauthorized: false,
    },
  });

  client.on("error", (error: unknown) => {
    console.error("Redis error", error);
  });

  await client.connect();
  return client;
}
