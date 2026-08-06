import fs from "fs/promises";
import path from "path";
import { scanSessionFiles, parseSessionFile } from "../../telegram/sessionConvert";
import { validateSessionsBatch } from "../../telegram/sessionValidator";
import {
  SessionsManifest,
  SessionManifestEntry,
  GroupManifestEntry,
} from "../../types/sessionsManifest";
import { DeadSessionsFile } from "../../types/deadSessions";

const SESSIONS_DIR = path.resolve(
  process.env.SESSIONS_DIR ?? "./clones/sessions"
);
const MANIFEST_PATH = path.resolve(
  process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
);
const DEAD_PATH = path.resolve(
  process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json"
);
const DEAD_IDS_PATH = path.resolve("./clones/.dead-clones.json");
const SEEDING_CONFIG_PATH = path.resolve(
  process.env.SEEDING_CONFIG ?? "./seeding.config.json"
);

export interface ImportFileInput {
  name: string;
  /** base64 */
  content: string;
}

export interface SessionStats {
  sessionsDir: string;
  pendingFiles: string[];
  manifest: {
    exists: boolean;
    generatedAt?: string;
    total: number;
    sessions: SessionManifestEntry[];
  };
  dead: {
    total: number;
    sessions: DeadSessionsFile["sessions"];
  };
}

function normalizeSessionFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w+.-]/g, "_");
  const lower = base.toLowerCase();
  if (lower.endsWith(".session")) return base;
  if (lower.endsWith(".tho")) return base.slice(0, -4) + ".session";
  return base + ".session";
}

async function loadGroupsFromSeedingConfig(): Promise<GroupManifestEntry[]> {
  try {
    const raw = await fs.readFile(SEEDING_CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw) as {
      groups?: Array<{
        id: string;
        name?: string;
        enabled?: boolean;
        inviteLink?: string;
        username?: string;
      }>;
    };
    return (cfg.groups ?? []).map((g) => ({
      groupId: g.id,
      name: g.name,
      enabled: g.enabled !== false,
      inviteLink: g.inviteLink,
      username: g.username,
    }));
  } catch {
    return [];
  }
}

async function loadManifest(): Promise<SessionsManifest | null> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw) as SessionsManifest;
  } catch {
    return null;
  }
}

async function loadDeadFile(): Promise<DeadSessionsFile> {
  try {
    const raw = await fs.readFile(DEAD_PATH, "utf-8");
    return JSON.parse(raw) as DeadSessionsFile;
  } catch {
    return { updatedAt: "", total: 0, sessions: [] };
  }
}

export async function getSessionStats(): Promise<SessionStats> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  const dirEntries = await fs.readdir(SESSIONS_DIR);
  const sessionFiles = dirEntries.filter(
    (e) =>
      (e.endsWith(".session") || e.endsWith(".tho")) && !e.startsWith(".")
  );

  const manifest = await loadManifest();
  const inManifest = new Set(
    (manifest?.sessions ?? []).map((s) => path.basename(s.sourceFile))
  );

  const pendingFiles = sessionFiles.filter((f) => !inManifest.has(f));

  const dead = await loadDeadFile();

  return {
    sessionsDir: path.relative(process.cwd(), SESSIONS_DIR),
    pendingFiles,
    manifest: {
      exists: manifest !== null,
      generatedAt: manifest?.generatedAt,
      total: manifest?.sessions.length ?? 0,
      sessions: manifest?.sessions ?? [],
    },
    dead: {
      total: dead.total,
      sessions: dead.sessions,
    },
  };
}

export async function importSessionFiles(
  files: ImportFileInput[]
): Promise<{ saved: string[]; errors: string[] }> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const saved: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const filename = normalizeSessionFilename(file.name);
    const dest = path.join(SESSIONS_DIR, filename);
    try {
      const buf = Buffer.from(file.content, "base64");
      if (buf.length === 0) {
        errors.push(`${file.name}: file rỗng`);
        continue;
      }
      await fs.writeFile(dest, buf);
      // validate có parse được không
      await parseSessionFile(dest);
      saved.push(filename);
    } catch (err) {
      errors.push(`${file.name}: ${(err as Error).message}`);
      try {
        await fs.unlink(dest);
      } catch {
        /* ignore */
      }
    }
  }

  return { saved, errors };
}

export type SessionProgress = {
  phase: string;
  current: number;
  total: number;
  detail?: string;
  alive?: number;
  dead?: number;
};

export async function buildSessionsManifest(
  onProgress?: (p: SessionProgress) => void
): Promise<{
  count: number;
  sessions: Array<{ id: string; format: string; preview: string }>;
  manifestPath: string;
}> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  onProgress?.({ phase: "Quét file session", current: 0, total: 0 });
  const parsed = await scanSessionFiles(SESSIONS_DIR, (info) => {
    onProgress?.({
      phase: "Convert GramJS",
      current: info.current,
      total: info.total,
      detail: info.file,
    });
  });

  if (parsed.length === 0) {
    throw new Error(
      "Không có file .session/.tho trong clones/sessions/ — import trước"
    );
  }

  const existing = await loadManifest();
  const groups =
    existing?.groups?.length ? existing.groups : await loadGroupsFromSeedingConfig();

  const sessions: SessionManifestEntry[] = parsed.map((p) => {
    const prev = existing?.sessions.find((s) => s.id === p.id);
    return {
      id: p.id,
      session: p.session,
      convertedFrom: p.format,
      sourceFile: path.relative(process.cwd(), p.sourceFile),
      dcId: p.dcId,
      server: p.server,
      enabled: prev?.enabled ?? true,
      userId: prev?.userId,
      username: prev?.username,
      firstName: prev?.firstName,
    };
  });

  const manifest: SessionsManifest = {
    generatedAt: new Date().toISOString(),
    sessionsDir: path.relative(process.cwd(), SESSIONS_DIR),
    groups,
    sessions,
  };

  onProgress?.({
    phase: "Ghi manifest",
    current: sessions.length,
    total: sessions.length,
    detail: path.basename(MANIFEST_PATH),
  });

  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  return {
    count: sessions.length,
    sessions: parsed.map((p) => ({
      id: p.id,
      format: p.format,
      preview: p.session.slice(0, 28) + "...",
    })),
    manifestPath: path.relative(process.cwd(), MANIFEST_PATH),
  };
}

