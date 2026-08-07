"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminApp = createAdminApp;
exports.startAdminServer = startAdminServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const api_1 = require("./routes/api");
const sessions_1 = require("./routes/sessions");
const PUBLIC_DIR = path_1.default.resolve(process.cwd(), "src/admin/public");
function createAdminApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({ limit: "2mb" }));
    app.use("/api", api_1.apiRouter);
    app.use("/api/sessions", sessions_1.sessionsRouter);
    app.use(express_1.default.static(PUBLIC_DIR));
    app.get("*", (_req, res) => {
        res.sendFile(path_1.default.join(PUBLIC_DIR, "index.html"));
    });
    return app;
}
async function startAdminServer(port = 3333) {
    const app = createAdminApp();
    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`\n🎛  Admin Panel: http://localhost:${port}`);
            console.log(`   API: http://localhost:${port}/api/scenarios\n`);
            resolve();
        });
    });
}
