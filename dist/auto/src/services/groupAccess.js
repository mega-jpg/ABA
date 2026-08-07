"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGroupJoinInfo = getGroupJoinInfo;
exports.ensureChatAccess = ensureChatAccess;
const goResult_1 = require("../goResult");
const seedingConfig_1 = require("./seedingConfig");
const safeTele_1 = require("../telegram/safeTele");
function parseEnvGroupInvites() {
    const raw = process.env.BCR_GROUP_INVITES?.trim();
    if (!raw)
        return new Map();
    const map = new Map();
    for (const part of raw.split(/[;,]/)) {
        const eq = part.indexOf("=");
        if (eq <= 0)
            continue;
        const id = part.slice(0, eq).trim();
        const link = part.slice(eq + 1).trim();
        if (id && link)
            map.set(id, link);
    }
    return map;
}
async function getGroupJoinInfo(chatId) {
    const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
    const fromConfig = cfg.groups.find((g) => g.id === chatId);
    const envInvite = parseEnvGroupInvites().get(chatId);
    if (!fromConfig && !envInvite)
        return null;
    return {
        id: chatId,
        name: fromConfig?.name,
        inviteLink: fromConfig?.inviteLink ?? envInvite,
        username: fromConfig?.username,
    };
}
async function ensureChatAccess(client, chatId, cloneLabel) {
    if (await (0, safeTele_1.isInGroup)(client, chatId)) {
        return (0, goResult_1.ok)(undefined);
    }
    const info = await getGroupJoinInfo(chatId);
    const label = info?.name ?? chatId;
    if (!info?.inviteLink && !info?.username) {
        return (0, goResult_1.failErr)(new Error(`Clone ${cloneLabel ?? ""} chưa trong "${label}". ` +
            `Thêm inviteLink vào seeding.config.json hoặc BCR_GROUP_INVITES trong .env, ` +
            `rồi chạy: npm run join:group -- --all-enabled`));
    }
    console.log(`[GroupAccess] Clone ${cloneLabel ?? "?"} chưa trong ${label} — đang join...`);
    if (info.inviteLink) {
        const [, joinErr] = await (0, safeTele_1.safeJoinByInvite)(client, info.inviteLink);
        if (joinErr) {
            if (joinErr.message.includes("USER_ALREADY_PARTICIPANT") ||
                joinErr.message.includes("already")) {
                return (0, goResult_1.ok)(undefined);
            }
            return (0, goResult_1.failErr)(joinErr);
        }
    }
    else if (info.username) {
        const [, joinErr] = await (0, safeTele_1.safeJoinByUsername)(client, info.username);
        if (joinErr)
            return (0, goResult_1.failErr)(joinErr);
    }
    if (!(await (0, safeTele_1.isInGroup)(client, chatId))) {
        return (0, goResult_1.failErr)(new Error(`Clone ${cloneLabel ?? ""} join "${label}" xong nhưng vẫn không gửi được tin — kiểm tra invite link`));
    }
    console.log(`[GroupAccess] Clone ${cloneLabel ?? "?"} đã vào ${label}`);
    return (0, goResult_1.ok)(undefined);
}
