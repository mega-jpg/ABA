"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const clientPool_1 = require("../telegram/clientPool");
const safeTele_1 = require("../telegram/safeTele");
const seeding_1 = require("../types/seeding");
const goResult_1 = require("../goResult");
const seedingConfig_1 = require("../services/seedingConfig");
const groupAccess_1 = require("../services/groupAccess");
dotenv_1.default.config();
const MANIFEST_PATH = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
function getArg(flag) {
    const idx = process.argv.indexOf(flag);
    return idx !== -1 ? process.argv[idx + 1] : undefined;
}
function sleep(sec) {
    return new Promise((r) => setTimeout(r, sec * 1000));
}
async function loadInviteFromConfig() {
    try {
        const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
        const group = cfg.groups.find((g) => g.id === cfg.target?.groupId) ??
            cfg.groups.find((g) => g.enabled) ??
            cfg.groups[0];
        const joinInfo = group ? await (0, groupAccess_1.getGroupJoinInfo)(group.id) : null;
        return {
            inviteLink: joinInfo?.inviteLink,
            username: joinInfo?.username,
            groupId: cfg.target?.groupId ?? group?.id,
        };
    }
    catch {
        return {};
    }
}
async function joinSessionsToGroup(params) {
    const { sessions, targetGroup, inviteLink, username, groupLabel } = params;
    let joined = 0;
    let already = 0;
    let failed = 0;
    console.log(`\n=== Join ${groupLabel ?? targetGroup ?? "group"} ===`);
    if (targetGroup)
        console.log(`📌 Group ID: ${targetGroup}`);
    if (inviteLink)
        console.log(`🔗 Invite  : ${inviteLink}`);
    if (username)
        console.log(`📛 Username: @${username.replace(/^@/, "")}`);
    console.log("");
    for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const label = s.firstName ?? s.username ?? s.id;
        const [client, connErr] = await (0, clientPool_1.getTelegramClient)(s.id);
        if (connErr) {
            console.log(`❌ [${i + 1}/${sessions.length}] ${s.id} — lỗi kết nối: ${connErr.message}`);
            failed++;
            continue;
        }
        try {
            if (targetGroup) {
                const member = await (0, safeTele_1.isInGroup)(client, targetGroup);
                if (member) {
                    console.log(`⏭️  [${i + 1}/${sessions.length}] ${label} — đã trong group rồi`);
                    already++;
                    await (0, clientPool_1.disconnectClient)(s.id);
                    continue;
                }
            }
            let joinErr = null;
            if (inviteLink) {
                const [, err] = await (0, safeTele_1.safeJoinByInvite)(client, inviteLink);
                joinErr = err;
            }
            else if (username) {
                const [, err] = await (0, safeTele_1.safeJoinByUsername)(client, username);
                joinErr = err;
            }
            if (joinErr) {
                if ((0, goResult_1.isFloodWait)(joinErr)) {
                    const wait = parseInt(joinErr.message.match(/(\d+)/)?.[1] ?? "60", 10);
                    console.log(`⏳ FLOOD_WAIT ${wait}s — chờ rồi thử lại ${label}...`);
                    await sleep(wait + 5);
                    i--;
                    continue;
                }
                if (joinErr.message.includes("USER_ALREADY_PARTICIPANT")) {
                    console.log(`⏭️  [${i + 1}/${sessions.length}] ${label} — đã trong group`);
                    already++;
                }
                else {
                    console.log(`❌ [${i + 1}/${sessions.length}] ${label} — ${joinErr.message}`);
                    failed++;
                }
            }
            else {
                console.log(`✅ [${i + 1}/${sessions.length}] ${label} — join thành công`);
                joined++;
            }
        }
        finally {
            await (0, clientPool_1.disconnectClient)(s.id);
        }
        if (i < sessions.length - 1) {
            const delay = (0, seeding_1.randomDelay)(10, 30);
            console.log(`   ⏸  Chờ ${delay}s...`);
            await sleep(delay);
        }
    }
    return { joined, already, failed };
}
async function main() {
    const allEnabled = process.argv.includes("--all-enabled");
    const fromConfig = await loadInviteFromConfig();
    const inviteLink = getArg("--invite") ?? fromConfig.inviteLink;
    const username = getArg("--username") ?? fromConfig.username;
    const groupIdArg = getArg("--group-id") ?? fromConfig.groupId;
    const raw = await promises_1.default.readFile(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(raw);
    const sessions = manifest.sessions.filter((s) => s.enabled);
    if (allEnabled) {
        const cfg = await (0, seedingConfig_1.loadSeedingConfig)();
        const groups = (0, seedingConfig_1.getEnabledGroups)(cfg);
        let totalJoined = 0;
        let totalAlready = 0;
        let totalFailed = 0;
        let skipped = 0;
        console.log(`\n=== Join tất cả group enabled (${groups.length}) cho ${sessions.length} clone ===`);
        for (const g of groups) {
            const joinInfo = await (0, groupAccess_1.getGroupJoinInfo)(g.id);
            if (!joinInfo?.inviteLink && !joinInfo?.username) {
                console.log(`\n⏭️  Bỏ qua ${g.name} (${g.id}) — chưa có inviteLink/username`);
                skipped++;
                continue;
            }
            const result = await joinSessionsToGroup({
                sessions,
                targetGroup: g.id,
                inviteLink: joinInfo.inviteLink,
                username: joinInfo.username,
                groupLabel: g.name,
            });
            totalJoined += result.joined;
            totalAlready += result.already;
            totalFailed += result.failed;
        }
        console.log(`\n=== Tổng kết ===`);
        console.log(`✅ Join mới  : ${totalJoined}`);
        console.log(`⏭️  Đã có sẵn : ${totalAlready}`);
        console.log(`❌ Lỗi       : ${totalFailed}`);
        console.log(`⏭️  Bỏ qua    : ${skipped} group (thiếu invite link)`);
        console.log(`\n   Kiểm tra: npm run check:groups\n`);
        return;
    }
    if (!inviteLink && !username) {
        console.log(`
Cách join group cho các session sống:

  npm run join:group -- --invite "https://t.me/+LINK_MOI_GROUP"

  # Group public (có @username):
  npm run join:group -- --username "ten_group"

  # Kiểm tra đã join chưa (cần group-id):
  npm run join:group -- --invite "https://t.me/+xxx" --group-id -1003709178070

  # Join tất cả group enabled có inviteLink trong config / .env:
  npm run join:group -- --all-enabled

Lấy link mời: vào group → Add members → Invite link → Copy
`);
        process.exit(1);
    }
    const targetGroup = groupIdArg ??
        manifest.groups.find((g) => g.enabled)?.groupId ??
        manifest.groups[0]?.groupId;
    console.log(`\n=== Join group cho ${sessions.length} session sống ===`);
    const result = await joinSessionsToGroup({
        sessions,
        targetGroup,
        inviteLink,
        username,
    });
    console.log(`\n=== Kết quả ===`);
    console.log(`✅ Join mới  : ${result.joined}`);
    console.log(`⏭️  Đã có sẵn : ${result.already}`);
    console.log(`❌ Lỗi       : ${result.failed}`);
    console.log(`\n   Kiểm tra: npm run check:groups\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
