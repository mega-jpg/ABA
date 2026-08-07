"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramClient = getTelegramClient;
exports.disconnectClient = disconnectClient;
exports.disconnectAllClients = disconnectAllClients;
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const cloneStore_1 = require("../services/cloneStore");
const config_1 = require("../config");
const goResult_1 = require("../goResult");
const clientPool = new Map();
function toGramJsProxy(proxy) {
    if (!proxy)
        return undefined;
    return {
        ip: proxy.host,
        port: proxy.port,
        socksType: (proxy.type === "socks5" ? 5 : 4),
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {}),
    };
}
async function createClient(account) {
    const session = new sessions_1.StringSession(account.session);
    const clientParams = {
        connectionRetries: 5,
        ...(account.proxy ? { proxy: toGramJsProxy(account.proxy) } : {}),
    };
    const client = new telegram_1.TelegramClient(session, config_1.config.telegram.apiId, config_1.config.telegram.apiHash, clientParams);
    await client.connect();
    if (!(await client.isUserAuthorized())) {
        throw new Error("Session hết hạn hoặc chưa đăng nhập — cần session mới");
    }
    return client;
}
async function getTelegramClient(cloneId) {
    if ((0, cloneStore_1.isCloneDead)(cloneId)) {
        return (0, goResult_1.failErr)(new Error(`Clone ${cloneId} đã bị đánh dấu dead`));
    }
    const cached = clientPool.get(cloneId);
    if (cached) {
        return (0, goResult_1.ok)(cached);
    }
    const account = await (0, cloneStore_1.getCloneAccount)(cloneId);
    if (!account) {
        return (0, goResult_1.failErr)(new Error(`Không tìm thấy session cho clone "${cloneId}". ` +
            `Đặt clones/${cloneId}.session hoặc clones/${cloneId}.json`));
    }
    return (0, goResult_1.tryAsync)(async () => {
        const client = await createClient(account);
        clientPool.set(cloneId, client);
        return client;
    });
}
async function disconnectClient(cloneId) {
    const client = clientPool.get(cloneId);
    if (client) {
        await client.disconnect();
        clientPool.delete(cloneId);
    }
}
async function disconnectAllClients() {
    for (const [, client] of clientPool) {
        await client.disconnect();
    }
    clientPool.clear();
}
