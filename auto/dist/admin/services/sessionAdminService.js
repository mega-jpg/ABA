"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionStats = getSessionStats;
exports.importSessionFiles = importSessionFiles;
exports.buildSessionsManifest = buildSessionsManifest;
exports.filterDeadSessions = filterDeadSessions;
exports.syncManifestToConfig = syncManifestToConfig;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sessionConvert_1 = require("../../telegram/sessionConvert");
const sessionValidator_1 = require("../../telegram/sessionValidator");
const SESSIONS_DIR = path_1.default.resolve(process.env.SESSIONS_DIR ?? "./clones/sessions");
const MANIFEST_PATH = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
const DEAD_PATH = path_1.default.resolve(process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json");
const DEAD_IDS_PATH = path_1.default.resolve("./clones/.dead-clones.json");
const SEEDING_CONFIG_PATH = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
function normalizeSessionFilename(name) {
    const base = path_1.default.basename(name).replace(/[^\w+.-]/g, "_");
    const lower = base.toLowerCase();
    if (lower.endsWith(".session"))
        return base;
    if (lower.endsWith(".tho"))
        return base.slice(0, -4) + ".session";
    return base + ".session";
}
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
async function loadManifest() {
    try {
        const raw = await promises_1.default.readFile(MANIFEST_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function loadDeadFile() {
    try {
        const raw = await promises_1.default.readFile(DEAD_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return { updatedAt: "", total: 0, sessions: [] };
    }
}
async function getSessionStats() {
    await promises_1.default.mkdir(SESSIONS_DIR, { recursive: true });
    const dirEntries = await promises_1.default.readdir(SESSIONS_DIR);
    const sessionFiles = dirEntries.filter((e) => (e.endsWith(".session") || e.endsWith(".tho")) && !e.startsWith("."));
    const manifest = await loadManifest();
    const inManifest = new Set((manifest?.sessions ?? []).map((s) => path_1.default.basename(s.sourceFile)));
    const pendingFiles = sessionFiles.filter((f) => !inManifest.has(f));
    const dead = await loadDeadFile();
    return {
        sessionsDir: path_1.default.relative(process.cwd(), SESSIONS_DIR),
        pendingFiles,
        manifest: {
            exists: manifest !== null,
            generatedAt: manifest?.generatedAt,
            total: manifest?.sessions.length ?? 0,
            sessions: manifest?.sessions ?? [],
        },
        dead: {
            total: dead.total,
            sessions: dead.sessions,
        },
    };
}
async function importSessionFiles(files) {
    await promises_1.default.mkdir(SESSIONS_DIR, { recursive: true });
    const saved = [];
    const errors = [];
    for (const file of files) {
        const filename = normalizeSessionFilename(file.name);
        const dest = path_1.default.join(SESSIONS_DIR, filename);
        try {
            const buf = Buffer.from(file.content, "base64");
            if (buf.length === 0) {
                errors.push(`${file.name}: file rỗng`);
                continue;
            }
            await promises_1.default.writeFile(dest, buf);
            // validate có parse được không
            await (0, sessionConvert_1.parseSessionFile)(dest);
            saved.push(filename);
        }
        catch (err) {
            errors.push(`${file.name}: ${err.message}`);
            try {
                await promises_1.default.unlink(dest);
            }
            catch {
                /* ignore */
            }
        }
    }
    return { saved, errors };
}
async function buildSessionsManifest(onProgress) {
    await promises_1.default.mkdir(SESSIONS_DIR, { recursive: true });
    onProgress?.({ phase: "Quét file session", current: 0, total: 0 });
    const parsed = await (0, sessionConvert_1.scanSessionFiles)(SESSIONS_DIR, (info) => {
        onProgress?.({
            phase: "Convert GramJS",
            current: info.current,
            total: info.total,
            detail: info.file,
        });
    });
    if (parsed.length === 0) {
        throw new Error("Không có file .session/.tho trong clones/sessions/ — import trước");
    }
    const existing = await loadManifest();
    const groups = existing?.groups?.length ? existing.groups : await loadGroupsFromSeedingConfig();
    const sessions = parsed.map((p) => {
        const prev = existing?.sessions.find((s) => s.id === p.id);
        return {
            id: p.id,
            session: p.session,
            convertedFrom: p.format,
            sourceFile: path_1.default.relative(process.cwd(), p.sourceFile),
            dcId: p.dcId,
            server: p.server,
            enabled: prev?.enabled ?? true,
            userId: prev?.userId,
            username: prev?.username,
            firstName: prev?.firstName,
        };
    });
    const manifest = {
        generatedAt: new Date().toISOString(),
        sessionsDir: path_1.default.relative(process.cwd(), SESSIONS_DIR),
        groups,
        sessions,
    };
    onProgress?.({
        phase: "Ghi manifest",
        current: sessions.length,
        total: sessions.length,
        detail: path_1.default.basename(MANIFEST_PATH),
    });
    await promises_1.default.mkdir(path_1.default.dirname(MANIFEST_PATH), { recursive: true });
    await promises_1.default.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    return {
        count: sessions.length,
        sessions: parsed.map((p) => ({
            id: p.id,
            format: p.format,
            preview: p.session.slice(0, 28) + "...",
        })),
        manifestPath: path_1.default.relative(process.cwd(), MANIFEST_PATH),
    };
}
async function filterDeadSessions(options) {
    const concurrency = options?.concurrency ?? 3;
    const onProgress = options?.onProgress;
    let manifest = await loadManifest();
    if (!manifest || manifest.sessions.length === 0) {
        onProgress?.({ phase: "Gia công manifest trước khi lọc", current: 0, total: 0 });
        const parsed = await (0, sessionConvert_1.scanSessionFiles)(SESSIONS_DIR);
        if (parsed.length === 0) {
            throw new Error("Chưa có session — import và gia công trước");
        }
        await buildSessionsManifest(onProgress);
        manifest = await loadManifest();
        if (!manifest)
            throw new Error("Không tạo được manifest");
    }
    const checkItems = manifest.sessions.map((s) => ({
        id: s.id,
        session: s.session,
    }));
    const alive = [];
    const dead = [];
    const delayMs = 1500;
    const total = checkItems.length;
    let checked = 0;
    onProgress?.({
        phase: "Kiểm tra Telegram API",
        current: 0,
        total,
        alive: 0,
        dead: 0,
    });
    for (let i = 0; i < checkItems.length; i += concurrency) {
        const batch = checkItems.slice(i, i + concurrency);
        onProgress?.({
            phase: "Kiểm tra Telegram API",
            current: checked,
            total,
            detail: batch.map((b) => b.id).join(", "),
            alive: alive.length,
            dead: dead.length,
        });
        const results = await (0, sessionValidator_1.validateSessionsBatch)(batch, {
            concurrency,
            delayMs: 0,
        });
        for (const r of results) {
            const original = manifest.sessions.find((s) => s.id === r.id);
            if (r.alive) {
                alive.push({
                    ...original,
                    enabled: true,
                    userId: r.userId,
                    username: r.username,
                    firstName: r.firstName,
                });
            }
            else {
                dead.push({
                    id: r.id,
                    reason: r.reason ?? "UNKNOWN",
                    checkedAt: new Date().toISOString(),
                    sourceFile: original.sourceFile,
                });
            }
        }
        checked += batch.length;
        onProgress?.({
            phase: "Kiểm tra Telegram API",
            current: checked,
            total,
            alive: alive.length,
            dead: dead.length,
        });
        if (i + concurrency < checkItems.length) {
            await new Promise((res) => setTimeout(res, delayMs));
        }
    }
    onProgress?.({
        phase: "Lưu kết quả",
        current: total,
        total,
        alive: alive.length,
        dead: dead.length,
    });
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
    await promises_1.default.writeFile(MANIFEST_PATH, JSON.stringify(filteredManifest, null, 2));
    const prevDead = await loadDeadFile();
    const mergedDead = [
        ...prevDead.sessions.filter((d) => !dead.some((n) => n.id === d.id)),
        ...dead,
    ];
    deadFile.sessions = mergedDead;
    deadFile.total = mergedDead.length;
    await promises_1.default.writeFile(DEAD_PATH, JSON.stringify(deadFile, null, 2));
    const existingDead = JSON.parse(await promises_1.default.readFile(DEAD_IDS_PATH, "utf-8").catch(() => "[]"));
    const allDead = [...new Set([...existingDead, ...dead.map((d) => d.id)])];
    await promises_1.default.writeFile(DEAD_IDS_PATH, JSON.stringify(allDead, null, 2));
    return {
        alive: alive.length,
        dead: dead.length,
        deadList: dead,
        aliveList: alive.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            username: s.username,
        })),
    };
}
async function syncManifestToConfig() {
    const manifest = await loadManifest();
    if (!manifest)
        throw new Error("Chưa có manifest — gia công trước");
    let config = {};
    try {
        config = JSON.parse(await promises_1.default.readFile(SEEDING_CONFIG_PATH, "utf-8"));
    }
    catch {
        config = {
            mode: "preset",
            interaction: { preset: { name: "", steps: [] }, random: {} },
        };
    }
    config.clones = manifest.sessions
        .filter((s) => s.enabled)
        .map((s) => ({
        id: s.id,
        enabled: true,
        session: s.session,
        label: s.firstName ?? s.username ?? s.id,
    }));
    config.groups = manifest.groups.map((g) => ({
        id: g.groupId,
        name: g.name ?? g.groupId,
        enabled: g.enabled,
        inviteLink: g.inviteLink,
    }));
    const enabledGroups = manifest.groups.filter((g) => g.enabled);
    if (enabledGroups.length > 0) {
        config.target = {
            groupId: enabledGroups[0].groupId,
            pickGroup: "first",
        };
    }
    await promises_1.default.writeFile(SEEDING_CONFIG_PATH, JSON.stringify(config, null, 2));
    return {
        clones: manifest.sessions.length,
        groups: manifest.groups.length,
    };
}
