"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const teleActivity_1 = require("./activities/teleActivity");
const scheduler_1 = require("./queue/scheduler");
const connection_1 = require("./queue/connection");
const clientPool_1 = require("./telegram/clientPool");
const scriptBuilder_1 = require("./services/scriptBuilder");
const seedingConfig_1 = require("./services/seedingConfig");
const workflowState_1 = require("./services/workflowState");
const config_1 = require("./config");
async function runWorker() {
    console.log("🚀 Khởi động Seeding Worker...");
    const worker = (0, teleActivity_1.createSeedingWorker)();
    const shutdown = async () => {
        console.log("\n⏹ Đang tắt worker...");
        await worker.close();
        await (0, clientPool_1.disconnectAllClients)();
        await (0, scheduler_1.closeQueue)();
        await (0, connection_1.closeRedisConnection)();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log(`✅ Worker đang lắng nghe queue "${config_1.config.queueName}"`);
}
async function pollWorkflow(workflowId) {
    return new Promise((resolve) => {
        const poll = setInterval(async () => {
            const state = await (0, workflowState_1.getWorkflowState)(workflowId);
            const stats = await (0, scheduler_1.getQueueStats)();
            if (state) {
                console.log(`[Dashboard] ${state.status} | ${state.completedSteps}/${state.totalSteps} steps | ` +
                    `Queue: ${stats.waiting} chờ, ${stats.active} đang chạy, ${stats.failed} lỗi`);
                if (state.status === "completed" || state.status === "failed") {
                    clearInterval(poll);
                    if (state.errors.length > 0) {
                        console.log("❌ Lỗi:", state.errors);
                    }
                    else {
                        console.log("✅ Workflow hoàn thành!");
                    }
                    resolve();
                }
            }
        }, 3000);
    });
}
async function runScheduler() {
    const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
    const script = await (0, scriptBuilder_1.createScriptFromConfigFile)();
    const workflowId = await (0, scheduler_1.scheduleSeedingScript)(script);
    console.log(`📋 Config mode : ${cfg.mode}`);
    console.log(`📋 Workflow    : ${script.name} (${workflowId})`);
    console.log(`📋 Group       : ${script.chatId}`);
    console.log(`📋 Steps       : ${script.steps.length}`);
    console.log("⏳ Chờ worker xử lý... (chạy `npm run worker` ở terminal khác nếu chưa chạy)");
    await pollWorkflow(workflowId);
    await (0, scheduler_1.closeQueue)();
    await (0, connection_1.closeRedisConnection)();
}
async function runOnce() {
    const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
    console.log(`🚀 Chạy seeding từ seeding.config.json (mode: ${cfg.mode})...\n`);
    const worker = (0, teleActivity_1.createSeedingWorker)();
    const script = await (0, scriptBuilder_1.createScriptFromConfigFile)();
    const workflowId = await (0, scheduler_1.scheduleSeedingScript)(script);
    console.log(`📋 Workflow: ${script.name}`);
    console.log(`📋 Group   : ${script.chatId}`);
    console.log(`📋 Steps   : ${script.steps.length}`);
    for (const [i, step] of script.steps.entries()) {
        console.log(`   ${i + 1}. [${step.cloneId}] ${step.action} (delay ${step.delayBefore}s)`);
    }
    console.log("");
    await pollWorkflow(workflowId);
    await worker.close();
    await (0, clientPool_1.disconnectAllClients)();
    await (0, scheduler_1.closeQueue)();
    await (0, connection_1.closeRedisConnection)();
    process.exit(0);
}
async function main() {
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
