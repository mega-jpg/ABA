import * as fs from 'fs';
import * as path from 'path';
import { telegramConfig } from '../config/telegram.config';
import type { GameBetConfig, TongKetDisplayMode } from '../config/normalize-config';

type GroupKind = 'that' | 'ao';

function getGameBetConfig(group: GroupKind): GameBetConfig {
  const cfg = telegramConfig as Record<string, unknown>;
  const raw =
    group === 'ao'
      ? (cfg.gameBetConfigAo as Partial<GameBetConfig> | undefined)
      : (cfg.gameBetConfig as Partial<GameBetConfig> | undefined);
  return {
    betAmount: raw?.betAmount ?? 500,
    bankerOdds: raw?.bankerOdds ?? 0.95,
    playerOdds: raw?.playerOdds ?? 1,
  };
}

/** % lãi mỗi lệnh/tay (config: session.tongKetDisplay.percentPerHand). */
export function getTongKetPercentPerHand(): number {
  const n = Number(
    (telegramConfig as Record<string, unknown>).tong_ket_percent_per_hand ?? 5,
  );
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
}

/** Cách hiển thị lãi trên tin tổng kết (không đổi cách lưu/tính lãi tay). */
export function getTongKetDisplayMode(group: GroupKind): TongKetDisplayMode {
  const cfg = telegramConfig as Record<string, unknown>;
  const key = group === 'ao' ? 'tong_ket_display_ao' : 'tong_ket_display_that';
  const v = cfg[key];
  if (v === 'bet' || v === 'percent') return v;
  return group === 'ao' ? 'percent' : 'bet';
}

/** Quy đổi giá trị đã lưu → số hiển thị trên tổng kết theo mode. */
function tongKetStoredToDisplayValue(
  stored: number,
  group: GroupKind,
): number {
  const mode = getTongKetDisplayMode(group);
  const n = Math.round(Number(stored));
  if (!Number.isFinite(n)) return 0;
  const { betAmount } = getGameBetConfig(group);
  const pctStep = getTongKetPercentPerHand();

  if (group === 'ao') {
    const points = normalizeAoProfitPoints(n);
    if (mode === 'percent') return points;
    if (points === 0 || pctStep === 0) return 0;
    return Math.round((points / pctStep) * betAmount);
  }

  // Nhóm thật: lưu tiền
  if (mode === 'bet') return n;
  if (betAmount === 0) return 0;
  return Math.round((n / betAmount) * pctStep);
}

type DayProfitRow = {
  that: Record<string, number>;
  ao: Record<string, number>;
  /** Lãi tiền theo từng nhóm thật (chat id → ca → số tiền). */
  that_by_group?: Record<string, Record<string, number>>;
  /** Lãi % theo từng nhóm ảo (chat id → ca → điểm). */
  ao_by_group?: Record<string, Record<string, number>>;
};

type ProfitStore = Record<string, DayProfitRow>;

function getProjectRoot(): string {
  const norm = __dirname.replace(/\\/g, '/');
  if (norm.includes('/dist/src')) {
    return path.resolve(__dirname, '..', '..');
  }
  return path.resolve(__dirname, '..');
}

const FILE = path.join(getProjectRoot(), 'data', 'ca-profit.json');

function dateKeyVN(): string {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).slice(0, 10);
}

function ensureDir(): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore(): ProfitStore {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    const raw = fs.readFileSync(FILE, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw) as ProfitStore;
  } catch (e) {
    try {
      const backup = `${FILE}.corrupt-${Date.now()}.bak`;
      fs.copyFileSync(FILE, backup);
      console.warn(
        `[ca-profit] File ca-profit.json parse fail → đã backup sang ${backup}:`,
        e,
      );
    } catch {
      // ignore
    }
    return {};
  }
}

