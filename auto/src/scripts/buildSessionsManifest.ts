/**
 * Gia công toàn bộ file trong clones/sessions/*.session
 * → GramJS string → lưu clones/sessions.manifest.json
 *
 * Usage:
 *   npm run build:sessions
 *   npm run build:sessions -- --groups -1003709178070,-1003514385324
 */
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { scanSessionFiles } from "../telegram/sessionConvert";
import {
  SessionsManifest,
  SessionManifestEntry,
  GroupManifestEntry,
} from "../types/sessionsManifest";

dotenv.config();

const SESSIONS_DIR = path.resolve(
  process.env.SESSIONS_DIR ?? "./clones/sessions"
);
const OUTPUT_PATH = path.resolve(
  process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
);
const SEEDING_CONFIG_PATH = path.resolve(
  process.env.SEEDING_CONFIG ?? "./seeding.config.json"
);

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

function parseGroupsArg(): string[] | null {
  const idx = process.argv.indexOf("--groups");
  if (idx === -1 || !process.argv[idx + 1]) return null;
  return process.argv[idx + 1].split(",").map((s) => s.trim()).filter(Boolean);
}

async function resolveGroups(): Promise<GroupManifestEntry[]> {
  const fromArg = parseGroupsArg();
  if (fromArg) {
    return fromArg.map((groupId) => ({
      groupId,
      enabled: true,
    }));
  }

  const fromConfig = await loadGroupsFromSeedingConfig();
  if (fromConfig.length > 0) return fromConfig;

  return [];
}

async function main(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  console.log(`\n=== Gia công sessions ===`);
  console.log(`📂 Input : ${SESSIONS_DIR}`);
  console.log(`📄 Output: ${OUTPUT_PATH}\n`);

  const parsed = await scanSessionFiles(SESSIONS_DIR);

  if (parsed.length === 0) {
    console.log("❌ Không tìm thấy file .session nào trong clones/sessions/");
    console.log("   Đặt file Telethon/GramJS vào: clones/sessions/{id}.session");
    process.exit(1);
  }

  const groups = await resolveGroups();
  const sessions: SessionManifestEntry[] = parsed.map((p) => ({
    id: p.id,
    session: p.session,
    convertedFrom: p.format,
    sourceFile: path.relative(process.cwd(), p.sourceFile),
    dcId: p.dcId,
    server: p.server,
    enabled: true,
  }));

  const manifest: SessionsManifest = {
    generatedAt: new Date().toISOString(),
    sessionsDir: path.relative(process.cwd(), SESSIONS_DIR),
    groups,
    sessions,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(manifest, null, 2));

  console.log(`✅ Đã xử lý ${sessions.length} session:\n`);
  for (const s of sessions) {
    console.log(
      `   • ${s.id} (${s.convertedFrom}) → ${s.session.slice(0, 24)}... [${s.session.length} chars]`
    );
  }

  console.log(`\n✅ Groups (${groups.length}):`);
  if (groups.length === 0) {
    console.log("   (chưa có — thêm --groups hoặc cấu hình seeding.config.json)");
  } else {
    for (const g of groups) {
      const flag = g.enabled ? "✅" : "⬜";
      console.log(`   ${flag} ${g.groupId}${g.name ? ` — ${g.name}` : ""}`);
    }
  }

  console.log(`\n📄 Manifest: ${OUTPUT_PATH}`);
  console.log(`   Chạy sync vào config: npm run sync:manifest\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
