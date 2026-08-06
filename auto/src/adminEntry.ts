import dotenv from "dotenv";
import { startAdminServer } from "./admin/server";
import { createSeedingWorker } from "./activities/teleActivity";
import { disconnectAllClients } from "./telegram/clientPool";
import { closeQueue } from "./queue/scheduler";
import { closeRedisConnection } from "./queue/connection";
import { seedBcrTemplates } from "./bcr/bcrTemplateSeeder";

dotenv.config();

const port = parseInt(process.env.ADMIN_PORT ?? "3333", 10);

async function main(): Promise<void> {
  console.log("🚀 Khởi động Admin Panel + Worker...\n");

  const worker = createSeedingWorker();
  await startAdminServer(port);

  const seedResult = await seedBcrTemplates();
  if (seedResult.created > 0) {
    console.log(`📦 Đã tạo ${seedResult.created} kịch bản BCR (win/hòa/thua)`);
  }

  const shutdown = async () => {
    console.log("\n⏹ Đang tắt...");
    await worker.close();
    await disconnectAllClients();
    await closeQueue();
    await closeRedisConnection();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