function saveStore(data: ProfitStore): void {
  ensureDir();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

function getMonthKey(dateStr: string): string {
  // dateStr dạng YYYY-MM-DD
  return dateStr.slice(0, 7); // YYYY-MM
}

/** Lưu lãi ca trong ngày: nhóm thật = số tiền; nhóm ảo = ±percentPerHand hoặc 0. */
export function upsertCaProfitToday(
  group: GroupKind,
  caIndex: number,
  amount: number,
): void {
  const ca = Math.floor(Number(caIndex));
  if (!Number.isFinite(ca) || ca < 1) return;
  let value = Math.round(Number(amount));
  if (!Number.isFinite(value)) return;
  if (group === 'ao') {
    value = normalizeAoProfitPoints(value);
  }

  const data = loadStore();
  const key = dateKeyVN();
  if (!data[key]) data[key] = { that: {}, ao: {} };
  data[key][group][String(ca)] = value;
  saveStore(data);
}

/** Lưu lãi ca cho một nhóm thật cụ thể (dùng khi mỗi nhóm thật đánh số tay khác nhau). */
export function upsertCaProfitForThatGroup(
  thatGroupId: string,
  caIndex: number,
  amount: number,
): void {
  const ca = Math.floor(Number(caIndex));
  if (!Number.isFinite(ca) || ca < 1) return;
  const groupId = String(thatGroupId).trim();
  if (!groupId) return;
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value)) return;

  const data = loadStore();
  const key = dateKeyVN();
  if (!data[key]) data[key] = { that: {}, ao: {} };
  if (!data[key].that_by_group) data[key].that_by_group = {};
  if (!data[key].that_by_group[groupId]) data[key].that_by_group[groupId] = {};
  data[key].that_by_group[groupId][String(ca)] = value;
  saveStore(data);
}

export function getCaProfitsTodayForThatGroup(
  thatGroupId: string,
): Record<number, number> {
  const data = loadStore();
  const key = dateKeyVN();
  const row = data[key];
  const src = row?.that_by_group?.[String(thatGroupId).trim()];
  if (!src) return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const ca = Number.parseInt(k, 10);
    if (Number.isFinite(ca) && ca >= 1 && Number.isFinite(v)) {
      out[ca] = Math.round(Number(v));
    }
  }
  return out;
}

export function getTotalsForMonthForThatGroup(thatGroupId: string): {
  today: number;
  month: number;
} {
  const data = loadStore();
  const todayKey = dateKeyVN();
  const todayMonth = getMonthKey(todayKey);
  const gid = String(thatGroupId).trim();
  let today = 0;
  let month = 0;

  for (const [dayKey, row] of Object.entries(data)) {
    const profits = row.that_by_group?.[gid];
    if (!profits) continue;
    const sum = Object.values(profits).reduce(
      (acc, v) => acc + (Number.isFinite(v) ? Math.round(Number(v)) : 0),
      0,
    );
    if (dayKey === todayKey) today = sum;
    if (getMonthKey(dayKey) === todayMonth) month += sum;
  }
  return { today, month };
}

/** Lưu lãi ca cho một nhóm ảo cụ thể (dùng khi mỗi nhóm ảo đánh số tay khác nhau). */
export function upsertCaProfitForAoGroup(
  aoGroupId: string,
  caIndex: number,
  amount: number,
): void {
  const ca = Math.floor(Number(caIndex));
  if (!Number.isFinite(ca) || ca < 1) return;
  const groupId = String(aoGroupId).trim();
  if (!groupId) return;
  const value = normalizeAoProfitPoints(Math.round(Number(amount)));

  const data = loadStore();
  const key = dateKeyVN();
  if (!data[key]) data[key] = { that: {}, ao: {} };
  if (!data[key].ao_by_group) data[key].ao_by_group = {};
  if (!data[key].ao_by_group[groupId]) data[key].ao_by_group[groupId] = {};
  data[key].ao_by_group[groupId][String(ca)] = value;
  saveStore(data);
}

