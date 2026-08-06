import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Logger } from "telegram/extensions/Logger";
import { config } from "../config";

const silentLogger = new Logger("none" as never);

export interface SessionCheckResult {
  id: string;
  alive: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  firstName?: string;
}

const DEAD_ERROR_PATTERNS = [
  "AUTH_KEY_UNREGISTERED",
  "SESSION_REVOKED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
  "SESSION_EXPIRED",
  "AUTH_KEY_INVALID",
  "PHONE_NUMBER_BANNED",
];

export function isDeadSessionError(err: Error): boolean {
  const msg = err.message.toUpperCase();
  return DEAD_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export async function validateSessionString(
  id: string,
  sessionStr: string
): Promise<SessionCheckResult> {
  const client = new TelegramClient(
    new StringSession(sessionStr),
    config.telegram.apiId,
    config.telegram.apiHash,
    {
      connectionRetries: 2,
      timeout: 15,
      baseLogger: silentLogger,
    }
  );

  try {
    await client.connect();

    const authorized = await client.isUserAuthorized();
    if (!authorized) {
      return { id, alive: false, reason: "SESSION_NOT_AUTHORIZED" };
    }

    const me = await client.getMe();
    return {
      id,
      alive: true,
      userId: String(me.id),
      username: me.username ?? undefined,
      firstName: me.firstName ?? undefined,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      id,
      alive: false,
      reason: isDeadSessionError(error) ? error.message : `ERROR: ${error.message}`,
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Kiểm tra batch với concurrency giới hạn */
export async function validateSessionsBatch(
  items: Array<{ id: string; session: string }>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<SessionCheckResult[]> {
  const concurrency = options.concurrency ?? 3;
  const delayMs = options.delayMs ?? 1500;
  const results: SessionCheckResult[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item) => validateSessionString(item.id, item.session))
    );
    results.push(...batchResults);

    if (i + concurrency < items.length) {
      await sleep(delayMs);
    }
  }

  return results;
}
