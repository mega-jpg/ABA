import * as fs from 'fs';
import * as path from 'path';
import { readSessionCaOverrideFromConfigFile } from './session-ca.util';

function getProjectRoot(): string {
  const norm = __dirname.replace(/\\/g, '/');
  if (norm.includes('/dist/src')) {
    return path.resolve(__dirname, '..', '..');
  }
  return path.resolve(__dirname, '..');
}

const FILE = path.join(getProjectRoot(), 'data', 'session-progress.json');

/** Các bước gửi tin Telegram đầu phiên (trước / trong findBaccaratActive). */
export type SessionTelegramStep =
  | 'bat_dau_ao'
  | 'len_ca_ao'
  | 'vao_sanh_ao'
  | 'bao_ban_ao'
  | 'cho_lenh_ao'
  | 'bat_dau_that'
  | 'len_ca_that'
  | 'vao_sanh_that'
  | 'cho_lenh_that';
  
interface SessionProgress {
  date: string;
  ca: number;
  steps: SessionTelegramStep[];
  /** Bàn đã chọn — dùng khi retry vào lại đúng bàn. */
  selectedTableName?: string;
}

function progressForCa(ca: number): SessionProgress | null {
  const today = dateKeyVN();
  const p = load();
  const caInt = Math.max(1, Math.floor(ca));
  if (!p || p.date !== today || p.ca !== caInt) return null;
  return p;
}

function dateKeyVN(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    .slice(0, 10);
}

function load(): SessionProgress | null {
  try {
    if (fs.existsSync(FILE)) {
      return JSON.parse(fs.readFileSync(FILE, 'utf8')) as SessionProgress;
    }
  } catch {
    // ignore
  }
  return null;
}

function save(state: SessionProgress): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** Retry phiên sau lỗi: config.json có session_ca_override > 0. */
export function isSessionRetry(): boolean {
  return readSessionCaOverrideFromConfigFile() > 0;
}

export function wasSessionStepDone(
  step: SessionTelegramStep,
  ca: number,
): boolean {
  if (!isSessionRetry()) return false;
  const today = dateKeyVN();
  const p = load();
  if (!p || p.date !== today || p.ca !== ca) return false;
  return p.steps.includes(step);
}

export function markSessionStepDone(
  step: SessionTelegramStep,
  ca: number,
): void {
  const today = dateKeyVN();
  const caInt = Math.max(1, Math.floor(ca));
  const prev = progressForCa(caInt) ?? load();
  const steps =
    prev && prev.date === today && prev.ca === caInt
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

/** Tên bàn đã chọn lần trước (khi retry phiên). */
export function getSessionSelectedTable(ca: number): string | null {
  if (!isSessionRetry()) return null;
  const name = progressForCa(ca)?.selectedTableName?.trim();
  return name || null;
}

export function setSessionSelectedTable(ca: number, tableName: string): void {
  const trimmed = tableName.trim();
  if (!trimmed) return;
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

export function clearSessionProgress(): void {
  try {
    if (fs.existsSync(FILE)) {
      fs.unlinkSync(FILE);
    }
  } catch {
    // ignore
  }
}
