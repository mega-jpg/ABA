"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeadClones = loadDeadClones;
exports.markCloneAsDead = markCloneAsDead;
exports.isCloneDead = isCloneDead;
exports.loadCloneAccounts = loadCloneAccounts;
exports.getCloneAccount = getCloneAccount;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const sessionLoader_1 = require("../telegram/sessionLoader");
const DEAD_CLONES_FILE = path_1.default.join(config_1.config.clonesDir, ".dead-clones.json");
let deadClones = new Set();
async function loadDeadClones() {
    try {
        const raw = await promises_1.default.readFile(DEAD_CLONES_FILE, "utf-8");
        const ids = JSON.parse(raw);
        deadClones = new Set(ids);
    }
    catch {
        deadClones = new Set();
    }
}
async function markCloneAsDead(cloneId) {
    deadClones.add(cloneId);
    await promises_1.default.mkdir(config_1.config.clonesDir, { recursive: true });
    await promises_1.default.writeFile(DEAD_CLONES_FILE, JSON.stringify([...deadClones], null, 2));
    console.warn(`[CloneStore] Nick ${cloneId} đã bị đánh dấu DEAD`);
}
function isCloneDead(cloneId) {
    return deadClones.has(cloneId);
}
async function loadCloneAccounts() {
    await loadDeadClones();
    const ids = await (0, sessionLoader_1.listCloneIds)(config_1.config.clonesDir);
    const accounts = [];
    for (const id of ids) {
        if (deadClones.has(id))
            continue;
        try {
            const resolved = await (0, sessionLoader_1.resolveCloneSession)(id, config_1.config.clonesDir);
            accounts.push({
                id,
                session: resolved.session,
                proxy: resolved.proxy,
                status: "active",
            });
        }
        catch (err) {
            console.warn(`[CloneStore] Bỏ qua ${id}:`, err.message);
        }
    }
    return accounts;
}
async function getCloneAccount(cloneId) {
    if (isCloneDead(cloneId))
        return null;
    try {
        const resolved = await (0, sessionLoader_1.resolveCloneSession)(cloneId, config_1.config.clonesDir);
        return {
            id: cloneId,
            session: resolved.session,
            proxy: resolved.proxy,
            status: "active",
        };
    }
    catch {
        return null;
    }
}
