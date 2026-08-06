/**
 * Kiểm tra nhanh môi trường trước khi chạy seeding
 * Usage: npm run test:setup
 */
import dotenv from "dotenv";
import { listCloneIds } from "../telegram/sessionLoader";
import { Redis } from 'ioredis'
dotenv.config();

async function checkEnv(): Promise<string[]> {
  const required = ["TELEGRAM_API_ID", "TELEGRAM_API_HASH", "DEFAULT_CHAT_ID"];
  const missing = required.filter((k) => !process.env[k]);
  return missing;
}

async function checkRedis(): Promise<boolean> {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT ?? "6380", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    const pong = await redis.ping();
    await redis.quit();
    return pong === "PONG";
  } catch {
    return false;
  }
}

async function checkClones(): Promise<string[]> {
  const clonesDir = process.env.CLONES_DIR ?? "./clones";
  return listCloneIds(clonesDir);
}

async function main(): Promise<void> {
  console.log("=== Kiểm tra môi trường Telegram Seeding ===\n");

  // 1. .env
  const missingEnv = await checkEnv();
  if (missingEnv.length === 0) {
    console.log("✅ .env: đủ biến bắt buộc");
  } else {
    console.log("❌ .env thiếu:", missingEnv.join(", "));
    console.log("   → cp .env.example .env rồi điền giá trị");
  }

  // 2. Redis
  const redisOk = await checkRedis();
  if (redisOk) {
    console.log("✅ Redis: kết nối OK");
  } else {
    console.log("❌ Redis: không kết nối được");
    console.log("   → brew install redis && brew services start redis");
    console.log("   → hoặc: docker run -d -p 6380:6380 redis:alpine");
  }

  // 3. Clones
  const clones = await checkClones();
  if (clones.length === 0) {
    console.log("❌ Clones: chưa có session hợp lệ trong clones/");
    console.log("   → npm run import:session clone_a \"1AgA...\"");
    console.log("   → hoặc copy clones/clone_a.session.example → clones/clone_a.session");
  } else {
    console.log(`✅ Clones: ${clones.length} nick có session`);
    for (const id of clones) {
      console.log(`   - ${id}  (test: npm run test:session ${id})`);
    }
  }

  console.log("\n=== Cách test end-to-end ===");
  console.log("Terminal 1: npm run worker");
  console.log("Terminal 2: npm run scheduler");
  console.log("→ Vào group Telegram xem tin nhắn xuất hiện\n");
}

main().catch(console.error);
