import { TelegramClient } from "telegram";
import { GoResult, ok, failErr } from "../goResult";
import { loadSeedingConfig } from "./seedingConfig";
import {
  isInGroup,
  safeJoinByInvite,
  safeJoinByUsername,
} from "../telegram/safeTele";

export type GroupJoinInfo = {
  id: string;
  name?: string;
  inviteLink?: string;
  username?: string;
};

/** invite từ env: `-100123=https://t.me/+abc;-100456=https://t.me/+def` */
function parseEnvGroupInvites(): Map<string, string> {
  const raw = process.env.BCR_GROUP_INVITES?.trim();
  if (!raw) return new Map();

  const map = new Map<string, string>();
  for (const part of raw.split(/[;,]/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const id = part.slice(0, eq).trim();
    const link = part.slice(eq + 1).trim();
    if (id && link) map.set(id, link);
  }
  return map;
}

export async function getGroupJoinInfo(chatId: string): Promise<GroupJoinInfo | null> {
  const cfg = await loadSeedingConfig();
  const fromConfig = cfg.groups.find((g) => g.id === chatId);
  const envInvite = parseEnvGroupInvites().get(chatId);

  if (!fromConfig && !envInvite) return null;

  return {
    id: chatId,
    name: fromConfig?.name,
    inviteLink: fromConfig?.inviteLink ?? envInvite,
    username: fromConfig?.username,
  };
}

export async function ensureChatAccess(
  client: TelegramClient,
  chatId: string,
  cloneLabel?: string
): Promise<GoResult<void>> {
  if (await isInGroup(client, chatId)) {
    return ok(undefined);
  }

  const info = await getGroupJoinInfo(chatId);
  const label = info?.name ?? chatId;

  if (!info?.inviteLink && !info?.username) {
    return failErr(
      new Error(
        `Clone ${cloneLabel ?? ""} chưa trong "${label}". ` +
          `Thêm inviteLink vào seeding.config.json hoặc BCR_GROUP_INVITES trong .env, ` +
          `rồi chạy: npm run join:group -- --all-enabled`
      )
    );
  }

  console.log(
    `[GroupAccess] Clone ${cloneLabel ?? "?"} chưa trong ${label} — đang join...`
  );

  if (info.inviteLink) {
    const [, joinErr] = await safeJoinByInvite(client, info.inviteLink);
    if (joinErr) {
      if (
        joinErr.message.includes("USER_ALREADY_PARTICIPANT") ||
        joinErr.message.includes("already")
      ) {
        return ok(undefined);
      }
      return failErr(joinErr);
    }
  } else if (info.username) {
    const [, joinErr] = await safeJoinByUsername(client, info.username);
    if (joinErr) return failErr(joinErr);
  }

  if (!(await isInGroup(client, chatId))) {
    return failErr(
      new Error(
        `Clone ${cloneLabel ?? ""} join "${label}" xong nhưng vẫn không gửi được tin — kiểm tra invite link`
      )
    );
  }

  console.log(`[GroupAccess] Clone ${cloneLabel ?? "?"} đã vào ${label}`);
  return ok(undefined);
}
