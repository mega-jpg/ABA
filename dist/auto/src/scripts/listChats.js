"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const clientPool_1 = require("../telegram/clientPool");
const seedingConfig_1 = require("../services/seedingConfig");
dotenv_1.default.config();
async function main() {
    const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
    const clones = (0, seedingConfig_1.getEnabledClones)(cfg);
    if (clones.length === 0) {
        console.error("❌ Không có clone enabled trong seeding.config.json");
        process.exit(1);
    }
    const cloneId = clones[0].id;
    console.log(`\n=== Groups trong config + clone ${cloneId} ===\n`);
    console.log("📋 Groups trong seeding.config.json:\n");
    for (const g of cfg.groups) {
        const flag = g.enabled ? "✅" : "⬜";
        console.log(`  ${flag} ${g.name}`);
        console.log(`     "id": "${g.id}"`);
    }
    console.log(`\n📋 Target hiện tại: ${cfg.target.groupId ?? `(pick: ${cfg.target.pickGroup})`}`);
    console.log(`📋 Mode: ${cfg.mode}\n`);
    const [client, err] = await (0, clientPool_1.getTelegramClient)(cloneId);
    if (err) {
        console.error(`❌ Không kết nối clone: ${err.message}`);
        process.exit(1);
    }
    console.log("📋 Groups clone đã join:\n");
    const dialogs = await client.getDialogs({ limit: 30 });
    for (const d of dialogs.filter((x) => x.isGroup || x.isChannel)) {
        const entity = d.entity;
        if (!entity)
            continue;
        const chatId = entity.className === "Channel" ? `-100${entity.id}` : `-${entity.id}`;
        console.log(`  📌 ${d.title}`);
        console.log(`     "id": "${chatId}"`);
    }
    await (0, clientPool_1.disconnectClient)(cloneId);
    console.log("");
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
