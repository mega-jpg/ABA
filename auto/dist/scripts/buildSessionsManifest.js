"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Gia công toàn bộ file trong clones/sessions/*.session
 * → GramJS string → lưu clones/sessions.manifest.json
 *
 * Usage:
 *   npm run build:sessions
 *   npm run build:sessions -- --groups -1003709178070,-1003514385324
 */
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const sessionConvert_1 = require("../telegram/sessionConvert");
dotenv_1.default.config();
const SESSIONS_DIR = path_1.default.resolve(process.env.SESSIONS_DIR ?? "./clones/sessions");
const OUTPUT_PATH = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
const SEEDING_CONFIG_PATH = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
async function loadGroupsFromSeedingConfig() {
    try {
        const raw = await promises_1.default.readFile(SEEDING_CONFIG_PATH, "utf-8");
        const cfg = JSON.parse(raw);
        return (cfg.groups ?? []).map((g) => ({
            groupId: g.id,
            name: g.name,
            enabled: g.enabled !== false,
            inviteLink: g.inviteLink,
            username: g.username,
        }));
    }
    catch {
        return [];
    }
}
function parseGroupsArg() {
    const idx = process.argv.indexOf("--groups");
    if (idx === -1 || !process.argv[idx + 1])
        return null;
    return process.argv[idx + 1].split(",").map((s) => s.trim()).filter(Boolean);
}
async function resolveGroups() {
    const fromArg = parseGroupsArg();
    if (fromArg) {
        return fromArg.map((groupId) => ({
            groupId,
            enabled: true,
        }));
    }
    const fromConfig = await loadGroupsFromSeedingConfig();
    if (fromConfig.length > 0)
        return fromConfig;
    return [];
}
async function main() {
    await promises_1.default.mkdir(SESSIONS_DIR, { recursive: true });
    console.log(`\n=== Gia công sessions ===`);
    console.log(`📂 Input : ${SESSIONS_DIR}`);
    console.log(`📄 Output: ${OUTPUT_PATH}\n`);
    const parsed = await (0, sessionConvert_1.scanSessionFiles)(SESSIONS_DIR);
    if (parsed.length === 0) {
        console.log("❌ Không tìm thấy file .session nào trong clones/sessions/");
        console.log("   Đặt file Telethon/GramJS vào: clones/sessions/{id}.session");
        process.exit(1);
    }
    const groups = await resolveGroups();
    const sessions = parsed.map((p) => ({
        id: p.id,
        session: p.session,
        convertedFrom: p.format,
        sourceFile: path_1.default.relative(process.cwd(), p.sourceFile),
        dcId: p.dcId,
        server: p.server,
        enabled: true,
    }));
    const manifest = {
        generatedAt: new Date().toISOString(),
        sessionsDir: path_1.default.relative(process.cwd(), SESSIONS_DIR),
        groups,
        sessions,
    };
    await promises_1.default.mkdir(path_1.default.dirname(OUTPUT_PATH), { recursive: true });
    await promises_1.default.writeFile(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
    console.log(`✅ Đã xử lý ${sessions.length} session:\n`);
    for (const s of sessions) {
        console.log(`   • ${s.id} (${s.convertedFrom}) → ${s.session.slice(0, 24)}... [${s.session.length} chars]`);
    }
    console.log(`\n✅ Groups (${groups.length}):`);
    if (groups.length === 0) {
        console.log("   (chưa có — thêm --groups hoặc cấu hình seeding.config.json)");
    }
    else {
        for (const g of groups) {
            const flag = g.enabled ? "✅" : "⬜";
            console.log(`   ${flag} ${g.groupId}${g.name ? ` — ${g.name}` : ""}`);
        }
    }
    console.log(`\n📄 Manifest: ${OUTPUT_PATH}`);
    console.log(`   Chạy sync vào config: npm run sync:manifest\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
