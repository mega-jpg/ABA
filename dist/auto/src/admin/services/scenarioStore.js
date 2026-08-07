"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listScenarios = listScenarios;
exports.readAllScenarios = readAllScenarios;
exports.writeAllScenarios = writeAllScenarios;
exports.countScenariosByEvent = countScenariosByEvent;
exports.getScenario = getScenario;
exports.createScenario = createScenario;
exports.updateScenario = updateScenario;
exports.deleteScenario = deleteScenario;
exports.markScenarioRun = markScenarioRun;
exports.toSeedingScript = toSeedingScript;
exports.computeJobDelays = computeJobDelays;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const DATA_DIR = path_1.default.resolve(process.env.DATA_DIR ?? "./data");
const SCENARIOS_FILE = path_1.default.join(DATA_DIR, "scenarios.json");
async function ensureDataDir() {
    await promises_1.default.mkdir(DATA_DIR, { recursive: true });
}
async function readAll() {
    await ensureDataDir();
    try {
        const raw = await promises_1.default.readFile(SCENARIOS_FILE, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
async function writeAll(scenarios) {
    await ensureDataDir();
    await promises_1.default.writeFile(SCENARIOS_FILE, JSON.stringify(scenarios, null, 2));
}
async function listScenarios(filter) {
    let all = await readAll();
    if (filter?.source === "manual") {
        all = all.filter((s) => !s.source || s.source === "manual");
    }
    else if (filter?.source) {
        all = all.filter((s) => s.source === filter.source);
    }
    if (filter?.eventType) {
        all = all.filter((s) => s.eventType === filter.eventType);
    }
    return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
async function readAllScenarios() {
    return readAll();
}
async function writeAllScenarios(scenarios) {
    await writeAll(scenarios);
}
async function countScenariosByEvent() {
    const all = await readAll();
    const counts = {
        manual: 0, win: 0, draw: 0, lose: 0, qa: 0,
    };
    for (const s of all) {
        if (s.source === "bcr" && s.eventType) {
            counts[s.eventType] = (counts[s.eventType] ?? 0) + 1;
        }
        else {
            counts.manual++;
        }
    }
    return counts;
}
async function getScenario(id) {
    const all = await readAll();
    return all.find((s) => s.id === id) ?? null;
}
async function createScenario(input) {
    const now = new Date().toISOString();
    const scenario = {
        id: (0, crypto_1.randomUUID)(),
        name: input.name,
        groupId: input.groupId,
        enabled: true,
        source: input.source ?? "manual",
        eventType: input.eventType,
        scheduledAt: input.scheduledAt,
        steps: input.steps.map((s) => ({ ...s, id: (0, crypto_1.randomUUID)() })),
        createdAt: now,
        updatedAt: now,
    };
    const all = await readAll();
    all.push(scenario);
    await writeAll(all);
    return scenario;
}
async function updateScenario(id, patch) {
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1)
        return null;
    const current = all[idx];
    const updated = {
        ...current,
        name: patch.name ?? current.name,
        groupId: patch.groupId ?? current.groupId,
        scheduledAt: patch.scheduledAt ?? current.scheduledAt,
        enabled: patch.enabled ?? current.enabled,
        source: patch.source ?? current.source,
        eventType: patch.eventType ?? current.eventType,
        steps: patch.steps
            ? patch.steps.map((s) => ({
                ...s,
                id: s.id ?? (0, crypto_1.randomUUID)(),
            }))
            : current.steps,
        updatedAt: new Date().toISOString(),
    };
    all[idx] = updated;
    await writeAll(all);
    return updated;
}
async function deleteScenario(id) {
    const all = await readAll();
    const filtered = all.filter((s) => s.id !== id);
    if (filtered.length === all.length)
        return false;
    await writeAll(filtered);
    return true;
}
async function markScenarioRun(id, workflowId) {
    const all = await readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1)
        return;
    all[idx].lastRunAt = new Date().toISOString();
    all[idx].lastWorkflowId = workflowId;
    await writeAll(all);
}
function toSeedingScript(scenario) {
    return {
        id: `wf-${scenario.id.slice(0, 8)}-${Date.now()}`,
        name: scenario.name,
        chatId: scenario.groupId,
        steps: scenario.steps.map((step) => ({
            cloneId: step.cloneId,
            action: step.action,
            payload: {
                ...(step.text ? { text: step.text } : {}),
                ...(step.gifUrl ? { gifUrl: step.gifUrl } : {}),
                ...(step.reaction ? { reaction: step.reaction } : {}),
                ...(step.replyToPrevious ? { replyToPrevious: true } : {}),
                ...(step.inviteLink ? { inviteLink: step.inviteLink } : {}),
            },
            delayBefore: step.delayBeforeSec,
        })),
    };
}
function computeJobDelays(scenario) {
    const now = Date.now();
    const baseStart = scenario.scheduledAt
        ? new Date(scenario.scheduledAt).getTime()
        : now;
    const workflowOffset = Math.max(0, baseStart - now);
    let cumulative = 0;
    return scenario.steps.map((step) => {
        if (step.runAt) {
            return Math.max(0, new Date(step.runAt).getTime() - now);
        }
        cumulative += step.delayBeforeSec * 1000;
        return workflowOffset + cumulative;
    });
}
