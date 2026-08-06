"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Kiểm tra clone đã join các nhóm BCR (nhóm ảo bot chính) chưa.
 *
 * Usage: npm run check:groups
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const clientPool_1 = require("../telegram/clientPool");
const safeTele_1 = require("../telegram/safeTele");
const resourceService_1 = require("../admin/services/resourceService");
const normalize_config_1 = require("../../../config/normalize-config");
dotenv_1.default.config();
const ROOT_CONFIG = path_1.default.resolve(process.env.ROOT_CONFIG ?? "../config.json");
const SEEDING_CONFIG = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
async function loadAoGroupIds() {
    const ids = new Set();
    const out = [];
    try {
        const cfg = JSON.parse(await promises_1.default.readFile(ROOT_CONFIG, "utf-8"));
        for (const id of (0, normalize_config_1.getAoGroupIdsFromRaw)(cfg)) {
            if (id && !ids.has(id)) {
                ids.add(id);
                out.push({ id });
            }
        }
    }
    catch {
        /* ignore */
    }
    try {
        const seed = JSON.parse(await promises_1.default.readFile(SEEDING_CONFIG, "utf-8"));
        for (const g of seed.groups ?? []) {
            if (!g.enabled || !ids.has(g.id))
                continue;
            const existing = out.find((x) => x.id === g.id);
            if (existing) {
                existing.name = g.name ?? existing.name;
                existing.inviteLink = g.inviteLink ?? existing.inviteLink;
            }
        }
    }
    catch {
        /* ignore */
    }
    return out;
}
async function main() {
    const aoGroups = await loadAoGroupIds();
    const clones = await (0, resourceService_1.listClones)();
    if (aoGroups.length === 0) {
        console.error("❌ Không tìm thấy groups.ao.ids trong config");
        process.exit(1);
    }
    if (clones.length === 0) {
        console.error("❌ Không có clone sống");
        process.exit(1);
    }
    console.log("\n=== Kiểm tra clone trong nhóm ảo (BCR target) ===\n");
    for (const g of aoGroups) {
        console.log(`📌 ${g.name ?? g.id}`);
        console.log(`   id: ${g.id}`);
        console.log(`   inviteLink: ${g.inviteLink ?? "(chưa có — cần thêm vào seeding.config.json)"}`);
    }
    console.log("");
    let missingTotal = 0;
    for (const clone of clones) {
        const [client, err] = await (0, clientPool_1.getTelegramClient)(clone.id);
        if (err) {
            console.log(`❌ ${clone.label} (${clone.id}): lỗi kết nối — ${err.message}`);
            missingTotal += aoGroups.length;
            continue;
        }
        try {
            for (const g of aoGroups) {
                const member = await (0, safeTele_1.isInGroup)(client, g.id);
                if (member) {
                    console.log(`✅ ${clone.label} — đã trong ${g.name ?? g.id}`);
                }
                else {
                    console.log(`❌ ${clone.label} — CHƯA trong ${g.name ?? g.id}`);
                    missingTotal++;
                }
            }
        }
        finally {
            await (0, clientPool_1.disconnectClient)(clone.id);
        }
    }
    console.log("\n=== Kết luận ===");
    if (missingTotal === 0) {
        console.log("✅ Tất cả clone đã trong nhóm ảo — BCR có thể gửi tin.");
    }
    else {
        console.log(`⚠️  ${missingTotal} lượt thiếu membership.`);
        console.log("\nCách sửa:");
        console.log("1. Lấy invite link từ Telegram (Add members → Invite link)");
        console.log("2. Thêm inviteLink vào seeding.config.json cho từng nhóm ảo");
        console.log("3. Chạy: npm run join:group -- --all-enabled");
        console.log("4. pm2 restart auto-admin mogen-main");
    }
    console.log("");
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