export function getCaProfitsTodayForAoGroup(
  aoGroupId: string,
): Record<number, number> {
  const data = loadStore();
  const key = dateKeyVN();
  const row = data[key];
  const src = row?.ao_by_group?.[String(aoGroupId).trim()];
  if (!src) return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const ca = Number.parseInt(k, 10);
    if (Number.isFinite(ca) && ca >= 1 && Number.isFinite(v)) {
      out[ca] = normalizeAoProfitPoints(Math.round(Number(v)));
    }
  }
  return out;
}

export function getTotalsForMonthForAoGroup(aoGroupId: string): {
  today: number;
  month: number;
} {
  const data = loadStore();
  const todayKey = dateKeyVN();
  const todayMonth = getMonthKey(todayKey);
  const gid = String(aoGroupId).trim();
  let today = 0;
  let month = 0;

  for (const [dayKey, row] of Object.entries(data)) {
    const profits = row.ao_by_group?.[gid];
    if (!profits) continue;
    const sum = Object.values(profits).reduce(
      (acc, v) =>
        acc + (Number.isFinite(v) ? normalizeAoProfitPoints(Number(v)) : 0),
      0,
    );
    if (dayKey === todayKey) today = sum;
    if (getMonthKey(dayKey) === todayMonth) month += sum;
  }
  return { today, month };
}

