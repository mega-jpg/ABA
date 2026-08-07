"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const sessionValidator_1 = require("../telegram/sessionValidator");
const sessionConvert_1 = require("../telegram/sessionConvert");
dotenv_1.default.config();
const MANIFEST_PATH = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
const DEAD_PATH = path_1.default.resolve(process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json");
const SESSIONS_DIR = path_1.default.resolve(process.env.SESSIONS_DIR ?? "./clones/sessions");
function parseConcurrency() {
    const idx = process.argv.indexOf("--concurrency");
    if (idx !== -1 && process.argv[idx + 1]) {
        return Math.max(1, parseInt(process.argv[idx + 1], 10));
    }
    return 3;
}
async function loadOrBuildManifest() {
    try {
        const raw = await promises_1.default.readFile(MANIFEST_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        console.log("📦 Chưa có manifest — build từ clones/sessions/ trước...");
        const parsed = await (0, sessionConvert_1.scanSessionFiles)(SESSIONS_DIR);
        if (parsed.length === 0) {
            throw new Error("Không có session nào trong clones/sessions/");
        }
        return {
            generatedAt: new Date().toISOString(),
            sessionsDir: path_1.default.relative(process.cwd(), SESSIONS_DIR),
            groups: [],
            sessions: parsed.map((p) => ({
                id: p.id,
                session: p.session,
                convertedFrom: p.format,
                sourceFile: path_1.default.relative(process.cwd(), p.sourceFile),
                dcId: p.dcId,
                server: p.server,
                enabled: true,
            })),
        };
    }
}
async function main() {
    const concurrency = parseConcurrency();
    const manifest = await loadOrBuildManifest();
    const total = manifest.sessions.length;
    console.log(`\n=== Lọc session chết ===`);
    console.log(`📋 Tổng session cần check: ${total}`);
    console.log(`⚙️  Concurrency: ${concurrency} (tránh FLOOD_WAIT)\n`);
    const checkItems = manifest.sessions.map((s) => ({
        id: s.id,
        session: s.session,
    }));
    let checked = 0;
    const alive = [];
    const dead = [];
    const batchSize = concurrency;
    const delayMs = 1500;
    for (let i = 0; i < checkItems.length; i += batchSize) {
        const batch = checkItems.slice(i, i + batchSize);
        const results = await (0, sessionValidator_1.validateSessionsBatch)(batch, { concurrency: batchSize, delayMs: 0 });
        for (const r of results) {
            checked++;
            const original = manifest.sessions.find((s) => s.id === r.id);
            if (r.alive) {
                alive.push({
                    ...original,
                    enabled: true,
                    userId: r.userId,
                    username: r.username,
                    firstName: r.firstName,
                });
                const name = r.firstName ?? r.username ?? r.userId ?? "";
                console.log(`✅ [${checked}/${total}] ${r.id} — sống ${name ? `(${name})` : ""}`);
            }
            else {
                dead.push({
                    id: r.id,
                    reason: r.reason ?? "UNKNOWN",
                    checkedAt: new Date().toISOString(),
                    sourceFile: original.sourceFile,
                });
                console.log(`💀 [${checked}/${total}] ${r.id} — CHẾT: ${r.reason}`);
            }
        }
        if (i + batchSize < checkItems.length) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    const filteredManifest = {
        ...manifest,
        generatedAt: new Date().toISOString(),
        sessions: alive,
    };
    const deadFile = {
        updatedAt: new Date().toISOString(),
        total: dead.length,
        sessions: dead,
    };
    await promises_1.default.mkdir(path_1.default.dirname(MANIFEST_PATH), { recursive: true });
    await promises_1.default.writeFile(MANIFEST_PATH, JSON.stringify(filteredManifest, null, 2));
    await promises_1.default.writeFile(DEAD_PATH, JSON.stringify(deadFile, null, 2));
    const deadIdsPath = path_1.default.resolve("./clones/.dead-clones.json");
    const existingDead = JSON.parse(await promises_1.default.readFile(deadIdsPath, "utf-8").catch(() => "[]"));
    const allDead = [...new Set([...existingDead, ...dead.map((d) => d.id)])];
    await promises_1.default.writeFile(deadIdsPath, JSON.stringify(allDead, null, 2));
    console.log(`\n=== Kết quả ===`);
    console.log(`✅ Sống : ${alive.length}`);
    console.log(`💀 Chết : ${dead.length}`);
    console.log(`📄 Manifest (chỉ nick sống): ${MANIFEST_PATH}`);
    console.log(`📄 Danh sách chết        : ${DEAD_PATH}`);
    console.log(`\n   Tiếp theo: npm run sync:manifest && npm run run:once\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
