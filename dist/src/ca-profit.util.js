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
exports.getTongKetPercentPerHand = getTongKetPercentPerHand;
exports.getTongKetDisplayMode = getTongKetDisplayMode;
exports.upsertCaProfitToday = upsertCaProfitToday;
exports.upsertCaProfitForThatGroup = upsertCaProfitForThatGroup;
exports.getCaProfitsTodayForThatGroup = getCaProfitsTodayForThatGroup;
exports.getTotalsForMonthForThatGroup = getTotalsForMonthForThatGroup;
exports.upsertCaProfitForAoGroup = upsertCaProfitForAoGroup;
exports.getCaProfitsTodayForAoGroup = getCaProfitsTodayForAoGroup;
exports.getTotalsForMonthForAoGroup = getTotalsForMonthForAoGroup;
exports.getCaProfitsToday = getCaProfitsToday;
exports.getTotalsForMonth = getTotalsForMonth;
exports.formatAoDisplayPercent = formatAoDisplayPercent;
exports.formatAoTotalSumAsPercent = formatAoTotalSumAsPercent;
exports.normalizeAoProfitPoints = normalizeAoProfitPoints;
exports.aoSessionTotalToGameResult = aoSessionTotalToGameResult;
exports.aoSessionResultToProfitPoints = aoSessionResultToProfitPoints;
exports.coerceAoStoredProfitPoints = coerceAoStoredProfitPoints;
exports.aoProfitPointsToSheetCell = aoProfitPointsToSheetCell;
exports.formatTongKetDisplay = formatTongKetDisplay;
exports.insertBeforeLastTwoCodepoints = insertBeforeLastTwoCodepoints;
exports.editTongKetCaLines = editTongKetCaLines;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const telegram_config_1 = require("../config/telegram.config");
function getGameBetConfig(group) {
    const cfg = telegram_config_1.telegramConfig;
    const raw = group === 'ao'
        ? cfg.gameBetConfigAo
        : cfg.gameBetConfig;
    return {
        betAmount: raw?.betAmount ?? 500,
        bankerOdds: raw?.bankerOdds ?? 0.95,
        playerOdds: raw?.playerOdds ?? 1,
    };
}
function getTongKetPercentPerHand() {
    const n = Number(telegram_config_1.telegramConfig.tong_ket_percent_per_hand ?? 5);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
}
function getTongKetDisplayMode(group) {
    const cfg = telegram_config_1.telegramConfig;
    const key = group === 'ao' ? 'tong_ket_display_ao' : 'tong_ket_display_that';
    const v = cfg[key];
    if (v === 'bet' || v === 'percent')
        return v;
    return group === 'ao' ? 'percent' : 'bet';
}
function tongKetStoredToDisplayValue(stored, group) {
    const mode = getTongKetDisplayMode(group);
    const n = Math.round(Number(stored));
    if (!Number.isFinite(n))
        return 0;
    const { betAmount } = getGameBetConfig(group);
    const pctStep = getTongKetPercentPerHand();
    if (group === 'ao') {
        const points = normalizeAoProfitPoints(n);
        if (mode === 'percent')
            return points;
        if (points === 0 || pctStep === 0)
            return 0;
        return Math.round((points / pctStep) * betAmount);
    }
    if (mode === 'bet')
        return n;
    if (betAmount === 0)
        return 0;
    return Math.round((n / betAmount) * pctStep);
}
function getProjectRoot() {
    const norm = __dirname.replace(/\\/g, '/');
    if (norm.includes('/dist/src')) {
        return path.resolve(__dirname, '..', '..');
    }
    return path.resolve(__dirname, '..');
}
const FILE = path.join(getProjectRoot(), 'data', 'ca-profit.json');
function dateKeyVN() {
    return new Date().toLocaleString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    }).slice(0, 10);
}
function ensureDir() {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
function loadStore() {
    ensureDir();
    if (!fs.existsSync(FILE))
        return {};
    try {
        const raw = fs.readFileSync(FILE, 'utf8').trim();
        if (!raw)
            return {};
        return JSON.parse(raw);
    }
    catch (e) {
        try {
            const backup = `${FILE}.corrupt-${Date.now()}.bak`;
            fs.copyFileSync(FILE, backup);
            console.warn(`[ca-profit] File ca-profit.json parse fail → đã backup sang ${backup}:`, e);
        }
        catch {
        }
        return {};
    }
}
function saveStore(data) {
    ensureDir();
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
}
function getMonthKey(dateStr) {
    return dateStr.slice(0, 7);
}
function upsertCaProfitToday(group, caIndex, amount) {
    const ca = Math.floor(Number(caIndex));
    if (!Number.isFinite(ca) || ca < 1)
        return;
    let value = Math.round(Number(amount));
    if (!Number.isFinite(value))
        return;
    if (group === 'ao') {
        value = normalizeAoProfitPoints(value);
    }
    const data = loadStore();
    const key = dateKeyVN();
    if (!data[key])
        data[key] = { that: {}, ao: {} };
    data[key][group][String(ca)] = value;
    saveStore(data);
}
function upsertCaProfitForThatGroup(thatGroupId, caIndex, amount) {
    const ca = Math.floor(Number(caIndex));
    if (!Number.isFinite(ca) || ca < 1)
        return;
    const groupId = String(thatGroupId).trim();
    if (!groupId)
        return;
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value))
        return;
    const data = loadStore();
    const key = dateKeyVN();
    if (!data[key])
        data[key] = { that: {}, ao: {} };
    if (!data[key].that_by_group)
        data[key].that_by_group = {};
    if (!data[key].that_by_group[groupId])
        data[key].that_by_group[groupId] = {};
    data[key].that_by_group[groupId][String(ca)] = value;
    saveStore(data);
}
function getCaProfitsTodayForThatGroup(thatGroupId) {
    const data = loadStore();
    const key = dateKeyVN();
    const row = data[key];
    const src = row?.that_by_group?.[String(thatGroupId).trim()];
    if (!src)
        return {};
    const out = {};
    for (const [k, v] of Object.entries(src)) {
        const ca = Number.parseInt(k, 10);
        if (Number.isFinite(ca) && ca >= 1 && Number.isFinite(v)) {
            out[ca] = Math.round(Number(v));
        }
    }
    return out;
}
function getTotalsForMonthForThatGroup(thatGroupId) {
    const data = loadStore();
    const todayKey = dateKeyVN();
    const todayMonth = getMonthKey(todayKey);
    const gid = String(thatGroupId).trim();
    let today = 0;
    let month = 0;
    for (const [dayKey, row] of Object.entries(data)) {
        const profits = row.that_by_group?.[gid];
        if (!profits)
            continue;
        const sum = Object.values(profits).reduce((acc, v) => acc + (Number.isFinite(v) ? Math.round(Number(v)) : 0), 0);
        if (dayKey === todayKey)
            today = sum;
        if (getMonthKey(dayKey) === todayMonth)
            month += sum;
    }
    return { today, month };
}
function upsertCaProfitForAoGroup(aoGroupId, caIndex, amount) {
    const ca = Math.floor(Number(caIndex));
    if (!Number.isFinite(ca) || ca < 1)
        return;
    const groupId = String(aoGroupId).trim();
    if (!groupId)
        return;
    const value = normalizeAoProfitPoints(Math.round(Number(amount)));
    const data = loadStore();
    const key = dateKeyVN();
    if (!data[key])
        data[key] = { that: {}, ao: {} };
    if (!data[key].ao_by_group)
        data[key].ao_by_group = {};
    if (!data[key].ao_by_group[groupId])
        data[key].ao_by_group[groupId] = {};
    data[key].ao_by_group[groupId][String(ca)] = value;
    saveStore(data);
}
function getCaProfitsTodayForAoGroup(aoGroupId) {
    const data = loadStore();
    const key = dateKeyVN();
    const row = data[key];
    const src = row?.ao_by_group?.[String(aoGroupId).trim()];
    if (!src)
        return {};
    const out = {};
    for (const [k, v] of Object.entries(src)) {
        const ca = Number.parseInt(k, 10);
        if (Number.isFinite(ca) && ca >= 1 && Number.isFinite(v)) {
            out[ca] = normalizeAoProfitPoints(Math.round(Number(v)));
        }
    }
    return out;
}
function getTotalsForMonthForAoGroup(aoGroupId) {
    const data = loadStore();
    const todayKey = dateKeyVN();
    const todayMonth = getMonthKey(todayKey);
    const gid = String(aoGroupId).trim();
    let today = 0;
    let month = 0;
    for (const [dayKey, row] of Object.entries(data)) {
        const profits = row.ao_by_group?.[gid];
        if (!profits)
            continue;
        const sum = Object.values(profits).reduce((acc, v) => acc + (Number.isFinite(v) ? normalizeAoProfitPoints(Number(v)) : 0), 0);
        if (dayKey === todayKey)
            today = sum;
        if (getMonthKey(dayKey) === todayMonth)
            month += sum;
    }
    return { today, month };
}
function getCaProfitsToday(group) {
    const data = loadStore();
    const key = dateKeyVN();
    const row = data[key];
    if (!row)
        return {};
    const src = row[group];
    const out = {};
    for (const [k, v] of Object.entries(src)) {
        const ca = Number.parseInt(k, 10);
        if (Number.isFinite(ca) && ca >= 1 && Number.isFinite(v)) {
            const rounded = Math.round(v);
            out[ca] =
                group === 'ao' ? normalizeAoProfitPoints(rounded) : rounded;
        }
    }
    return out;
}
function getTotalsForMonth(group) {
    const data = loadStore();
    const todayKey = dateKeyVN();
    const todayMonth = getMonthKey(todayKey);
    let today = 0;
    let month = 0;
    for (const [dayKey, row] of Object.entries(data)) {
        const profits = row[group];
        const sum = Object.values(profits).reduce((acc, v) => {
            if (!Number.isFinite(v))
                return acc;
            if (group === 'ao') {
                return acc + normalizeAoProfitPoints(Number(v));
            }
            return acc + Math.round(Number(v));
        }, 0);
        if (dayKey === todayKey) {
            today = sum;
        }
        if (getMonthKey(dayKey) === todayMonth) {
            month += sum;
        }
    }
    return { today, month };
}
function formatAoDisplayPercent(value) {
    return formatAoTotalSumAsPercent(normalizeAoProfitPoints(value));
}
function formatAoTotalSumAsPercent(total) {
    const n = Math.round(Number(total));
    if (!Number.isFinite(n) || n === 0)
        return '+0%';
    return (n > 0 ? '+' : '') + String(n) + '%';
}
function normalizeAoProfitPoints(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n === 0)
        return 0;
    const pct = getTongKetPercentPerHand();
    if (Math.abs(n) > 500)
        return n > 0 ? pct : -pct;
    const unit = gcdPositive(5, pct);
    const steps = Math.round(n / unit);
    if (steps === 0)
        return 0;
    return steps * unit;
}
function gcdPositive(a, b) {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    if (x === 0)
        return y || 1;
    if (y === 0)
        return x || 1;
    while (y !== 0) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x || 1;
}
function aoSessionTotalToGameResult(totalPoints) {
    const n = Math.round(Number(totalPoints));
    if (!Number.isFinite(n) || n === 0)
        return 'HOA';
    if (n > 0)
        return 'WIN';
    return 'LOSE';
}
function aoSessionResultToProfitPoints(isDraw, isWin) {
    if (isDraw)
        return 0;
    const pct = getTongKetPercentPerHand();
    return isWin ? pct : -pct;
}
function coerceAoStoredProfitPoints(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n === 0)
        return 0;
    const pct = getTongKetPercentPerHand();
    return n > 0 ? pct : -pct;
}
function aoProfitPointsToSheetCell(points) {
    return normalizeAoProfitPoints(points);
}
function formatThatSignedAmount(amount) {
    if (amount === 0)
        return '+0';
    const abs = Math.abs(Math.round(amount)).toLocaleString('de-DE');
    return amount > 0 ? `+${abs}` : `-${abs}`;
}
function formatTongKetDisplay(stored, group) {
    const display = tongKetStoredToDisplayValue(stored, group);
    const mode = getTongKetDisplayMode(group);
    if (mode === 'percent') {
        return formatAoTotalSumAsPercent(display);
    }
    return formatThatSignedAmount(display);
}
function formatDisplayForGroup(value, group) {
    return formatTongKetDisplay(value, group);
}
function normalizeFancyText(s) {
    return Array.from(s)
        .map((ch) => {
        const cp = ch.codePointAt(0);
        if (cp >= 0x1d400 && cp <= 0x1d419) {
            return String.fromCharCode(65 + cp - 0x1d400);
        }
        if (cp >= 0x1d41a && cp <= 0x1d433) {
            return String.fromCharCode(97 + cp - 0x1d41a);
        }
        if (cp >= 0x1d7ce && cp <= 0x1d7d7) {
            return String.fromCharCode(48 + cp - 0x1d7ce);
        }
        if (cp >= 0x1d7e2 && cp <= 0x1d7eb) {
            return String.fromCharCode(48 + cp - 0x1d7e2);
        }
        if (cp >= 0xff10 && cp <= 0xff19) {
            return String.fromCharCode(48 + cp - 0xff10);
        }
        return ch;
    })
        .join('');
}
function insertBeforeLastEmoji(line, textToInsert) {
    const trailingSpacesMatch = line.match(/\s*$/);
    const trailingSpaces = trailingSpacesMatch?.[0] ?? '';
    const core = trailingSpaces ? line.slice(0, -trailingSpaces.length) : line;
    const chars = Array.from(core);
    if (chars.length === 0)
        return `${line} ${textToInsert}`;
    const emojiLike = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
    for (let i = chars.length - 1; i >= 0; i--) {
        if (emojiLike.test(chars[i])) {
            const before = chars.slice(0, i).join('');
            const fromLastEmoji = chars.slice(i).join('');
            return `${before} ${textToInsert}${fromLastEmoji}${trailingSpaces}`;
        }
    }
    return `${core} ${textToInsert}${trailingSpaces}`;
}
function insertBeforeLastTwoCodepoints(line, textToInsert) {
    const trailingSpacesMatch = line.match(/\s*$/);
    const trailingSpaces = trailingSpacesMatch?.[0] ?? '';
    const core = trailingSpaces ? line.slice(0, -trailingSpaces.length) : line;
    const chars = Array.from(core);
    if (chars.length < 2)
        return `${core}${textToInsert}${trailingSpaces}`;
    const before = chars.slice(0, -2).join('');
    const lastTwo = chars.slice(-2).join('');
    return `${before}${textToInsert}${lastTwo}${trailingSpaces}`;
}
const PERCENT_PLACEHOLDER_TAIL = /\+%(?=[^\n]*(\p{Extended_Pictographic}|\p{Emoji_Presentation}|💸|💥|🤑))/u;
function fillOrInsertTotalValue(line, display) {
    const bare = display.replace(/^\+/, '').trim();
    if (/\+\s*:\s*[\d.,]*/.test(line)) {
        return line.replace(/\+\s*:\s*[\d.,]*/, `+  : ${bare}`);
    }
    if (/\+\s*:\s*(?=\s*$)/.test(line)) {
        return line.replace(/\+\s*:\s*/, `+  : ${bare} `);
    }
    if (PERCENT_PLACEHOLDER_TAIL.test(line)) {
        return line.replace(PERCENT_PLACEHOLDER_TAIL, display);
    }
    if (/\+\s*%/.test(line)) {
        return line.replace(/\+\s*%/, display);
    }
    const existingPct = line.match(/[+\-]\d+%/);
    if (existingPct) {
        return line.replace(existingPct[0], display);
    }
    return insertBeforeLastEmoji(line, display);
}
function insertCaLineValue(line, value, group, opts) {
    const display = formatDisplayForGroup(value, group);
    if (PERCENT_PLACEHOLDER_TAIL.test(line) || /\+\s*%/.test(line)) {
        return fillOrInsertTotalValue(line, display);
    }
    if (/[✔✓]\s*$/u.test(line)) {
        return line.replace(/([✔✓])\s*$/u, `${display} $1`);
    }
    if (opts?.preferTwoCodeTail === true && group === 'ao') {
        return insertBeforeLastTwoCodepoints(line, display);
    }
    return insertBeforeLastEmoji(line, display);
}
function isCaScheduleLine(line) {
    const norm = normalizeFancyText(line);
    if (!/CA/i.test(norm))
        return false;
    if (/CA\s*0*\d+\s*:\s*\d{1,2}\s*:\s*\d{2}/i.test(norm))
        return true;
    if (/CA\s*0*\d+\s*[➡️→>]\s*\d{1,2}H\d{2}/i.test(norm))
        return true;
    if (/CA\s*0*\d+/i.test(norm) && /\d{1,2}\s*:\s*\d{2}/.test(norm)) {
        return true;
    }
    if (/\d{1,2}H\d{2}/i.test(norm) && /(💸|💥|🤑|🎆)/.test(line)) {
        return true;
    }
    if (/(?:🔈|⏰|⌛)/u.test(line) || /[✔✓]/u.test(line)) {
        return true;
    }
    return false;
}
function parseCaIndexFromScheduleLine(line) {
    const norm = normalizeFancyText(line);
    const arrowFmt = norm.match(/CA\s*0*(\d+)\s*[➡️→>]\s*\d{1,2}H\d{2}/i);
    if (arrowFmt) {
        const ca = Number.parseInt(arrowFmt[1], 10);
        if (Number.isFinite(ca) && ca >= 1)
            return ca;
    }
    const colonTime = norm.match(/CA\s*0*(\d+)\s*:\s*\d{1,2}\s*:\s*\d{2}/i);
    if (colonTime) {
        const ca = Number.parseInt(colonTime[1], 10);
        if (Number.isFinite(ca) && ca >= 1)
            return ca;
    }
    if (/CA\s*0*\d+/i.test(norm) && /\d{1,2}\s*:\s*\d{2}/.test(norm)) {
        const caEmojiTime = norm.match(/CA\s*0*(\d+)/i);
        if (caEmojiTime) {
            const ca = Number.parseInt(caEmojiTime[1], 10);
            if (Number.isFinite(ca) && ca >= 1)
                return ca;
        }
    }
    const caOnly = norm.match(/CA\s*0*(\d+)\s*:/i);
    if (caOnly) {
        const ca = Number.parseInt(caOnly[1], 10);
        if (Number.isFinite(ca) && ca >= 1)
            return ca;
    }
    const hourM = norm.match(/(\d{1,2})H(\d{2})/i);
    if (!hourM || hourM.index === undefined)
        return null;
    const beforeHour = norm.slice(0, hourM.index);
    const prefix = beforeHour.match(/CA\s*/i);
    if (prefix == null || prefix.index === undefined)
        return null;
    const segment = beforeHour.slice(prefix.index + prefix[0].length);
    const digits = segment.match(/\d/g);
    if (!digits?.length)
        return null;
    const ca = Number.parseInt(digits.join(''), 10);
    return Number.isFinite(ca) && ca >= 1 ? ca : null;
}
function isMonthTotalLine(line) {
    return (/LÃI\s*\/\s*TỔNG\s+THÁNG/i.test(line) ||
        /TỔNG\s+LÃI\s+THÁNG/i.test(line) ||
        (/TỔNG\s+THÁNG/i.test(line) && /LÃI/i.test(line)) ||
        /LÃI\s+THÁNG/i.test(line) ||
        (/THÁNG/i.test(line) && /LÃI/i.test(line) && !/NGÀY/i.test(line)));
}
function isDayTotalLine(line) {
    return (/LÃI\s*\/\s*TỔNG\s+NGÀY/i.test(line) ||
        /TỔNG\s+LÃI\s+NGÀY/i.test(line) ||
        (/TỔNG\s+NGÀY/i.test(line) && /LÃI/i.test(line)) ||
        /LÃI\s+NGÀY/i.test(line) ||
        (/NGÀY/i.test(line) && /LÃI/i.test(line) && !/THÁNG/i.test(line)));
}
function processTongKetLine(line, caProfits, today, month, group, caCursor, dangKyLink) {
    if (isMonthTotalLine(line)) {
        return fillOrInsertTotalValue(line, formatTongKetDisplay(month, group));
    }
    if (isDayTotalLine(line)) {
        return fillOrInsertTotalValue(line, formatTongKetDisplay(today, group));
    }
    if (isCaScheduleLine(line)) {
        let caIndex = parseCaIndexFromScheduleLine(line);
        if (caIndex == null) {
            caCursor.n += 1;
            caIndex = caCursor.n;
        }
        const v = caProfits[caIndex];
        if (typeof v === 'number') {
            return insertCaLineValue(line, v, group);
        }
        return line;
    }
    const caDash = line.match(/CA\s*-\s*0*(\d+)/i);
    if (caDash) {
        const caIndex = Number.parseInt(caDash[1], 10);
        const v = caProfits[caIndex];
        if (typeof v === 'number') {
            return insertCaLineValue(line, v, group, { preferTwoCodeTail: true });
        }
        return line;
    }
    const hourSlot = line.match(/-\s*(\d{1,2})H\d{2}/i);
    if (hourSlot) {
        const hour = Number.parseInt(hourSlot[1], 10);
        const caFromHour = hour - 6;
        if (caFromHour >= 1) {
            const v = caProfits[caFromHour];
            if (typeof v === 'number') {
                return insertCaLineValue(line, v, group, { preferTwoCodeTail: true });
            }
        }
        return line;
    }
    if (/ĐĂNG\s*KÝ/i.test(line) && !/https?:\/\//i.test(line)) {
        return `${line} ${dangKyLink}`;
    }
    return line;
}
function editTongKetCaLines(text, group, groupId) {
    const normalized = text.replace(/\r\n/g, '\n');
    const caProfits = group === 'ao' && groupId
        ? getCaProfitsTodayForAoGroup(groupId)
        : group === 'that' && groupId
            ? getCaProfitsTodayForThatGroup(groupId)
            : getCaProfitsToday(group);
    const totalsFromStore = group === 'ao' && groupId
        ? getTotalsForMonthForAoGroup(groupId)
        : group === 'that' && groupId
            ? getTotalsForMonthForThatGroup(groupId)
            : getTotalsForMonth(group);
    const todayFromCas = Object.values(caProfits).reduce((acc, v) => acc + (Number.isFinite(v) ? Math.round(Number(v)) : 0), 0);
    const today = todayFromCas;
    const month = totalsFromStore.month;
    const cfgLink = String(telegram_config_1.telegramConfig.dang_ky_link ?? '').trim();
    const foundUser = text.match(/@([a-zA-Z0-9_]{4,})/);
    const inferredLink = foundUser ? `https://t.me/${foundUser[1]}` : '';
    const dangKyLink = cfgLink || inferredLink || 'https://gk881.sbs/?f=1138433';
    const caCursor = { n: 0 };
    const lines = normalized.split('\n');
    return lines
        .map((line) => processTongKetLine(line, caProfits, today, month, group, caCursor, dangKyLink))
        .join('\n');
}