export async function filterDeadSessions(options?: {
  concurrency?: number;
  onProgress?: (p: SessionProgress) => void;
}): Promise<{
  alive: number;
  dead: number;
  deadList: DeadSessionsFile["sessions"];
  aliveList: Array<{ id: string; firstName?: string; username?: string }>;
}> {
  const concurrency = options?.concurrency ?? 3;
  const onProgress = options?.onProgress;
  let manifest = await loadManifest();

  if (!manifest || manifest.sessions.length === 0) {
    onProgress?.({ phase: "Gia công manifest trước khi lọc", current: 0, total: 0 });
    const parsed = await scanSessionFiles(SESSIONS_DIR);
    if (parsed.length === 0) {
      throw new Error("Chưa có session — import và gia công trước");
    }
    await buildSessionsManifest(onProgress);
    manifest = await loadManifest();
    if (!manifest) throw new Error("Không tạo được manifest");
  }

  const checkItems = manifest.sessions.map((s) => ({
    id: s.id,
    session: s.session,
  }));

  const alive: SessionManifestEntry[] = [];
  const dead: DeadSessionsFile["sessions"] = [];
  const delayMs = 1500;
  const total = checkItems.length;
  let checked = 0;

  onProgress?.({
    phase: "Kiểm tra Telegram API",
    current: 0,
    total,
    alive: 0,
    dead: 0,
  });

  for (let i = 0; i < checkItems.length; i += concurrency) {
    const batch = checkItems.slice(i, i + concurrency);
    onProgress?.({
      phase: "Kiểm tra Telegram API",
      current: checked,
      total,
      detail: batch.map((b) => b.id).join(", "),
      alive: alive.length,
      dead: dead.length,
    });

    const results = await validateSessionsBatch(batch, {
      concurrency,
      delayMs: 0,
    });

    for (const r of results) {
      const original = manifest.sessions.find((s) => s.id === r.id)!;
      if (r.alive) {
        alive.push({
          ...original,
          enabled: true,
          userId: r.userId,
          username: r.username,
          firstName: r.firstName,
        });
      } else {
        dead.push({
          id: r.id,
          reason: r.reason ?? "UNKNOWN",
          checkedAt: new Date().toISOString(),
          sourceFile: original.sourceFile,
        });
      }
    }

    checked += batch.length;
    onProgress?.({
      phase: "Kiểm tra Telegram API",
      current: checked,
      total,
      alive: alive.length,
      dead: dead.length,
    });

    if (i + concurrency < checkItems.length) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  onProgress?.({
    phase: "Lưu kết quả",
    current: total,
    total,
    alive: alive.length,
    dead: dead.length,
  });

  const filteredManifest: SessionsManifest = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    sessions: alive,
  };

  const deadFile: DeadSessionsFile = {
    updatedAt: new Date().toISOString(),
    total: dead.length,
    sessions: dead,
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(filteredManifest, null, 2));

  const prevDead = await loadDeadFile();
  const mergedDead = [
    ...prevDead.sessions.filter((d) => !dead.some((n) => n.id === d.id)),
    ...dead,
  ];
  deadFile.sessions = mergedDead;
  deadFile.total = mergedDead.length;
  await fs.writeFile(DEAD_PATH, JSON.stringify(deadFile, null, 2));

  const existingDead: string[] = JSON.parse(
    await fs.readFile(DEAD_IDS_PATH, "utf-8").catch(() => "[]")
  );
  const allDead = [...new Set([...existingDead, ...dead.map((d) => d.id)])];
  await fs.writeFile(DEAD_IDS_PATH, JSON.stringify(allDead, null, 2));

  return {
    alive: alive.length,
    dead: dead.length,
    deadList: dead,
    aliveList: alive.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      username: s.username,
    })),
  };
}

export async function syncManifestToConfig(): Promise<{
  clones: number;
  groups: number;
}> {
  const manifest = await loadManifest();
  if (!manifest) throw new Error("Chưa có manifest — gia công trước");

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await fs.readFile(SEEDING_CONFIG_PATH, "utf-8"));
  } catch {
    config = {
      mode: "preset",
      interaction: { preset: { name: "", steps: [] }, random: {} },
    };
  }

  config.clones = manifest.sessions
    .filter((s) => s.enabled)
    .map((s) => ({
      id: s.id,
      enabled: true,
      session: s.session,
      label: s.firstName ?? s.username ?? s.id,
    }));

  config.groups = manifest.groups.map((g) => ({
    id: g.groupId,
    name: g.name ?? g.groupId,
    enabled: g.enabled,
    inviteLink: g.inviteLink,
  }));

  const enabledGroups = manifest.groups.filter((g) => g.enabled);
  if (enabledGroups.length > 0) {
    config.target = {
      groupId: enabledGroups[0].groupId,
      pickGroup: "first",
    };
  }

  await fs.writeFile(SEEDING_CONFIG_PATH, JSON.stringify(config, null, 2));

  return {
    clones: manifest.sessions.length,
    groups: manifest.groups.length,
  };
}
