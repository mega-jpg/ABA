"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildScriptFromConfig = buildScriptFromConfig;
exports.createScriptFromConfigFile = createScriptFromConfigFile;
const seedingConfig_1 = require("./seedingConfig");
const seeding_1 = require("../types/seeding");
const seedingConfig_2 = require("./seedingConfig");
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function buildPresetSteps(steps) {
    return steps.map((s) => ({
        cloneId: s.cloneId,
        action: s.action,
        payload: {
            ...(s.text ? { text: s.text } : {}),
            ...(s.gifUrl ? { gifUrl: s.gifUrl } : {}),
            ...(s.reaction ? { reaction: s.reaction } : {}),
            ...(s.replyToPrevious ? {} : {}),
        },
        delayBefore: s.delayBeforeSec,
    }));
}
function pickClone(clones, strategy, index) {
    if (clones.length === 0)
        throw new Error("Không có clone enabled");
    switch (strategy) {
        case "first":
            return clones[0].id;
        case "round_robin":
            return clones[index % clones.length].id;
        case "random":
        default:
            return pickRandom(clones).id;
    }
}
function buildRandomSteps(clones, randomCfg) {
    const stepCount = (0, seeding_1.randomDelay)(randomCfg.minSteps, randomCfg.maxSteps);
    const steps = [];
    let lastWasMessage = false;
    for (let i = 0; i < stepCount; i++) {
        const cloneId = pickClone(clones, randomCfg.pickClone, i);
        const delay = (0, seeding_1.randomDelay)(randomCfg.delayMinSec, randomCfg.delayMaxSec);
        const action = pickRandom(randomCfg.actions);
        if (action === "send_message" && randomCfg.messages.length > 0) {
            steps.push({
                cloneId,
                action: "send_message",
                payload: { text: pickRandom(randomCfg.messages) },
                delayBefore: delay,
            });
            lastWasMessage = true;
            continue;
        }
        if (action === "react" && randomCfg.reactions.length > 0 && lastWasMessage) {
            steps.push({
                cloneId,
                action: "react",
                payload: { reaction: pickRandom(randomCfg.reactions) },
                delayBefore: delay,
            });
            continue;
        }
        // fallback: gửi tin nếu react không hợp lệ
        if (randomCfg.messages.length > 0) {
            steps.push({
                cloneId,
                action: "send_message",
                payload: { text: pickRandom(randomCfg.messages) },
                delayBefore: delay,
            });
            lastWasMessage = true;
        }
    }
    return steps;
}
async function buildScriptFromConfig(cfg) {
    const clones = (0, seedingConfig_1.getEnabledClones)(cfg);
    const chatId = (0, seedingConfig_1.resolveTargetGroupId)(cfg);
    if (clones.length === 0) {
        throw new Error("Không có clone enabled trong seeding.config.json");
    }
    const enabledCloneIds = new Set(clones.map((c) => c.id));
    let steps;
    let name;
    if (cfg.mode === "preset") {
        name = cfg.interaction.preset.name;
        steps = buildPresetSteps(cfg.interaction.preset.steps);
        for (const step of steps) {
            if (!enabledCloneIds.has(step.cloneId)) {
                throw new Error(`Preset step dùng clone "${step.cloneId}" nhưng clone chưa enabled trong config`);
            }
        }
    }
    else {
        name = "Random interaction";
        steps = buildRandomSteps(clones, cfg.interaction.random);
    }
    if (steps.length === 0) {
        throw new Error("Không tạo được step nào từ config");
    }
    return {
        id: `wf-${cfg.mode}-${Date.now()}`,
        name,
        chatId,
        steps,
    };
}
async function createScriptFromConfigFile() {
    const cfg = await (0, seedingConfig_2.loadSeedingConfig)();
    return buildScriptFromConfig(cfg);
}
