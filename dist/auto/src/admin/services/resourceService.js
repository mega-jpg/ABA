"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeadCloneIds = loadDeadCloneIds;
exports.listClones = listClones;
exports.listGroups = listGroups;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const DEAD_IDS_PATH = path_1.default.resolve("./clones/.dead-clones.json");
const DEAD_SESSIONS_PATH = path_1.default.resolve(process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json");
async function loadDeadCloneIds() {
    const ids = new Set();
    try {
        const raw = await promises_1.default.readFile(DEAD_IDS_PATH, "utf-8");
        for (const id of JSON.parse(raw)) {
            if (id)
                ids.add(id);
        }
    }
    catch {
    }
    try {
        const raw = await promises_1.default.readFile(DEAD_SESSIONS_PATH, "utf-8");
        const dead = JSON.parse(raw);
        for (const s of dead.sessions ?? []) {
            if (s.id)
                ids.add(s.id);
        }
    }
    catch {
    }
    return ids;
}
async function listClones() {
    const dead = await loadDeadCloneIds();
    const manifestPath = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
    try {
        const raw = await promises_1.default.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);
        return manifest.sessions
            .filter((s) => s.enabled && !dead.has(s.id))
            .map((s) => ({
            id: s.id,
            label: s.firstName ?? s.username ?? s.id,
            enabled: true,
        }));
    }
    catch {
        const cfgPath = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
        try {
            const cfg = JSON.parse(await promises_1.default.readFile(cfgPath, "utf-8"));
            return (cfg.clones ?? [])
                .filter((c) => c.enabled !== false && !dead.has(c.id))
                .map((c) => ({ id: c.id, label: c.label ?? c.id, enabled: true }));
        }
        catch {
            return [];
        }
    }
}
async function listGroups() {
    const cfgPath = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
    try {
        const cfg = JSON.parse(await promises_1.default.readFile(cfgPath, "utf-8"));
        return (cfg.groups ?? []).map((g) => ({
            id: g.id,
            name: g.name ?? g.id,
            enabled: g.enabled !== false,
            inviteLink: g.inviteLink,
        }));
    }
    catch {
        return [];
    }
}
