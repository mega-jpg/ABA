"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeConfig = exports.isNestedConfig = exports.telegramConfig = void 0;
exports.isChiGuiNhomAo = isChiGuiNhomAo;
exports.getConfigPath = getConfigPath;
exports.reloadTelegramConfig = reloadTelegramConfig;
exports.readRawConfigFile = readRawConfigFile;
exports.writeRawConfigFile = writeRawConfigFile;
exports.readSessionCaOverrideFromConfigFile = readSessionCaOverrideFromConfigFile;
exports.setSessionCaOverrideInConfigFile = setSessionCaOverrideInConfigFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const normalize_config_1 = require("./normalize-config");
Object.defineProperty(exports, "normalizeConfig", { enumerable: true, get: function () { return normalize_config_1.normalizeConfig; } });
Object.defineProperty(exports, "isNestedConfig", { enumerable: true, get: function () { return normalize_config_1.isNestedConfig; } });
const configPath = process.env.CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.CONFIG_PATH)
    : path.join(process.cwd(), 'config.json');
const rawConfigData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const telegramConfig = (0, normalize_config_1.normalizeConfig)(rawConfigData);
exports.telegramConfig = telegramConfig;
function isChiGuiNhomAo() {
    return Boolean(telegramConfig.chi_gui_nhom_ao);
}
function getConfigPath() {
    return configPath;
}
function reloadTelegramConfig() {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const flat = (0, normalize_config_1.normalizeConfig)(raw);
    for (const key of Object.keys(telegramConfig)) {
        delete telegramConfig[key];
    }
    Object.assign(telegramConfig, flat);
}
function readRawConfigFile() {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function writeRawConfigFile(raw) {
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
}
function readSessionCaOverrideFromConfigFile() {
    return (0, normalize_config_1.readSessionCaOverrideFromRaw)(readRawConfigFile());
}
function setSessionCaOverrideInConfigFile(value) {
    const raw = readRawConfigFile();
    const updated = (0, normalize_config_1.writeSessionCaOverrideToRaw)(raw, value);
    writeRawConfigFile(updated);
    telegramConfig.session_ca_override = value;
}
