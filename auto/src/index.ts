import { createSeedingWorker } from "./activities/teleActivity";
import { scheduleSeedingScript, getQueueStats, closeQueue } from "./queue/scheduler";
import { closeRedisConnection } from "./queue/connection";
import { disconnectAllClients } from "./telegram/clientPool";
import { createScriptFromConfigFile } from "./services/scriptBuilder";
import { loadSeedingConfig } from "./services/seedingConfig";
import { getWorkflowState } from "./services/workflowState";
import { config } from "./config";

async function runWorker(): Promise<void> {
  console.log("🚀 Khởi động Seeding Worker...");
  const worker = createSeedingWorker();

  const shutdown = async () => {
    console.log("\n⏹ Đang tắt worker...");
    await worker.close();
    await disconnectAllClients();
    await closeQueue();
    await closeRedisConnection();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`✅ Worker đang lắng nghe queue "${config.queueName}"`);
}

async function pollWorkflow(workflowId: string): Promise<void> {
  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      const state = await getWorkflowState(workflowId);
      const stats = await getQueueStats();

      if (state) {
        console.log(
          `[Dashboard] ${state.status} | ${state.completedSteps}/${state.totalSteps} steps | ` +
            `Queue: ${stats.waiting} chờ, ${stats.active} đang chạy, ${stats.failed} lỗi`
        );

        if (state.status === "completed" || state.status === "failed") {
          clearInterval(poll);
          if (state.errors.length > 0) {
            console.log("❌ Lỗi:", state.errors);
          } else {
            console.log("✅ Workflow hoàn thành!");
          }
          resolve();
        }
      }
    }, 3000);
  });
}

async function runScheduler(): Promise<void> {
  const cfg = await loadSeedingConfig();
  const script = await createScriptFromConfigFile();
  const workflowId = await scheduleSeedingScript(script);

  console.log(`📋 Config mode : ${cfg.mode}`);
  console.log(`📋 Workflow    : ${script.name} (${workflowId})`);
  console.log(`📋 Group       : ${script.chatId}`);
  console.log(`📋 Steps       : ${script.steps.length}`);
  console.log("⏳ Chờ worker xử lý... (chạy `npm run worker` ở terminal khác nếu chưa chạy)");

  await pollWorkflow(workflowId);
  await closeQueue();
  await closeRedisConnection();
}

async function runOnce(): Promise<void> {
  const cfg = await loadSeedingConfig();
  console.log(`🚀 Chạy seeding từ seeding.config.json (mode: ${cfg.mode})...\n`);

  const worker = createSeedingWorker();
  const script = await createScriptFromConfigFile();
  const workflowId = await scheduleSeedingScript(script);

  console.log(`📋 Workflow: ${script.name}`);
  console.log(`📋 Group   : ${script.chatId}`);
  console.log(`📋 Steps   : ${script.steps.length}`);
  for (const [i, step] of script.steps.entries()) {
    console.log(`   ${i + 1}. [${step.cloneId}] ${step.action} (delay ${step.delayBefore}s)`);
  }
  console.log("");

  await pollWorkflow(workflowId);

  await worker.close();
  await disconnectAllClients();
  await closeQueue();
  await closeRedisConnection();
  process.exit(0);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "worker";

  switch (mode) {
    case "worker":
      await runWorker();
      break;
    case "scheduler":
      await runScheduler();
      process.exit(0);
      break;
    case "once":
      await runOnce();
      break;
    default:
      console.log("Usage:");
      console.log("  npm run worker     — lắng nghe queue");
      console.log("  npm run scheduler  — đẩy job từ seeding.config.json");
      console.log("  npm run run:once   — worker + scheduler (all-in-one)");
      console.log("  npm run config:preview — xem kịch bản sẽ chạy");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
