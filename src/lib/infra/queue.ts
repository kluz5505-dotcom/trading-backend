import { getRedisClient } from "@/lib/infra/redis";

export async function enqueueJob(queueName: string, payload: Record<string, unknown>) {
  const redis = await getRedisClient();
  return redis.lPush(`queue:${queueName}`, JSON.stringify(payload));
}

export async function dequeueJob(queueName: string) {
  const redis = await getRedisClient();
  const payload = await redis.rPop(`queue:${queueName}`);
  return payload ? JSON.parse(payload as string) : null;
}

export async function queueLength(queueName: string) {
  const redis = await getRedisClient();
  return redis.lLen(`queue:${queueName}`);
}

export async function scheduleJob(queueName: string, payload: Record<string, unknown>, delaySeconds: number) {
  const redis = await getRedisClient();
  const score = Math.floor(Date.now() / 1000) + delaySeconds;
  return redis.zAdd(`queue:scheduled:${queueName}`, { score, value: JSON.stringify(payload) });
}

export async function fetchScheduledJobs(queueName: string, maxToFetch = 50) {
  const redis = await getRedisClient();
  const now = Math.floor(Date.now() / 1000);
  const jobs = await redis.zRangeByScore(`queue:scheduled:${queueName}`, 0, now, { LIMIT: { offset: 0, count: maxToFetch } });
  return jobs.map((job: string) => JSON.parse(job));
}
