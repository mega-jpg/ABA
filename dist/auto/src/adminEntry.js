"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const server_1 = require("./admin/server");
const teleActivity_1 = require("./activities/teleActivity");
const clientPool_1 = require("./telegram/clientPool");
const scheduler_1 = require("./queue/scheduler");
const connection_1 = require("./queue/connection");
const bcrTemplateSeeder_1 = require("./bcr/bcrTemplateSeeder");
dotenv_1.default.config();
const port = parseInt(process.env.ADMIN_PORT ?? "3333", 10);
async function main() {
    console.log("🚀 Khởi động Admin Panel + Worker...\n");
    const worker = (0, teleActivity_1.createSeedingWorker)();
    await (0, server_1.startAdminServer)(port);
    const seedResult = await (0, bcrTemplateSeeder_1.seedBcrTemplates)();
    if (seedResult.created > 0) {
        console.log(`📦 Đã tạo ${seedResult.created} kịch bản BCR (win/hòa/thua)`);
    }
    const shutdown = async () => {
        console.log("\n⏹ Đang tắt...");
        await worker.close();
        await (0, clientPool_1.disconnectAllClients)();
        await (0, scheduler_1.closeQueue)();
        await (0, connection_1.closeRedisConnection)();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
