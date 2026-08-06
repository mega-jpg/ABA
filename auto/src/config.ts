import dotenv from "dotenv";
import path from "path";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

export const config = {
  telegram: {
    apiId: parseInt(requireEnv("TELEGRAM_API_ID"), 10),
    apiHash: requireEnv("TELEGRAM_API_HASH"),
  },
  redis: {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT ?? "6380", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultChatId: process.env.DEFAULT_CHAT_ID ?? "",
  clonesDir: path.resolve(process.env.CLONES_DIR ?? "./clones"),
  queueName: "seeding-queue",
};
