import fs from "fs/promises";
import path from "path";
import { SeedingConfigFile, CloneConfig } from "../types/seedingConfig";
import { config } from "../config";

const DEFAULT_CONFIG_PATH = path.resolve(
  process.env.SEEDING_CONFIG ?? "./seeding.config.json"
);

let cached: SeedingConfigFile | null = null;

export function getSeedingConfigPath(): string {
  return DEFAULT_CONFIG_PATH;
}

export async function loadSeedingConfig(): Promise<SeedingConfigFile> {
  if (cached) return cached;

  const raw = await fs.readFile(DEFAULT_CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as SeedingConfigFile;
  validateSeedingConfig(parsed);
  cached = parsed;
  return parsed;
}

export function clearSeedingConfigCache(): void {
  cached = null;
}

function validateSeedingConfig(cfg: SeedingConfigFile): void {
  if (!cfg.clones?.length) {
    throw new Error("seeding.config.json: cần ít nhất 1 clone");
  }
  if (!cfg.groups?.length) {
    throw new Error("seeding.config.json: cần ít nhất 1 group");
  }
  if (!["preset", "random"].includes(cfg.mode)) {
    throw new Error('seeding.config.json: mode phải là "preset" hoặc "random"');
  }
}

export function getEnabledClones(cfg: SeedingConfigFile): CloneConfig[] {
  return cfg.clones.filter((c) => c.enabled);
}

export function getEnabledGroups(cfg: SeedingConfigFile) {
  return cfg.groups.filter((g) => g.enabled);
}

export function resolveTargetGroupId(cfg: SeedingConfigFile): string {
  if (cfg.target.groupId) {
    return cfg.target.groupId;
  }

  const groups = getEnabledGroups(cfg);
  if (groups.length === 0) {
    throw new Error("Không có group enabled nào trong config");
  }

  if (cfg.target.pickGroup === "random") {
    return groups[Math.floor(Math.random() * groups.length)].id;
  }

  return groups[0].id;
}

/** Resolve session path tuyệt đối từ clone config */
export function resolveSessionFilePath(clone: CloneConfig): string | null {
  if (clone.sessionFile) {
    return path.isAbsolute(clone.sessionFile)
      ? clone.sessionFile
      : path.resolve(clone.sessionFile);
  }
  // fallback: clones/{id}.session
  return path.join(config.clonesDir, `${clone.id}.session`);
}
