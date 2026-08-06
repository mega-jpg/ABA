import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";

const SQLITE_MAGIC = "SQLite format 3";

export interface TelethonRow {
  dc_id: number;
  server_address: string;
  port: number;
  auth_key: Buffer;
}

export type SessionSourceFormat = "gramjs" | "telethon";

export function telethonRowToGramJsString(row: TelethonRow): string {
  const dcBuffer = Buffer.from([row.dc_id]);
  const addressBuffer = Buffer.from(row.server_address);
  const addressLengthBuffer = Buffer.alloc(2);
  addressLengthBuffer.writeInt16BE(addressBuffer.length, 0);
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeInt16BE(row.port, 0);

  const payload = Buffer.concat([
    dcBuffer,
    addressLengthBuffer,
    addressBuffer,
    portBuffer,
    row.auth_key,
  ]);

  return "1" + payload.toString("base64");
}

export function isTelethonSqlite(buf: Buffer): boolean {
  return buf.subarray(0, 16).toString("utf-8").startsWith(SQLITE_MAGIC);
}

export function isGramJsStringSession(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("1") && trimmed.length > 50;
}

export function readTelethonRow(filePath: string): TelethonRow {
  const db = new Database(filePath, { readonly: true });
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get();
    if (!table) {
      throw new Error("Không phải Telethon session (thiếu bảng sessions)");
    }

    const row = db
      .prepare("SELECT dc_id, server_address, port, auth_key FROM sessions LIMIT 1")
      .get() as TelethonRow | undefined;

    if (!row?.auth_key) {
      throw new Error("Không đọc được auth_key");
    }
    return row;
  } finally {
    db.close();
  }
}

export interface ParsedSessionFile {
  id: string;
  session: string;
  format: SessionSourceFormat;
  dcId?: number;
  server?: string;
  sourceFile: string;
}

/** Đọc 1 file .session → GramJS string (Telethon hoặc GramJS text) */
export async function parseSessionFile(filePath: string): Promise<ParsedSessionFile> {
  const id = path.basename(filePath, ".session");
  const buf = await fs.readFile(filePath);

  if (isTelethonSqlite(buf)) {
    const row = readTelethonRow(filePath);
    return {
      id,
      session: telethonRowToGramJsString(row),
      format: "telethon",
      dcId: row.dc_id,
      server: `${row.server_address}:${row.port}`,
      sourceFile: filePath,
    };
  }

  const content = buf.toString("utf-8").trim();
  if (!isGramJsStringSession(content)) {
    throw new Error(`Session không hợp lệ: ${filePath}`);
  }

  return {
    id,
    session: content,
    format: "gramjs",
    sourceFile: filePath,
  };
}

export type ScanProgress = {
  current: number;
  total: number;
  file: string;
};

export async function scanSessionFiles(
  sessionsDir: string,
  onProgress?: (info: ScanProgress) => void
): Promise<ParsedSessionFile[]> {
  try {
    await fs.access(sessionsDir);
  } catch {
    return [];
  }

  const entries = await fs.readdir(sessionsDir);
  const sessionEntries = entries.filter(
    (e) => e.endsWith(".session") && !e.startsWith(".")
  );
  const results: ParsedSessionFile[] = [];
  const errors: string[] = [];

  for (let i = 0; i < sessionEntries.length; i++) {
    const entry = sessionEntries[i];
    const filePath = path.join(sessionsDir, entry);
    onProgress?.({ current: i + 1, total: sessionEntries.length, file: entry });
    try {
      results.push(await parseSessionFile(filePath));
    } catch (err) {
      errors.push(`${entry}: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    console.warn("⚠️  Một số file lỗi:");
    for (const e of errors) console.warn(`   - ${e}`);
  }

  return results.sort((a, b) => a.id.localeCompare(b.id));
}
