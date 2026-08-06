import fs from "fs/promises";
import path from "path";
import { CloneAccount } from "../types/seeding";
import { config } from "../config";
import { listCloneIds, resolveCloneSession } from "../telegram/sessionLoader";

const DEAD_CLONES_FILE = path.join(config.clonesDir, ".dead-clones.json");

let deadClones = new Set<string>();

export async function loadDeadClones(): Promise<void> {
  try {
    const raw = await fs.readFile(DEAD_CLONES_FILE, "utf-8");
    const ids: string[] = JSON.parse(raw);
    deadClones = new Set(ids);
  } catch {
    deadClones = new Set();
  }
}

export async function markCloneAsDead(cloneId: string): Promise<void> {
  deadClones.add(cloneId);
  await fs.mkdir(config.clonesDir, { recursive: true });
  await fs.writeFile(DEAD_CLONES_FILE, JSON.stringify([...deadClones], null, 2));
  console.warn(`[CloneStore] Nick ${cloneId} đã bị đánh dấu DEAD`);
}

export function isCloneDead(cloneId: string): boolean {
  return deadClones.has(cloneId);
}

export async function loadCloneAccounts(): Promise<CloneAccount[]> {
  await loadDeadClones();

  const ids = await listCloneIds(config.clonesDir);
  const accounts: CloneAccount[] = [];

  for (const id of ids) {
    if (deadClones.has(id)) continue;

    try {
      const resolved = await resolveCloneSession(id, config.clonesDir);
      accounts.push({
        id,
        session: resolved.session,
        proxy: resolved.proxy,
        status: "active",
      });
    } catch (err) {
      console.warn(`[CloneStore] Bỏ qua ${id}:`, (err as Error).message);
    }
  }

  return accounts;
}

export async function getCloneAccount(cloneId: string): Promise<CloneAccount | null> {
  if (isCloneDead(cloneId)) return null;

  try {
    const resolved = await resolveCloneSession(cloneId, config.clonesDir);
    return {
      id: cloneId,
      session: resolved.session,
      proxy: resolved.proxy,
      status: "active",
    };
  } catch {
    return null;
  }
}
