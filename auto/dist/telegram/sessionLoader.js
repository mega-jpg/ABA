"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCloneSession = resolveCloneSession;
exports.listCloneIds = listCloneIds;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const seedingConfig_1 = require("../services/seedingConfig");
const SQLITE_MAGIC = "SQLite format 3";
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function readMetaFile(metaPath) {
    try {
        return JSON.parse(await promises_1.default.readFile(metaPath, "utf-8"));
    }
    catch {
        return null;
    }
}
/** Đọc session GramJS từ file text .session */
async function readSessionFile(sessionPath) {
    const buf = await promises_1.default.readFile(sessionPath);
    const head = buf.subarray(0, 16).toString("utf-8");
    if (head.startsWith(SQLITE_MAGIC)) {
        throw new Error("File .session dạng Telethon (SQLite). GramJS cần StringSession — " +
            "export lại chuỗi session hoặc dùng clones/{id}.json với field \"session\"");
    }
    const content = buf.toString("utf-8").trim();
    if (!content) {
        throw new Error("File .session rỗng");
    }
    if (!content.startsWith("1")) {
        throw new Error("Session không hợp lệ — GramJS StringSession thường bắt đầu bằng '1'");
    }
    return content;
}
/**
 * Load session cho 1 clone theo thứ tự ưu tiên:
 * 1. clones/sessions.manifest.json
 * 2. seeding.config.json
 * 3. clones/{id}.session
 * 4. clones/{id}.json
 */
async function resolveCloneSession(cloneId, clonesDir) {
    // 1. Từ sessions.manifest.json
    try {
        const manifestPath = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
        if (await fileExists(manifestPath)) {
            const manifest = JSON.parse(await promises_1.default.readFile(manifestPath, "utf-8"));
            const entry = manifest.sessions?.find((s) => s.id === cloneId && s.enabled !== false);
            if (entry?.session) {
                return { session: entry.session.trim(), source: "sessions-manifest" };
            }
        }
    }
    catch {
        // fallback
    }
    // 2. Từ seeding.config.json
    try {
        const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
        const cloneCfg = cfg.clones.find((c) => c.id === cloneId);
        if (cloneCfg) {
            if (cloneCfg.session?.trim()) {
                return {
                    session: cloneCfg.session.trim(),
                    proxy: cloneCfg.proxy,
                    source: "seeding-config",
                };
            }
            const cfgSessionPath = (0, seedingConfig_1.resolveSessionFilePath)(cloneCfg);
            if (cfgSessionPath && (await fileExists(cfgSessionPath))) {
                const session = await readSessionFile(cfgSessionPath);
                return { session, proxy: cloneCfg.proxy, source: "seeding-config" };
            }
        }
    }
    catch {
        // seeding.config.json không có hoặc clone không trong config → fallback
    }
    const sessionPath = path_1.default.join(clonesDir, `${cloneId}.session`);
    const metaPath = path_1.default.join(clonesDir, `${cloneId}.json`);
    if (await fileExists(sessionPath)) {
        const session = await readSessionFile(sessionPath);
        const meta = await readMetaFile(metaPath);
        return { session, proxy: meta?.proxy, source: "session-file" };
    }
    const meta = await readMetaFile(metaPath);
    if (meta?.session?.trim()) {
        return {
            session: meta.session.trim(),
            proxy: meta.proxy,
            source: "json-meta",
        };
    }
    throw new Error(`Clone "${cloneId}" chưa có session. Thêm vào seeding.config.json hoặc clones/${cloneId}.session`);
}
/** Liệt kê cloneId từ manifest + seeding.config + thư mục clones/ */
async function listCloneIds(clonesDir) {
    const ids = new Set();
    try {
        const manifestPath = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
        if (await fileExists(manifestPath)) {
            const manifest = JSON.parse(await promises_1.default.readFile(manifestPath, "utf-8"));
            for (const s of manifest.sessions ?? []) {
                if (s.enabled !== false)
                    ids.add(s.id);
            }
        }
    }
    catch {
        // không có manifest
    }
    try {
        const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
        for (const c of (0, seedingConfig_1.getEnabledClones)(cfg)) {
            ids.add(c.id);
        }
    }
    catch {
        // không có config file
    }
    await promises_1.default.mkdir(clonesDir, { recursive: true });
    const entries = await promises_1.default.readdir(clonesDir);
    for (const entry of entries) {
        if (entry.startsWith("."))
            continue;
        const match = entry.match(/^(.+)\.(session|json)$/);
        if (match)
            ids.add(match[1]);
    }
    const valid = [];
    for (const id of ids) {
        try {
            await resolveCloneSession(id, clonesDir);
            valid.push(id);
        }
        catch {
            // bỏ qua
        }
    }
    return valid.sort();
}
