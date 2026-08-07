"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedBcrTemplates = seedBcrTemplates;
exports.seedBcrQaTemplates = seedBcrQaTemplates;
const scenarioStore_1 = require("../admin/services/scenarioStore");
const resourceService_1 = require("../admin/services/resourceService");
const bcrMessages_1 = require("./bcrMessages");
const bcrScenarioDeck_1 = require("./bcrScenarioDeck");
const bcrQaMessages_1 = require("./bcrQaMessages");
const bcrQaAskers_1 = require("./bcrQaAskers");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const EVENT_TYPES = ["win", "draw", "lose"];
const PER_TYPE = 100;
async function getDefaultGroupId() {
    try {
        const cfg = JSON.parse(await promises_1.default.readFile(path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json"), "utf-8"));
        return cfg.target?.groupId ?? process.env.DEFAULT_CHAT_ID ?? "-5290958067";
    }
    catch {
        return process.env.DEFAULT_CHAT_ID ?? "-5290958067";
    }
}
function buildScenarioInput(eventType, index, texts, groupId, cloneIds) {
    const label = bcrMessages_1.BCR_EVENT_LABELS[eventType];
    const num = String(index + 1).padStart(3, "0");
    const steps = texts.map((text, i) => ({
        cloneId: cloneIds[(index + i) % cloneIds.length],
        action: "send_message",
        text,
        delayBeforeSec: i === 0 ? 3 + (index % 5) : 6 + i * 2 + (index % 7),
    }));
    if (eventType === "win" && index % 3 === 0 && steps.length > 1) {
        steps.push({
            cloneId: cloneIds[(index + 1) % cloneIds.length],
            action: "react",
            reaction: ["🔥", "👍", "💰", "🎉"][index % 4],
            delayBeforeSec: 8 + (index % 12),
        });
    }
    if ((eventType === "draw" || eventType === "lose") && index % 4 === 0) {
        steps.push({
            cloneId: cloneIds[(index + 2) % cloneIds.length],
            action: "send_message",
            text: (0, bcrMessages_1.getBcrFollowUp)(eventType, index),
            delayBeforeSec: 12 + (index % 15),
        });
    }
    return {
        name: `BCR ${label} #${num}`,
        groupId,
        source: "bcr",
        eventType,
        steps,
    };
}
function buildQaScenarioInput(index, assignment, groupId) {
    const { pair, askerId, answererId } = assignment;
    const num = String(index + 1).padStart(3, "0");
    const topicLabel = pair.topic === "group" ? "Nhóm" : "Sảnh";
    return {
        name: `BCR Hỏi đáp ${topicLabel} #${num}`,
        groupId,
        source: "bcr",
        eventType: "qa",
        steps: [
            {
                cloneId: askerId,
                action: "send_message",
                text: pair.question,
                delayBeforeSec: 4 + (index % 10),
            },
            {
                cloneId: answererId,
                action: "send_message",
                text: pair.answer,
                delayBeforeSec: 18 + (index % 25),
            },
        ],
    };
}
async function seedQaScenarios(groupId, allCloneIds) {
    const { askerIds, maxQuestionsPerAsker } = await (0, bcrQaAskers_1.loadQaAskerConfig)();
    const pairs = (0, bcrQaMessages_1.getBcrQaPairs)(bcrQaMessages_1.QA_PAIRS.length);
    const assignments = (0, bcrQaAskers_1.assignQaPairs)(askerIds, allCloneIds, pairs, maxQuestionsPerAsker);
    if (assignments.length === 0) {
        throw new Error("Không gán được kịch bản Hỏi đáp — kiểm tra qaAskers");
    }
    for (let i = 0; i < assignments.length; i++) {
        await (0, scenarioStore_1.createScenario)(buildQaScenarioInput(i, assignments[i], groupId));
    }
    const summary = (0, bcrQaAskers_1.summarizeQaAssignments)(assignments);
    console.log(`[BCR QA] ${assignments.length} kịch bản · ${askerIds.length} người hỏi (tối đa ${maxQuestionsPerAsker} câu/người, không trùng chủ đề)`);
    for (const [id, info] of summary) {
        console.log(`   → ${id}: ${info.count} câu [${info.topics.join(", ")}]`);
    }
    return assignments.length;
}
async function seedBcrTemplates(options) {
    const perType = options?.perType ?? PER_TYPE;
    const existing = await (0, scenarioStore_1.listScenarios)();
    const hasBcr = existing.some((s) => s.source === "bcr");
    if (hasBcr && !options?.force) {
        return { created: 0, skipped: true };
    }
    if (options?.force) {
        const manual = existing.filter((s) => s.source !== "bcr");
        await (0, scenarioStore_1.writeAllScenarios)(manual);
    }
    const clones = await (0, resourceService_1.listClones)();
    const cloneIds = clones.map((c) => c.id);
    if (cloneIds.length === 0) {
        throw new Error("Không có clone — chạy filter:sessions trước");
    }
    const groupId = await getDefaultGroupId();
    let created = 0;
    for (const eventType of EVENT_TYPES) {
        const usedAcrossScenarios = new Set();
        for (let i = 0; i < perType; i++) {
            const stepCount = 5 + (i % 6);
            const texts = (0, bcrMessages_1.pickUniqueBcrMessages)(eventType, stepCount, usedAcrossScenarios);
            for (const t of texts)
                usedAcrossScenarios.add(t);
            await (0, scenarioStore_1.createScenario)(buildScenarioInput(eventType, i, texts, groupId, cloneIds));
            created++;
        }
    }
    const qaCreated = await seedQaScenarios(groupId, cloneIds);
    created += qaCreated;
    (0, bcrScenarioDeck_1.resetBcrScenarioDecks)();
    return { created, skipped: false };
}
async function seedBcrQaTemplates(options) {
    const existing = await (0, scenarioStore_1.listScenarios)();
    const qaExisting = existing.filter((s) => s.source === "bcr" && s.eventType === "qa");
    if (qaExisting.length > 0 && !options?.force) {
        return { created: 0, skipped: true };
    }
    if (options?.force) {
        const rest = existing.filter((s) => !(s.source === "bcr" && s.eventType === "qa"));
        await (0, scenarioStore_1.writeAllScenarios)(rest);
    }
    const clones = await (0, resourceService_1.listClones)();
    const cloneIds = clones.map((c) => c.id);
    if (cloneIds.length === 0) {
        throw new Error("Không có clone — chạy filter:sessions trước");
    }
    const groupId = await getDefaultGroupId();
    const created = await seedQaScenarios(groupId, cloneIds);
    (0, bcrScenarioDeck_1.resetBcrScenarioDecks)();
    return { created, skipped: false };
}
