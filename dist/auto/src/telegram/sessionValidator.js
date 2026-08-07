"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeadSessionError = isDeadSessionError;
exports.validateSessionString = validateSessionString;
exports.sleep = sleep;
exports.validateSessionsBatch = validateSessionsBatch;
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const Logger_1 = require("telegram/extensions/Logger");
const config_1 = require("../config");
const silentLogger = new Logger_1.Logger("none");
const DEAD_ERROR_PATTERNS = [
    "AUTH_KEY_UNREGISTERED",
    "SESSION_REVOKED",
    "USER_DEACTIVATED",
    "USER_DEACTIVATED_BAN",
    "SESSION_EXPIRED",
    "AUTH_KEY_INVALID",
    "PHONE_NUMBER_BANNED",
];
function isDeadSessionError(err) {
    const msg = err.message.toUpperCase();
    return DEAD_ERROR_PATTERNS.some((p) => msg.includes(p));
}
async function validateSessionString(id, sessionStr) {
    const client = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionStr), config_1.config.telegram.apiId, config_1.config.telegram.apiHash, {
        connectionRetries: 2,
        timeout: 15,
        baseLogger: silentLogger,
    });
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
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return {
            id,
            alive: false,
            reason: isDeadSessionError(error) ? error.message : `ERROR: ${error.message}`,
        };
    }
    finally {
        try {
            await client.disconnect();
        }
        catch {
        }
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function validateSessionsBatch(items, options = {}) {
    const concurrency = options.concurrency ?? 3;
    const delayMs = options.delayMs ?? 1500;
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((item) => validateSessionString(item.id, item.session)));
        results.push(...batchResults);
        if (i + concurrency < items.length) {
            await sleep(delayMs);
        }
    }
    return results;
}
