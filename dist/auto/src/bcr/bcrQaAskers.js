"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadQaAskerConfig = loadQaAskerConfig;
exports.assignQaPairs = assignQaPairs;
exports.summarizeQaAssignments = summarizeQaAssignments;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const resourceService_1 = require("../admin/services/resourceService");
const CONFIG_PATH = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
async function loadQaAskerConfig() {
    const alive = new Set((await (0, resourceService_1.listClones)()).map((c) => c.id));
    let askerIds = [];
    let maxQuestionsPerAsker = 2;
    try {
        const cfg = JSON.parse(await promises_1.default.readFile(CONFIG_PATH, "utf-8"));
        if (cfg.qaAskers?.cloneIds?.length) {
            askerIds = cfg.qaAskers.cloneIds;
            maxQuestionsPerAsker = cfg.qaAskers.maxQuestionsPerAsker ?? 2;
        }
    }
    catch {
    }
    if (askerIds.length === 0 && process.env.BCR_QA_ASKERS) {
        askerIds = process.env.BCR_QA_ASKERS.split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (askerIds.length === 0) {
        askerIds = [...alive].slice(0, 8);
    }
    askerIds = askerIds.filter((id) => alive.has(id));
    if (askerIds.length === 0) {
        throw new Error("Không có qaAskers hợp lệ — thêm qaAskers.cloneIds vào seeding.config.json");
    }
    maxQuestionsPerAsker = Math.min(2, Math.max(1, maxQuestionsPerAsker));
    return { askerIds, maxQuestionsPerAsker };
}
function assignQaPairs(askerIds, answererIds, pairs, maxPerAsker) {
    const state = new Map();
    for (const id of askerIds) {
        state.set(id, { count: 0, topics: new Set() });
    }
    const assignments = [];
    const responders = answererIds.length > 0 ? answererIds : askerIds;
    for (const pair of shuffle(pairs)) {
        const eligible = shuffle(askerIds).filter((id) => {
            const s = state.get(id);
            return s.count < maxPerAsker && !s.topics.has(pair.topic);
        });
        if (eligible.length === 0)
            continue;
        const askerId = eligible[0];
        const st = state.get(askerId);
        st.count++;
        st.topics.add(pair.topic);
        const answerPool = responders.filter((id) => id !== askerId);
        const answererId = answerPool.length > 0
            ? answerPool[assignments.length % answerPool.length]
            : askerId;
        assignments.push({ pair, askerId, answererId });
    }
    return assignments;
}
function summarizeQaAssignments(assignments) {
    const summary = new Map();
    for (const a of assignments) {
        const cur = summary.get(a.askerId) ?? { count: 0, topics: [] };
        cur.count++;
        if (!cur.topics.includes(a.pair.topic))
            cur.topics.push(a.pair.topic);
        summary.set(a.askerId, cur);
    }
    return summary;
}
