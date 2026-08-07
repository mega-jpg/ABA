"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MANIFEST_PATH = path_1.default.resolve(process.env.SESSIONS_MANIFEST ?? "./clones/sessions.manifest.json");
const SEEDING_CONFIG_PATH = path_1.default.resolve(process.env.SEEDING_CONFIG ?? "./seeding.config.json");
async function main() {
    const manifestRaw = await promises_1.default.readFile(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(manifestRaw);
    let config = {};
    try {
        config = JSON.parse(await promises_1.default.readFile(SEEDING_CONFIG_PATH, "utf-8"));
    }
    catch {
        config = { mode: "preset", interaction: { preset: { name: "", steps: [] }, random: {} } };
    }
    config.clones = manifest.sessions
        .filter((s) => s.enabled)
        .map((s) => ({
        id: s.id,
        enabled: true,
        session: s.session,
        label: s.firstName ?? s.username ?? s.id,
    }));
    config.groups = manifest.groups.map((g) => ({
        id: g.groupId,
        name: g.name ?? g.groupId,
        enabled: g.enabled,
    }));
    const enabledGroups = manifest.groups.filter((g) => g.enabled);
    if (enabledGroups.length > 0) {
        config.target = {
            groupId: enabledGroups[0].groupId,
            pickGroup: "first",
        };
    }
    await promises_1.default.writeFile(SEEDING_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`\n✅ Đã sync manifest → seeding.config.json`);
    console.log(`   Clones : ${manifest.sessions.length}`);
    console.log(`   Groups : ${manifest.groups.length}`);
    console.log(`\n   Preview: npm run config:preview`);
    console.log(`   Chạy   : npm run run:once\n`);
}
main().catch((err) => {
    console.error("Lỗi:", err.message);
    process.exit(1);
});
