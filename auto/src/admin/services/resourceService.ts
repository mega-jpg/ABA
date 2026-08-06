import fs from "fs/promises";
import path from "path";
import { CloneInfo, GroupInfo } from "../../types/customScenario";
import { SessionsManifest } from "../../types/sessionsManifest";
import { DeadSessionsFile } from "../../types/deadSessions";

const DEAD_IDS_PATH = path.resolve("./clones/.dead-clones.json");
const DEAD_SESSIONS_PATH = path.resolve(
  process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json"
);

/** ID session đã chết — từ .dead-clones.json và sessions.dead.json */
export async function loadDeadCloneIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    const raw = await fs.readFile(DEAD_IDS_PATH, "utf-8");
    for (const id of JSON.parse(raw) as string[]) {
      if (id) ids.add(id);
    }
  } catch {
    /* chưa có file */
  }

  try {
    const raw = await fs.readFile(DEAD_SESSIONS_PATH, "utf-8");
    const dead = JSON.parse(raw) as DeadSessionsFile;
    for (const s of dead.sessions ?? []) {
      if (s.id) ids.add(s.id);
    }
  } catch {
    /* chưa có file */
  }

  return ids;
}

export async function listClones(): Promise<CloneInfo[]> {
  const dead = await loadDeadCloneIds();
  const manifestPath = path.resolve(
    process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
  );

  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as SessionsManifest;
    return manifest.sessions
      .filter((s) => s.enabled && !dead.has(s.id))
      .map((s) => ({
        id: s.id,
        label: s.firstName ?? s.username ?? s.id,
        enabled: true,
      }));
  } catch {
    const cfgPath = path.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
    try {
      const cfg = JSON.parse(await fs.readFile(cfgPath, "utf-8")) as {
        clones?: Array<{ id: string; label?: string; enabled?: boolean }>;
      };
      return (cfg.clones ?? [])
        .filter((c) => c.enabled !== false && !dead.has(c.id))
        .map((c) => ({ id: c.id, label: c.label ?? c.id, enabled: true }));
    } catch {
      return [];
    }
  }
}

export async function listGroups(): Promise<GroupInfo[]> {
  const cfgPath = path.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
  try {
    const cfg = JSON.parse(await fs.readFile(cfgPath, "utf-8")) as {
      groups?: Array<{
        id: string;
        name?: string;
        enabled?: boolean;
        inviteLink?: string;
      }>;
    };
    return (cfg.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name ?? g.id,
      enabled: g.enabled !== false,
      inviteLink: g.inviteLink,
    }));
  } catch {
    return [];
  }
}
