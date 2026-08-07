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
exports.isSessionRetry = isSessionRetry;
exports.wasSessionStepDone = wasSessionStepDone;
exports.markSessionStepDone = markSessionStepDone;
exports.getSessionSelectedTable = getSessionSelectedTable;
exports.setSessionSelectedTable = setSessionSelectedTable;
exports.clearSessionProgress = clearSessionProgress;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const session_ca_util_1 = require("./session-ca.util");
function getProjectRoot() {
    const norm = __dirname.replace(/\\/g, '/');
    if (norm.includes('/dist/src')) {
        return path.resolve(__dirname, '..', '..');
    }
    return path.resolve(__dirname, '..');
}
const FILE = path.join(getProjectRoot(), 'data', 'session-progress.json');
function progressForCa(ca) {
    const today = dateKeyVN();
    const p = load();
    const caInt = Math.max(1, Math.floor(ca));
    if (!p || p.date !== today || p.ca !== caInt)
        return null;
    return p;
}
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
function isSessionRetry() {
    return (0, session_ca_util_1.readSessionCaOverrideFromConfigFile)() > 0;
}
function wasSessionStepDone(step, ca) {
    if (!isSessionRetry())
        return false;
    const today = dateKeyVN();
    const p = load();
    if (!p || p.date !== today || p.ca !== ca)
        return false;
    return p.steps.includes(step);
}
function markSessionStepDone(step, ca) {
    const today = dateKeyVN();
    const caInt = Math.max(1, Math.floor(ca));
    const prev = progressForCa(caInt) ?? load();
    const steps = prev && prev.date === today && prev.ca === caInt
        ? [...prev.steps]
        : [];
    if (!steps.includes(step)) {
        steps.push(step);
    }
    save({
        date: today,
        ca: caInt,
        steps,
        selectedTableName: prev?.selectedTableName,
    });
}
function getSessionSelectedTable(ca) {
    if (!isSessionRetry())
        return null;
    const name = progressForCa(ca)?.selectedTableName?.trim();
    return name || null;
}
function setSessionSelectedTable(ca, tableName) {
    const trimmed = tableName.trim();
    if (!trimmed)
        return;
    const today = dateKeyVN();
    const caInt = Math.max(1, Math.floor(ca));
    const prev = progressForCa(caInt);
    const steps = prev?.steps ? [...prev.steps] : [];
    save({
        date: today,
        ca: caInt,
        steps,
        selectedTableName: trimmed,
    });
}
function clearSessionProgress() {
    try {
        if (fs.existsSync(FILE)) {
            fs.unlinkSync(FILE);
        }
    }
    catch {
    }
}
