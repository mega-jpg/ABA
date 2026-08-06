import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { CloneAccount } from "../types/seeding";
import { getCloneAccount, isCloneDead } from "../services/cloneStore";
import { config } from "../config";
import { GoResult, ok, failErr, tryAsync } from "../goResult";
import type { TelegramClientParams } from "telegram/client/telegramBaseClient";

const clientPool = new Map<string, TelegramClient>();

function toGramJsProxy(proxy: CloneAccount["proxy"]) {
  if (!proxy) return undefined;
  return {
    ip: proxy.host,
    port: proxy.port,
    socksType: (proxy.type === "socks5" ? 5 : 4) as 4 | 5,
    ...(proxy.username ? { username: proxy.username } : {}),
    ...(proxy.password ? { password: proxy.password } : {}),
  };
}

async function createClient(account: CloneAccount): Promise<TelegramClient> {
  const session = new StringSession(account.session);

  const clientParams: TelegramClientParams = {
    connectionRetries: 5,
    ...(account.proxy ? { proxy: toGramJsProxy(account.proxy) } : {}),
  };

  const client = new TelegramClient(
    session,
    config.telegram.apiId,
    config.telegram.apiHash,
    clientParams
  );

  await client.connect();

  if (!(await client.isUserAuthorized())) {
    throw new Error("Session hết hạn hoặc chưa đăng nhập — cần session mới");
  }

  return client;
}

export async function getTelegramClient(
  cloneId: string
): Promise<GoResult<TelegramClient>> {
  if (isCloneDead(cloneId)) {
    return failErr(new Error(`Clone ${cloneId} đã bị đánh dấu dead`));
  }

  const cached = clientPool.get(cloneId);
  if (cached) {
    return ok(cached);
  }

  const account = await getCloneAccount(cloneId);
  if (!account) {
    return failErr(
      new Error(
        `Không tìm thấy session cho clone "${cloneId}". ` +
          `Đặt clones/${cloneId}.session hoặc clones/${cloneId}.json`
      )
    );
  }

  return tryAsync(async () => {
    const client = await createClient(account);
    clientPool.set(cloneId, client);
    return client;
  });
}

export async function disconnectClient(cloneId: string): Promise<void> {
  const client = clientPool.get(cloneId);
  if (client) {
    await client.disconnect();
    clientPool.delete(cloneId);
  }
}

export async function disconnectAllClients(): Promise<void> {
  for (const [, client] of clientPool) {
    await client.disconnect();
  }
  clientPool.clear();
}
