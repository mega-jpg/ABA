"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSeedingConfigPath = getSeedingConfigPath;
exports.loadSeedingConfig = loadSeedingConfig;
exports.clearSeedingConfigCache = clearSeedingConfigCache;
exports.getEnabledClones = getEnabledClones;
exports.getEnabledGroups = getEnabledGroups;
exports.resolveTargetGroupId = resolveTargetGroupId;
exports.resolveSessionFilePath = resolveSessionFilePath;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const DEFAULT_CONFIG_PATH = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
let cached = null;
function getSeedingConfigPath() {
    return DEFAULT_CONFIG_PATH;
}
async function loadSeedingConfig() {
    if (cached)
        return cached;
    const raw = await promises_1.default.readFile(DEFAULT_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    validateSeedingConfig(parsed);
    cached = parsed;
    return parsed;
}
function clearSeedingConfigCache() {
    cached = null;
}
function validateSeedingConfig(cfg) {
    if (!cfg.clones?.length) {
        throw new Error("seeding.config.json: cần ít nhất 1 clone");
    }
    if (!cfg.groups?.length) {
        throw new Error("seeding.config.json: cần ít nhất 1 group");
    }
    if (!["preset", "random"].includes(cfg.mode)) {
        throw new Error('seeding.config.json: mode phải là "preset" hoặc "random"');
    }
}
function getEnabledClones(cfg) {
    return cfg.clones.filter((c) => c.enabled);
}
function getEnabledGroups(cfg) {
    return cfg.groups.filter((g) => g.enabled);
}
function resolveTargetGroupId(cfg) {
    if (cfg.target.groupId) {
        return cfg.target.groupId;
    }
    const groups = getEnabledGroups(cfg);
    if (groups.length === 0) {
        throw new Error("Không có group enabled nào trong config");
    }
    if (cfg.target.pickGroup === "random") {
        return groups[Math.floor(Math.random() * groups.length)].id;
    }
    return groups[0].id;
}
/** Resolve session path tuyệt đối từ clone config */
function resolveSessionFilePath(clone) {
    if (clone.sessionFile) {
        return path_1.default.isAbsolute(clone.sessionFile)
            ? clone.sessionFile
            : path_1.default.resolve(clone.sessionFile);
    }
    // fallback: clones/{id}.session
    return path_1.default.join(config_1.config.clonesDir, `${clone.id}.session`);
}
