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
exports.getSessionCa = getSessionCa;
exports.persistNextSessionCa = persistNextSessionCa;
exports.resetSessionCaOverrideInConfig = resetSessionCaOverrideInConfig;
exports.setSessionCaOverrideInConfig = setSessionCaOverrideInConfig;
exports.readSessionCaOverrideFromConfigFile = readSessionCaOverrideFromConfigFile;
exports.resetSessionStateOnNewDay = resetSessionStateOnNewDay;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const telegram_config_1 = require("../config/telegram.config");
function getProjectRoot() {
    const norm = __dirname.replace(/\\/g, '/');
    if (norm.includes('/dist/src')) {
        return path.resolve(__dirname, '..', '..');
    }
    return path.resolve(__dirname, '..');
}
const FILE = path.join(getProjectRoot(), 'data', 'session-ca.json');
function dateKeyVN() {
    return new Date()
        .toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
        .slice(0, 10);
}
function load() {
    try {
        if (fs.existsSync(FILE)) {
            return JSON.parse(fs.readFileSync(FILE, 'utf8'));
        }
    }
    catch {
    }
    return null;
}
function save(state) {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
}
function getSessionCa(soCa) {
    const today = dateKeyVN();
    const n = Math.max(1, Math.floor(soCa));
    if (n < 1)
        return 1;
    const prev = load();
    if (!prev || prev.date !== today) {
        if (prev && prev.date !== today) {
            console.warn(`[session-ca] date trong file (${prev.date}) ≠ hôm nay VN (${today}) → reset ca 1 (sang ngày mới). File: ${FILE}`);
        }
        save({ date: today, nextCa: 1 });
        return 1;
        1;
    }
    const raw = prev.nextCa ?? 1;
    return Math.min(Math.max(1, raw), n);
}
function persistNextSessionCa(soCa, usedCa) {
    const today = dateKeyVN();
    const n = Math.max(1, Math.floor(soCa));
    const u = Math.min(Math.max(1, usedCa), n);
    const next = u >= n ? 1 : u + 1;
    save({ date: today, nextCa: next });
}
function resetSessionCaOverrideInConfig() {
    try {
        (0, telegram_config_1.setSessionCaOverrideInConfigFile)(0);
    }
    catch (e) {
        console.warn('[session-ca] Không thể đặt session_ca_override về 0 trong config.json:', e);
    }
}
function setSessionCaOverrideInConfig(ca) {
    const caInt = Math.floor(Number(ca));
    if (!Number.isFinite(caInt) || caInt <= 0)
        return;
    try {
        (0, telegram_config_1.setSessionCaOverrideInConfigFile)(caInt);
    }
    catch (e) {
        console.warn(`[session-ca] Không thể set session_ca_override=${caInt} trong config.json:`, e);
    }
}
function readSessionCaOverrideFromConfigFile() {
    return (0, telegram_config_1.readSessionCaOverrideFromConfigFile)();
}
function resetSessionStateOnNewDay() {
    const today = dateKeyVN();
    const prev = load();
    if (!prev || prev.date !== today) {
        save({ date: today, nextCa: 1 });
        if ((0, telegram_config_1.readSessionCaOverrideFromConfigFile)() > 0) {
            resetSessionCaOverrideInConfig();
            console.log(`[session-ca] Sang ngày mới (${today}) → ca 1, session_ca_override về 0`);
        }
    }
}
