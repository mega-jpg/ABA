"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const steps = [
    { cmd: "npm run build:sessions", label: "Build manifest từ clones/sessions/" },
    { cmd: "npm run filter:sessions", label: "Lọc session chết" },
    { cmd: "npm run sync:manifest", label: "Sync vào seeding.config.json" },
];
console.log("\n🚀 Prepare run — build + lọc chết + sync config\n");
for (const step of steps) {
    console.log(`── ${step.label} ──`);
    (0, child_process_1.execSync)(step.cmd, { stdio: "inherit", cwd: process.cwd() });
    console.log("");
}
console.log("✅ Sẵn sàng chạy: npm run run:once\n");
