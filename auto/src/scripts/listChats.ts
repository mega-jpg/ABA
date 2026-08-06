/**
 * Liệt kê group từ seeding.config.json + group clone đã join
 */
import dotenv from "dotenv";
import { getTelegramClient, disconnectClient } from "../telegram/clientPool";
import { loadSeedingConfig, getEnabledClones } from "../services/seedingConfig";

dotenv.config();

async function main(): Promise<void> {
  const cfg = await loadSeedingConfig();
  const clones = getEnabledClones(cfg);
  if (clones.length === 0) {
    console.error("❌ Không có clone enabled trong seeding.config.json");
    process.exit(1);
  }

  const cloneId = clones[0].id;
  console.log(`\n=== Groups trong config + clone ${cloneId} ===\n`);

  console.log("📋 Groups trong seeding.config.json:\n");
  for (const g of cfg.groups) {
    const flag = g.enabled ? "✅" : "⬜";
    console.log(`  ${flag} ${g.name}`);
    console.log(`     "id": "${g.id}"`);
  }

  console.log(`\n📋 Target hiện tại: ${cfg.target.groupId ?? `(pick: ${cfg.target.pickGroup})`}`);
  console.log(`📋 Mode: ${cfg.mode}\n`);

  const [client, err] = await getTelegramClient(cloneId);
  if (err) {
    console.error(`❌ Không kết nối clone: ${err.message}`);
    process.exit(1);
  }

  console.log("📋 Groups clone đã join:\n");
  const dialogs = await client.getDialogs({ limit: 30 });
  for (const d of dialogs.filter((x) => x.isGroup || x.isChannel)) {
    const entity = d.entity;
    if (!entity) continue;
    const chatId =
      entity.className === "Channel" ? `-100${entity.id}` : `-${entity.id}`;
    console.log(`  📌 ${d.title}`);
    console.log(`     "id": "${chatId}"`);
  }

  await disconnectClient(cloneId);
  console.log("");
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
