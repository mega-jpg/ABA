import { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config";

let redisInstance: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    });
  }
  return redisInstance;
}

export function getBullMQConnection(): ConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
  };
}

export async function closeRedisConnection(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
