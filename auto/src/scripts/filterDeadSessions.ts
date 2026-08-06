/**
 * Lọc session chết — chỉ giữ nick còn sống trong manifest
 *
 * Usage:
 *   npm run filter:sessions
 *   npm run filter:sessions -- --concurrency 5
 */
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { validateSessionsBatch } from "../telegram/sessionValidator";
import { SessionsManifest, SessionManifestEntry } from "../types/sessionsManifest";
import { DeadSessionsFile } from "../types/deadSessions";
import { scanSessionFiles } from "../telegram/sessionConvert";

dotenv.config();

const MANIFEST_PATH = path.resolve(
  process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json"
);
const DEAD_PATH = path.resolve(
  process.env.SESSIONS_DEAD ?? "./clones/sessions.dead.json"
);
const SESSIONS_DIR = path.resolve(
  process.env.SESSIONS_DIR ?? "./clones/sessions"
);

function parseConcurrency(): number {
  const idx = process.argv.indexOf("--concurrency");
  if (idx !== -1 && process.argv[idx + 1]) {
    return Math.max(1, parseInt(process.argv[idx + 1], 10));
  }
  return 3;
}

async function loadOrBuildManifest(): Promise<SessionsManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw) as SessionsManifest;
  } catch {
    console.log("📦 Chưa có manifest — build từ clones/sessions/ trước...");
    const parsed = await scanSessionFiles(SESSIONS_DIR);
    if (parsed.length === 0) {
      throw new Error("Không có session nào trong clones/sessions/");
    }
    return {
      generatedAt: new Date().toISOString(),
      sessionsDir: path.relative(process.cwd(), SESSIONS_DIR),
      groups: [],
      sessions: parsed.map((p) => ({
        id: p.id,
        session: p.session,
        convertedFrom: p.format,
        sourceFile: path.relative(process.cwd(), p.sourceFile),
        dcId: p.dcId,
        server: p.server,
        enabled: true,
      })),
    };
  }
}

async function main(): Promise<void> {
  const concurrency = parseConcurrency();
  const manifest = await loadOrBuildManifest();
  const total = manifest.sessions.length;

  console.log(`\n=== Lọc session chết ===`);
  console.log(`📋 Tổng session cần check: ${total}`);
  console.log(`⚙️  Concurrency: ${concurrency} (tránh FLOOD_WAIT)\n`);

  const checkItems = manifest.sessions.map((s) => ({
    id: s.id,
    session: s.session,
  }));

  let checked = 0;
  const alive: SessionManifestEntry[] = [];
  const dead: DeadSessionsFile["sessions"] = [];

  // Check từng batch và in progress
  const batchSize = concurrency;
  const delayMs = 1500;

  for (let i = 0; i < checkItems.length; i += batchSize) {
    const batch = checkItems.slice(i, i + batchSize);
    const results = await validateSessionsBatch(batch, { concurrency: batchSize, delayMs: 0 });

    for (const r of results) {
      checked++;
      const original = manifest.sessions.find((s) => s.id === r.id)!;

      if (r.alive) {
        alive.push({
          ...original,
          enabled: true,
          userId: r.userId,
          username: r.username,
          firstName: r.firstName,
        });
        const name = r.firstName ?? r.username ?? r.userId ?? "";
        console.log(`✅ [${checked}/${total}] ${r.id} — sống ${name ? `(${name})` : ""}`);
      } else {
        dead.push({
          id: r.id,
          reason: r.reason ?? "UNKNOWN",
          checkedAt: new Date().toISOString(),
          sourceFile: original.sourceFile,
        });
        console.log(`💀 [${checked}/${total}] ${r.id} — CHẾT: ${r.reason}`);
      }
    }

    if (i + batchSize < checkItems.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

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

  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(filteredManifest, null, 2));
  await fs.writeFile(DEAD_PATH, JSON.stringify(deadFile, null, 2));

  // Đồng bộ vào .dead-clones.json cho worker
  const deadIdsPath = path.resolve("./clones/.dead-clones.json");
  const existingDead: string[] = JSON.parse(
    await fs.readFile(deadIdsPath, "utf-8").catch(() => "[]")
  );
  const allDead = [...new Set([...existingDead, ...dead.map((d) => d.id)])];
  await fs.writeFile(deadIdsPath, JSON.stringify(allDead, null, 2));

  console.log(`\n=== Kết quả ===`);
  console.log(`✅ Sống : ${alive.length}`);
  console.log(`💀 Chết : ${dead.length}`);
  console.log(`📄 Manifest (chỉ nick sống): ${MANIFEST_PATH}`);
  console.log(`📄 Danh sách chết        : ${DEAD_PATH}`);
  console.log(`\n   Tiếp theo: npm run sync:manifest && npm run run:once\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
