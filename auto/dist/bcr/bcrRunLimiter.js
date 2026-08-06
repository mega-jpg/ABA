"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRunBcrEvent = shouldRunBcrEvent;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.resolve(process.env.DATA_DIR ?? "./data");
const FILE = path_1.default.join(DATA_DIR, "bcr-run-limit.json");
function todayKeyVN() {
    return new Date()
        .toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" })
        .slice(0, 10);
}
async function loadState() {
    const today = todayKeyVN();
    try {
        const raw = await promises_1.default.readFile(FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.date === today && parsed.groups) {
            return {
                date: today,
                groups: parsed.groups,
                updatedAt: parsed.updatedAt ?? new Date().toISOString(),
            };
        }
    }
    catch {
        // ignore
    }
    return {
        date: today,
        groups: {},
        updatedAt: new Date().toISOString(),
    };
}
async function saveState(state) {
    await promises_1.default.mkdir(DATA_DIR, { recursive: true });
    await promises_1.default.writeFile(FILE, JSON.stringify(state, null, 2));
}
function getCounter(state, key) {
    if (!state.groups[key]) {
        state.groups[key] = { runs: 0, skips: 0 };
    }
    return state.groups[key];
}
async function shouldRunBcrEvent(eventType, groupId) {
    const maxRaw = Number(process.env.BCR_MAX_RUNS_PER_DAY ?? 5);
    const maxPerDay = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 5;
    const probRaw = Number(process.env.BCR_RUN_PROBABILITY ?? 0.8);
    const probability = Number.isFinite(probRaw) && probRaw >= 0 && probRaw <= 1 ? probRaw : 0.8;
    // QA thường là test/manual, không bóp theo quota.
    if (eventType === "qa") {
        return { allow: true, runsToday: 0, maxPerDay };
    }
    // Mỗi nhóm có quota + xúc xắc riêng (key theo groupId).
    const key = groupId && groupId.trim() ? groupId.trim() : "__no_group__";
    const state = await loadState();
    const counter = getCounter(state, key);
    if (counter.runs >= maxPerDay) {
        counter.skips += 1;
        state.updatedAt = new Date().toISOString();
        await saveState(state);
        return {
            allow: false,
            reason: `đủ quota ngày nhóm ${key} (${counter.runs}/${maxPerDay})`,
            runsToday: counter.runs,
            maxPerDay,
        };
    }
    const passRandom = Math.random() < probability;
    if (!passRandom) {
        counter.skips += 1;
        state.updatedAt = new Date().toISOString();
        await saveState(state);
        return {
            allow: false,
            reason: `random skip (p=${probability})`,
            runsToday: counter.runs,
            maxPerDay,
        };
    }
    counter.runs += 1;
    state.updatedAt = new Date().toISOString();
    await saveState(state);
    return { allow: true, runsToday: counter.runs, maxPerDay };
}
