/**
 * Đồng bộ clones/sessions.manifest.json → seeding.config.json
 * Usage: npm run sync:manifest
 */
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { SessionsManifest } from "../types/sessionsManifest";

dotenv.config();

const MANIFEST_PATH = path.resolve(
  process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
);
const SEEDING_CONFIG_PATH = path.resolve(
  process.env.SEEDING_CONFIG ?? "./seeding.config.json"
);

async function main(): Promise<void> {
  const manifestRaw = await fs.readFile(MANIFEST_PATH, "utf-8");
  const manifest = JSON.parse(manifestRaw) as SessionsManifest;

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await fs.readFile(SEEDING_CONFIG_PATH, "utf-8"));
  } catch {
    config = { mode: "preset", interaction: { preset: { name: "", steps: [] }, random: {} } };
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
  }));

  const enabledGroups = manifest.groups.filter((g) => g.enabled);
  if (enabledGroups.length > 0) {
    config.target = {
      groupId: enabledGroups[0].groupId,
      pickGroup: "first",
    };
  }

  await fs.writeFile(SEEDING_CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log(`\n✅ Đã sync manifest → seeding.config.json`);
  console.log(`   Clones : ${manifest.sessions.length}`);
  console.log(`   Groups : ${manifest.groups.length}`);
  console.log(`\n   Preview: npm run config:preview`);
  console.log(`   Chạy   : npm run run:once\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
