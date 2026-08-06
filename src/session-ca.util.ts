import * as fs from 'fs';
import * as path from 'path';
import {
  setSessionCaOverrideInConfigFile,
  readSessionCaOverrideFromConfigFile as readOverrideFromDisk,
} from '../config/telegram.config';

/**
 * Root project: tránh PM2 / script chạy với cwd khác thư mục repo → persist và getSessionCa
 * đọc/ghi hai file session-ca.json khác nhau, hoặc không ghi được → date cũ → mỗi lần chạy bị coi là
 * sang ngày mới và ca nhảy về 1.
 *
 * - Build: .../dist/src/*.js  → root = .../
 * - Dev:   .../src/*.ts      → root = .../
 */
function getProjectRoot(): string {
  const norm = __dirname.replace(/\\/g, '/');
  if (norm.includes('/dist/src')) {
    return path.resolve(__dirname, '..', '..');
  }
  return path.resolve(__dirname, '..');
}


const FILE = path.join(getProjectRoot(), 'data', 'session-ca.json');

interface CaState {
  date: string;
  /** Ca sẽ dùng cho lần chạy tiếp theo (1..so_ca). */
  nextCa: number;
}

function dateKeyVN(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
    .slice(0, 10);
}

function load(): CaState | null {
  try {
    if (fs.existsSync(FILE)) {
      return JSON.parse(fs.readFileSync(FILE, 'utf8')) as CaState;
    }
  } catch {
    // ignore
  }
  return null;
}

function save(state: CaState): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Ca dùng cho lần chạy này (1-based). Sang ngày mới (VN) reset về 1.
 */
export function getSessionCa(soCa: number): number {
  const today = dateKeyVN();
  const n = Math.max(1, Math.floor(soCa));
  if (n < 1) return 1;

  const prev = load();
  if (!prev || prev.date !== today) {
    if (prev && prev.date !== today) {
      console.warn(
        `[session-ca] date trong file (${prev.date}) ≠ hôm nay VN (${today}) → reset ca 1 (sang ngày mới). File: ${FILE}`,
      );
    }
    save({ date: today, nextCa: 1 });
    return 1;1
  }
  const raw = prev.nextCa ?? 1;
  return Math.min(Math.max(1, raw), n);
}

/** Sau khi gửi tin lệnh ca thành công: ca tiếp theo = ca vừa dùng + 1, sau so_ca quay về 1. */
export function persistNextSessionCa(soCa: number, usedCa: number): void {
  const today = dateKeyVN();
  const n = Math.max(1, Math.floor(soCa));
  const u = Math.min(Math.max(1, usedCa), n);
  const next = u >= n ? 1 : u + 1;
  save({ date: today, nextCa: next });
}

/**
 * Ghi `session_ca_override: 0` vào config.json và object đang chạy (sau khi chạy thủ công đúng ca).
 */
export function resetSessionCaOverrideInConfig(): void {
  try {
    setSessionCaOverrideInConfigFile(0);
  } catch (e) {
    console.warn(
      '[session-ca] Không thể đặt session_ca_override về 0 trong config.json:',
      e,
    );
  }
}

/**
 * Khi lỗi giữa chừng: giữ lại đúng ca hiện tại cho lần restart kế tiếp.
 */
export function setSessionCaOverrideInConfig(ca: number): void {
  const caInt = Math.floor(Number(ca));
  if (!Number.isFinite(caInt) || caInt <= 0) return;
  try {
    setSessionCaOverrideInConfigFile(caInt);
  } catch (e) {
    console.warn(
      `[session-ca] Không thể set session_ca_override=${caInt} trong config.json:`,
      e,
    );
  }
}

/**
 * Đọc session_ca_override trực tiếp từ config.json mỗi lần gọi — process chạy lâu (cron)
 * vẫn thấy giá trị mới sau khi bạn sửa tay; không dùng telegramConfig cache lúc import.
 */
export function readSessionCaOverrideFromConfigFile(): number {
  return readOverrideFromDisk();
}

/** Sang ngày mới (VN): reset ca 1, xóa override retry hôm qua. */
export function resetSessionStateOnNewDay(): void {
  const today = dateKeyVN();
  const prev = load();
  if (!prev || prev.date !== today) {
    save({ date: today, nextCa: 1 });
    if (readOverrideFromDisk() > 0) {
      resetSessionCaOverrideInConfig();
      console.log(
        `[session-ca] Sang ngày mới (${today}) → ca 1, session_ca_override về 0`,
      );
    }
  }
}
