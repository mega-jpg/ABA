import fs from "fs/promises";
import path from "path";
import { ProxyConfig } from "../types/seeding";
import { loadSeedingConfig, resolveSessionFilePath, getEnabledClones } from "../services/seedingConfig";
export interface CloneMeta {
  /** GramJS StringSession — chuỗi bắt đầu bằng "1" */
  session?: string;
  proxy?: ProxyConfig;
  phone?: string;
  label?: string;
}

export interface ResolvedSession {
  session: string;
  proxy?: ProxyConfig;
  source: "session-file" | "json-meta" | "seeding-config" | "sessions-manifest";
}

const SQLITE_MAGIC = "SQLite format 3";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readMetaFile(metaPath: string): Promise<CloneMeta | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf-8")) as CloneMeta;
  } catch {
    return null;
  }
}

/** Đọc session GramJS từ file text .session */
async function readSessionFile(sessionPath: string): Promise<string> {
  const buf = await fs.readFile(sessionPath);
  const head = buf.subarray(0, 16).toString("utf-8");

  if (head.startsWith(SQLITE_MAGIC)) {
    throw new Error(
      "File .session dạng Telethon (SQLite). GramJS cần StringSession — " +
        "export lại chuỗi session hoặc dùng clones/{id}.json với field \"session\""
    );
  }

  const content = buf.toString("utf-8").trim();
  if (!content) {
    throw new Error("File .session rỗng");
  }
  if (!content.startsWith("1")) {
    throw new Error(
      "Session không hợp lệ — GramJS StringSession thường bắt đầu bằng '1'"
    );
  }
  return content;
}

/**
 * Load session cho 1 clone theo thứ tự ưu tiên:
 * 1. clones/sessions.manifest.json
 * 2. seeding.config.json
 * 3. clones/{id}.session
 * 4. clones/{id}.json
 */
export async function resolveCloneSession(
  cloneId: string,
  clonesDir: string
): Promise<ResolvedSession> {
  // 1. Từ sessions.manifest.json
  try {
    const manifestPath = path.resolve(
      process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
    );
    if (await fileExists(manifestPath)) {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
        sessions?: Array<{ id: string; session: string; enabled?: boolean }>;
      };
      const entry = manifest.sessions?.find(
        (s) => s.id === cloneId && s.enabled !== false
      );
      if (entry?.session) {
        return { session: entry.session.trim(), source: "sessions-manifest" };
      }
    }
  } catch {
    // fallback
  }

  // 2. Từ seeding.config.json
  try {
   
    const cfg = await loadSeedingConfig();
    const cloneCfg = cfg.clones.find((c) => c.id === cloneId);
    if (cloneCfg) {
      if (cloneCfg.session?.trim()) {
        return {
          session: cloneCfg.session.trim(),
          proxy: cloneCfg.proxy,
          source: "seeding-config",
        };
      }
      const cfgSessionPath = resolveSessionFilePath(cloneCfg);
      if (cfgSessionPath && (await fileExists(cfgSessionPath))) {
        const session = await readSessionFile(cfgSessionPath);
        return { session, proxy: cloneCfg.proxy, source: "seeding-config" };
      }
    }
  } catch {
    // seeding.config.json không có hoặc clone không trong config → fallback
  }

  const sessionPath = path.join(clonesDir, `${cloneId}.session`);
  const metaPath = path.join(clonesDir, `${cloneId}.json`);

  if (await fileExists(sessionPath)) {
    const session = await readSessionFile(sessionPath);
    const meta = await readMetaFile(metaPath);
    return { session, proxy: meta?.proxy, source: "session-file" };
  }

  const meta = await readMetaFile(metaPath);
  if (meta?.session?.trim()) {
    return {
      session: meta.session.trim(),
      proxy: meta.proxy,
      source: "json-meta",
    };
  }

  throw new Error(
    `Clone "${cloneId}" chưa có session. Thêm vào seeding.config.json hoặc clones/${cloneId}.session`
  );
}

/** Liệt kê cloneId từ manifest + seeding.config + thư mục clones/ */
export async function listCloneIds(clonesDir: string): Promise<string[]> {
  const ids = new Set<string>();

  try {
    const manifestPath = path.resolve(
      process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
    );
    if (await fileExists(manifestPath)) {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
        sessions?: Array<{ id: string; enabled?: boolean }>;
      };
      for (const s of manifest.sessions ?? []) {
        if (s.enabled !== false) ids.add(s.id);
      }
    }
  } catch {
    // không có manifest
  }

  try {
    
    const cfg = await loadSeedingConfig();
    for (const c of getEnabledClones(cfg)) {
      ids.add(c.id);
    }
  } catch {
    // không có config file
  }

  await fs.mkdir(clonesDir, { recursive: true });
  const entries = await fs.readdir(clonesDir);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const match = entry.match(/^(.+)\.(session|json)$/);
    if (match) ids.add(match[1]);
  }

  const valid: string[] = [];
  for (const id of ids) {
    try {
      await resolveCloneSession(id, clonesDir);
      valid.push(id);
    } catch {
      // bỏ qua
    }
  }
  return valid.sort();
}
