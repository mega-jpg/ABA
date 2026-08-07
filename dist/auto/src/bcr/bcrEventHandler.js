"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleBcrPubSubMessage = handleBcrPubSubMessage;
exports.runBcrScenarioById = runBcrScenarioById;
const bcrScenarioDeck_1 = require("./bcrScenarioDeck");
const bcrEventParser_1 = require("./bcrEventParser");
const scenarioStore_1 = require("../admin/services/scenarioStore");
const scheduler_1 = require("../queue/scheduler");
const bcrMessages_1 = require("./bcrMessages");
const resourceService_1 = require("../admin/services/resourceService");
const bcrRunLimiter_1 = require("./bcrRunLimiter");
const bcrForwardGifs_1 = require("./bcrForwardGifs");
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function injectRandomForwardGifs(steps, eventType) {
    if (steps.length < 3)
        return;
    if (eventType !== "win" && Math.random() > 0.25)
        return;
    const maxForwards = eventType === "win" ? randomInt(1, 2) : 1;
    const candidateIdx = steps
        .map((_, i) => i)
        .filter((i) => i > 0);
    for (let i = candidateIdx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidateIdx[i], candidateIdx[j]] = [candidateIdx[j], candidateIdx[i]];
    }
    let injected = 0;
    for (const idx of candidateIdx) {
        if (injected >= maxForwards)
            break;
        const chance = eventType === "win" ? 0.45 : 0.3;
        if (Math.random() > chance)
            continue;
        const target = (0, bcrForwardGifs_1.pickRandomBcrForwardGif)();
        steps[idx] = {
            ...steps[idx],
            action: "forward_message",
            payload: {
                forwardFromPeer: target.fromPeer,
                forwardMessageId: target.messageId,
            },
        };
        injected++;
    }
    if (injected === 0 && eventType === "win" && steps.length >= 4) {
        const idx = randomInt(1, steps.length - 1);
        const target = (0, bcrForwardGifs_1.pickRandomBcrForwardGif)();
        steps[idx] = {
            ...steps[idx],
            action: "forward_message",
            payload: {
                forwardFromPeer: target.fromPeer,
                forwardMessageId: target.messageId,
            },
        };
    }
}
function buildRuntimeConversationScript(scenario, eventType, groupId, aliveCloneIds) {
    const targetMessages = randomInt(5, 10);
    const scenarioTexts = scenario.steps
        .filter((s) => s.action === "send_message" && !!s.text?.trim())
        .map((s) => String(s.text).trim());
    const used = new Set();
    let texts = [];
    for (const text of scenarioTexts) {
        if (texts.length >= targetMessages)
            break;
        if (used.has(text))
            continue;
        used.add(text);
        texts.push(text);
    }
    if (texts.length < targetMessages) {
        const extras = (0, bcrMessages_1.pickUniqueBcrMessages)(eventType, targetMessages - texts.length, used);
        for (const text of extras) {
            if (texts.length >= targetMessages)
                break;
            if (!used.has(text)) {
                used.add(text);
                texts.push(text);
            }
        }
    }
    if (texts.length === 0) {
        texts = (0, bcrMessages_1.pickUniqueBcrMessages)(eventType, targetMessages);
    }
    const aliveSet = new Set(aliveCloneIds);
    const preferred = Array.from(new Set(scenario.steps
        .map((s) => s.cloneId)
        .filter((id) => aliveSet.has(id))));
    const participants = [...preferred];
    for (const id of aliveCloneIds) {
        if (participants.length >= Math.min(4, aliveCloneIds.length))
            break;
        if (!participants.includes(id))
            participants.push(id);
    }
    if (participants.length === 0) {
        participants.push(...aliveCloneIds.slice(0, 1));
    }
    const steps = texts.map((text, i) => {
        const cloneId = participants[i % participants.length];
        return {
            cloneId,
            action: "send_message",
            payload: {
                text,
            },
            delayBefore: i === 0 ? randomInt(2, 6) : randomInt(6, 20),
        };
    });
    injectRandomForwardGifs(steps, eventType);
    return {
        id: `wf-${scenario.id.slice(0, 8)}-${Date.now()}`,
        name: scenario.name,
        chatId: groupId,
        steps,
    };
}
async function handleBcrPubSubMessage(raw) {
    const parsed = (0, bcrEventParser_1.parseBcrPubSubMessage)(raw);
    if (!parsed) {
        return { ok: false, message: `Không parse được event: ${raw.slice(0, 100)}` };
    }
    const { eventType, groupId } = parsed;
    const gate = await (0, bcrRunLimiter_1.shouldRunBcrEvent)(eventType, groupId);
    if (!gate.allow) {
        return {
            ok: true,
            message: `${bcrMessages_1.BCR_EVENT_LABELS[eventType]}: bỏ qua (${gate.reason})`,
        };
    }
    const clones = await (0, resourceService_1.listClones)();
    const aliveCloneIds = clones.map((c) => c.id);
    if (aliveCloneIds.length === 0) {
        return {
            ok: false,
            message: "Không có clone sống để chạy kịch bản",
        };
    }
    const scenario = await (0, bcrScenarioDeck_1.pickNextBcrScenario)(eventType);
    if (!scenario) {
        return {
            ok: false,
            message: `Không có kịch bản BCR ${bcrMessages_1.BCR_EVENT_LABELS[eventType]} — chạy npm run seed:bcr`,
        };
    }
    const resolved = groupId
        ? { ...scenario, groupId }
        : scenario;
    const script = buildRuntimeConversationScript(resolved, eventType, resolved.groupId, aliveCloneIds);
    const workflowId = await (0, scheduler_1.scheduleSeedingScript)(script);
    await (0, scenarioStore_1.markScenarioRun)(scenario.id, workflowId);
    console.log(`[BCR] ${bcrMessages_1.BCR_EVENT_LABELS[eventType]} → kịch bản "${scenario.name}" → workflow ${workflowId}`);
    return {
        ok: true,
        workflowId,
        message: `${bcrMessages_1.BCR_EVENT_LABELS[eventType]}: chạy "${scenario.name}" (${script.steps.length} tin)`,
    };
}
async function runBcrScenarioById(scenarioId, groupIdOverride) {
    const scenario = await (0, scenarioStore_1.getScenario)(scenarioId);
    if (!scenario)
        throw new Error("Kịch bản không tồn tại");
    const resolved = groupIdOverride
        ? { ...scenario, groupId: groupIdOverride }
        : scenario;
    const clones = await (0, resourceService_1.listClones)();
    const aliveCloneIds = clones.map((c) => c.id);
    if (aliveCloneIds.length === 0) {
        throw new Error("Không có clone sống để chạy kịch bản");
    }
    const eventType = resolved.eventType ?? "qa";
    const script = buildRuntimeConversationScript(resolved, eventType, resolved.groupId, aliveCloneIds);
    const workflowId = await (0, scheduler_1.scheduleSeedingScript)(script);
    await (0, scenarioStore_1.markScenarioRun)(scenario.id, workflowId);
    return workflowId;
}