export function getCaProfitsToday(group: GroupKind): Record<number, number> {
  const data = loadStore();
  const key = dateKeyVN();
  const row = data[key];
  if (!row) return {};
  const src = row[group];
  const out: Record<number, number> = {};
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

export function getTotalsForMonth(
  group: GroupKind,
): { today: number; month: number } {
  const data = loadStore();
  const todayKey = dateKeyVN();
  const todayMonth = getMonthKey(todayKey);

  let today = 0;
  let month = 0;

  for (const [dayKey, row] of Object.entries(data)) {
    const profits = row[group];
    const sum = Object.values(profits).reduce((acc, v) => {
      if (!Number.isFinite(v)) return acc;
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

/** Nhóm ảo — từng ca: hiện đúng tổng điểm ca (±5, ±10, ±15… hoặc +0%). */
export function formatAoDisplayPercent(value: number): string {
  return formatAoTotalSumAsPercent(normalizeAoProfitPoints(value));
}

/** Nhóm ảo — LÃI NGÀY / LÃI THÁNG / cộng dồn ca: hiện đúng tổng (vd. +155%), không ép về ±5. */
export function formatAoTotalSumAsPercent(total: number): string {
  const n = Math.round(Number(total));
  if (!Number.isFinite(n) || n === 0) return '+0%';
  return (n > 0 ? '+' : '') + String(n) + '%';
}

/**
 * Chuẩn hóa điểm 1 ca / 1 tay (±step, ±2*step…).
 * Legacy tiền bet nhầm (|n| > 500, vd. 5000) → quy về ±percentPerHand.
 * Snap theo ước chung của 5 và percentPerHand để đọc được data cũ (±5) lẫn mới (±10).
 * Tổng ngày/tháng không dùng hàm này — dùng formatAoTotalSumAsPercent.
 */
export function normalizeAoProfitPoints(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n === 0) return 0;
  const pct = getTongKetPercentPerHand();
  if (Math.abs(n) > 500) return n > 0 ? pct : -pct;
  // Ước chung lớn nhất của 5 và pct — giữ tương thích data cũ ±5 khi pct=10
  const unit = gcdPositive(5, pct);
  const steps = Math.round(n / unit);
  if (steps === 0) return 0;
  return steps * unit;
}

function gcdPositive(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  if (x === 0) return y || 1;
  if (y === 0) return x || 1;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Kết quả chốt ca theo tổng điểm (không theo tay cuối). */
export function aoSessionTotalToGameResult(
  totalPoints: number,
): 'WIN' | 'LOSE' | 'HOA' {
  const n = Math.round(Number(totalPoints));
  if (!Number.isFinite(n) || n === 0) return 'HOA';
  if (n > 0) return 'WIN';
  return 'LOSE';
}

/**
 * Điểm % nhóm ảo ghi vào ca-profit.json: thắng +percentPerHand, thua -percentPerHand, hòa 0.
 */
export function aoSessionResultToProfitPoints(
  isDraw: boolean,
  isWin: boolean,
): number {
  if (isDraw) return 0;
  const pct = getTongKetPercentPerHand();
  return isWin ? pct : -pct;
}

/** Chuẩn hóa giá trị nhóm ảo đã lưu / truyền nhầm tiền → chỉ ±percentPerHand hoặc 0. */
export function coerceAoStoredProfitPoints(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n === 0) return 0;
  const pct = getTongKetPercentPerHand();
  return n > 0 ? pct : -pct;
}

/** Số ghi ô Google Sheet tab Ảo: tổng điểm ca (5, -5, 10, -10, 0…). */
export function aoProfitPointsToSheetCell(points: number): number {
  return normalizeAoProfitPoints(points);
}

function formatThatSignedAmount(amount: number): string {
  if (amount === 0) return '+0';
  const abs = Math.abs(Math.round(amount)).toLocaleString('de-DE');
  return amount > 0 ? `+${abs}` : `-${abs}`;
}

/** Chỉ dùng khi build tin tổng kết — theo tongKetDisplay config. */
/** Hiển thị lãi theo `session.tongKetDisplay` (caption ảnh + tin tổng kết). */
export function formatTongKetDisplay(stored: number, group: GroupKind): string {
  const display = tongKetStoredToDisplayValue(stored, group);
  const mode = getTongKetDisplayMode(group);
  if (mode === 'percent') {
    return formatAoTotalSumAsPercent(display);
  }
  return formatThatSignedAmount(display);
}

function formatDisplayForGroup(value: number, group: GroupKind): string {
  return formatTongKetDisplay(value, group);
}

/** Chuyển chữ/số kiểu Mathematical Bold (𝐂𝐀 𝟏) và fullwidth về ASCII để parse. */
function normalizeFancyText(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
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

function insertBeforeLastEmoji(line: string, textToInsert: string): string {
  const trailingSpacesMatch = line.match(/\s*$/);
  const trailingSpaces = trailingSpacesMatch?.[0] ?? '';
  const core = trailingSpaces ? line.slice(0, -trailingSpaces.length) : line;
  const chars = Array.from(core);
  if (chars.length === 0) return `${line} ${textToInsert}`;

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

/** Chèn ngay trước 2 codepoint cuối (mẫu …💵%💵). */
export function insertBeforeLastTwoCodepoints(
  line: string,
  textToInsert: string,
): string {
  const trailingSpacesMatch = line.match(/\s*$/);
  const trailingSpaces = trailingSpacesMatch?.[0] ?? '';
  const core = trailingSpaces ? line.slice(0, -trailingSpaces.length) : line;
  const chars = Array.from(core);
  if (chars.length < 2) return `${core}${textToInsert}${trailingSpaces}`;
  const before = chars.slice(0, -2).join('');
  const lastTwo = chars.slice(-2).join('');
  return `${before}${textToInsert}${lastTwo}${trailingSpaces}`;
}

/** Placeholder `+%` trước emoji (tin tổng kết). */
const PERCENT_PLACEHOLDER_TAIL =
  /\+%(?=[^\n]*(\p{Extended_Pictographic}|\p{Emoji_Presentation}|💸|💥|🤑))/u;

/** Thay placeholder tổng kết: `+%`, `+  : 12.000`, `+  :` trống. */
function fillOrInsertTotalValue(line: string, display: string): string {
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

function insertCaLineValue(
  line: string,
  value: number,
  group: GroupKind,
  opts?: { preferTwoCodeTail?: boolean },
): string {
  const display = formatDisplayForGroup(value, group);
  if (PERCENT_PLACEHOLDER_TAIL.test(line) || /\+\s*%/.test(line)) {
    return fillOrInsertTotalValue(line, display);
  }
  // Mẫu `🔈 𝐂𝐚 … ⏰ ⌛⌛ ✔` → chèn ngay trước dấu ✔
  if (/[✔✓]\s*$/u.test(line)) {
    return line.replace(/([✔✓])\s*$/u, `${display} $1`);
  }
  if (opts?.preferTwoCodeTail === true && group === 'ao') {
    return insertBeforeLastTwoCodepoints(line, display);
  }
  return insertBeforeLastEmoji(line, display);
}

/**
 * Dòng lịch ca:
 * - `𝐂𝐀 𝟏 : 𝟎𝟗:𝟎𝟎 🤑`, `🟠 CA 01 ➡️ 09H15 : 🎆`, `🟠 CA 01 ✍️ 12 : 15 : 🎆`
 * - `🔈 𝐂𝐚  😡   👾  ⏰ ⌛⌛ ✔` (không số ca → đếm thứ tự dòng trong tin)
 */
function isCaScheduleLine(line: string): boolean {
  const norm = normalizeFancyText(line);
  if (!/CA/i.test(norm)) return false;
  if (/CA\s*0*\d+\s*:\s*\d{1,2}\s*:\s*\d{2}/i.test(norm)) return true;
  if (/CA\s*0*\d+\s*[➡️→>]\s*\d{1,2}H\d{2}/i.test(norm)) return true;
  if (/CA\s*0*\d+/i.test(norm) && /\d{1,2}\s*:\s*\d{2}/.test(norm)) {
    return true;
  }
  if (/\d{1,2}H\d{2}/i.test(norm) && /(💸|💥|🤑|🎆)/.test(line)) {
    return true;
  }
  // Mẫu mới: 🔈 𝐂𝐚 … ⏰/⌛ … ✔ (không có số ca / giờ chữ)
  if (/(?:🔈|⏰|⌛)/u.test(line) || /[✔✓]/u.test(line)) {
    return true;
  }
  return false;
}

/** Vd. `𝐂𝐀 𝟏 : 𝟎𝟗:𝟎𝟎` → 1; `🟠 CA 01 ➡️ 09H15` → 1; `🟠 CA 01 ✍️ 12 : 15` → 1. */
function parseCaIndexFromScheduleLine(line: string): number | null {
  const norm = normalizeFancyText(line);

  const arrowFmt = norm.match(/CA\s*0*(\d+)\s*[➡️→>]\s*\d{1,2}H\d{2}/i);
  if (arrowFmt) {
    const ca = Number.parseInt(arrowFmt[1], 10);
    if (Number.isFinite(ca) && ca >= 1) return ca;
  }

  const colonTime = norm.match(/CA\s*0*(\d+)\s*:\s*\d{1,2}\s*:\s*\d{2}/i);
  if (colonTime) {
    const ca = Number.parseInt(colonTime[1], 10);
    if (Number.isFinite(ca) && ca >= 1) return ca;
  }

  // CA 01 ✍️ 12 : 15 : 🎆 (emoji/ký tự giữa số ca và giờ)
  if (/CA\s*0*\d+/i.test(norm) && /\d{1,2}\s*:\s*\d{2}/.test(norm)) {
    const caEmojiTime = norm.match(/CA\s*0*(\d+)/i);
    if (caEmojiTime) {
      const ca = Number.parseInt(caEmojiTime[1], 10);
      if (Number.isFinite(ca) && ca >= 1) return ca;
    }
  }

  const caOnly = norm.match(/CA\s*0*(\d+)\s*:/i);
  if (caOnly) {
    const ca = Number.parseInt(caOnly[1], 10);
    if (Number.isFinite(ca) && ca >= 1) return ca;
  }

  const hourM = norm.match(/(\d{1,2})H(\d{2})/i);
  if (!hourM || hourM.index === undefined) return null;
  const beforeHour = norm.slice(0, hourM.index);
  const prefix = beforeHour.match(/CA\s*/i);
  if (prefix == null || prefix.index === undefined) return null;
  const segment = beforeHour.slice(prefix.index + prefix[0].length);
  const digits = segment.match(/\d/g);
  if (!digits?.length) return null;
  const ca = Number.parseInt(digits.join(''), 10);
  return Number.isFinite(ca) && ca >= 1 ? ca : null;
}

function isMonthTotalLine(line: string): boolean {
  return (
    /LÃI\s*\/\s*TỔNG\s+THÁNG/i.test(line) ||
    /TỔNG\s+LÃI\s+THÁNG/i.test(line) ||
    (/TỔNG\s+THÁNG/i.test(line) && /LÃI/i.test(line)) ||
    /LÃI\s+THÁNG/i.test(line) ||
    (/THÁNG/i.test(line) && /LÃI/i.test(line) && !/NGÀY/i.test(line))
  );
}

function isDayTotalLine(line: string): boolean {
  return (
    /LÃI\s*\/\s*TỔNG\s+NGÀY/i.test(line) ||
    /TỔNG\s+LÃI\s+NGÀY/i.test(line) ||
    (/TỔNG\s+NGÀY/i.test(line) && /LÃI/i.test(line)) ||
    /LÃI\s+NGÀY/i.test(line) ||
    (/NGÀY/i.test(line) && /LÃI/i.test(line) && !/THÁNG/i.test(line))
  );
}

function processTongKetLine(
  line: string,
  caProfits: Record<number, number>,
  today: number,
  month: number,
  group: GroupKind,
  caCursor: { n: number },
  dangKyLink: string,
): string {
  if (isMonthTotalLine(line)) {
    return fillOrInsertTotalValue(line, formatTongKetDisplay(month, group));
  }
  if (isDayTotalLine(line)) {
    return fillOrInsertTotalValue(line, formatTongKetDisplay(today, group));
  }

  // Dòng lịch ca: có số CA rõ hoặc 👍𝐂a … 11H30 :💸 (không số ca → đếm thứ tự trong tin)
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

/**
 * Chèn lãi theo ca / tổng ngày / tổng tháng vào text tin tổng kết.
 * Nhóm ảo: từng ca ±percentPerHand% / +0%; LÃI ngày/tháng = tổng điểm thực. Nhóm thật: số tiền.
 */
export function editTongKetCaLines(
  text: string,
  group: GroupKind,
  groupId?: string,
): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const caProfits =
    group === 'ao' && groupId
      ? getCaProfitsTodayForAoGroup(groupId)
      : group === 'that' && groupId
        ? getCaProfitsTodayForThatGroup(groupId)
        : getCaProfitsToday(group);
  const totalsFromStore =
    group === 'ao' && groupId
      ? getTotalsForMonthForAoGroup(groupId)
      : group === 'that' && groupId
        ? getTotalsForMonthForThatGroup(groupId)
        : getTotalsForMonth(group);
  // LÃI NGÀY = tổng các ca đã hiển thị (khớp dòng CA 1..18)
  const todayFromCas = Object.values(caProfits).reduce(
    (acc, v) => acc + (Number.isFinite(v) ? Math.round(Number(v)) : 0),
    0,
  );
  const today = todayFromCas;
  const month = totalsFromStore.month;
  const cfgLink = String(
    (telegramConfig as Record<string, unknown>).dang_ky_link ?? '',
  ).trim();
  const foundUser = text.match(/@([a-zA-Z0-9_]{4,})/);
  const inferredLink = foundUser ? `https://t.me/${foundUser[1]}` : '';
  const dangKyLink =
    cfgLink || inferredLink || 'https://gk881.sbs/?f=1138433';
  const caCursor = { n: 0 };
  const lines = normalized.split('\n');
  return lines
    .map((line) =>
      processTongKetLine(
        line,
        caProfits,
        today,
        month,
        group,
        caCursor,
        dangKyLink,
      ),
    )
    .join('\n');
}
