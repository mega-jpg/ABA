"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionsRouter = void 0;
const child_process_1 = require("child_process");
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const sessionAdminService_1 = require("../services/sessionAdminService");
const sessionJobStore_1 = require("../services/sessionJobStore");
exports.sessionsRouter = (0, express_1.Router)();
exports.sessionsRouter.get("/stats", async (_req, res) => {
    try {
        res.json(await (0, sessionAdminService_1.getSessionStats)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.sessionsRouter.get("/jobs/active", (req, res) => {
    const type = req.query.type;
    const job = (0, sessionJobStore_1.getActiveSessionJob)(type);
    res.json({ job: job ?? null });
});
exports.sessionsRouter.get("/jobs/:id", (req, res) => {
    const job = (0, sessionJobStore_1.getSessionJob)(req.params.id);
    if (!job) {
        return res.status(404).json({ error: "Job không tồn tại" });
    }
    res.json(job);
});
exports.sessionsRouter.post("/import", express_2.default.json({ limit: "50mb" }), async (req, res) => {
    try {
        const files = req.body?.files;
        if (!files?.length) {
            return res.status(400).json({ error: "Thiếu files (name + content base64)" });
        }
        const result = await (0, sessionAdminService_1.importSessionFiles)(files);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.sessionsRouter.post("/login", async (req, res) => {
    const cloneId = String(req.body?.cloneId ?? "").trim();
    if (!cloneId) {
        return res.status(400).json({ error: "Thiếu cloneId" });
    }
    try {
        const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
        const child = (0, child_process_1.spawn)(npmCommand, ["run", "login", "--", cloneId], {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["inherit", "inherit", "inherit"],
        });
        child.unref();
        res.json({
            ok: true,
            cloneId,
            pid: child.pid,
            message: "Đã khởi động tiến trình login. Vui lòng theo dõi terminal để nhập thông tin đăng nhập.",
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.sessionsRouter.post("/build", async (_req, res) => {
    const running = (0, sessionJobStore_1.getActiveSessionJob)("build");
    if (running) {
        return res.json({ jobId: running.id, alreadyRunning: true });
    }
    const job = (0, sessionJobStore_1.createSessionJob)("build");
    res.json({ jobId: job.id });
    void (async () => {
        (0, sessionJobStore_1.updateSessionJob)(job.id, { status: "running", phase: "Bắt đầu gia công" });
        try {
            const result = await (0, sessionAdminService_1.buildSessionsManifest)((p) => {
                (0, sessionJobStore_1.updateSessionJob)(job.id, {
                    status: "running",
                    phase: p.phase,
                    current: p.current,
                    total: p.total,
                    detail: p.detail,
                });
            });
            (0, sessionJobStore_1.finishSessionJob)(job.id, result);
        }
        catch (err) {
            (0, sessionJobStore_1.failSessionJob)(job.id, err.message);
        }
    })();
});
exports.sessionsRouter.post("/filter", async (req, res) => {
    const running = (0, sessionJobStore_1.getActiveSessionJob)("filter");
    if (running) {
        return res.json({ jobId: running.id, alreadyRunning: true });
    }
    const concurrency = Math.min(10, Math.max(1, parseInt(String(req.body?.concurrency ?? 3), 10)));
    const job = (0, sessionJobStore_1.createSessionJob)("filter");
    res.json({ jobId: job.id });
    void (async () => {
        (0, sessionJobStore_1.updateSessionJob)(job.id, {
            status: "running",
            phase: "Bắt đầu lọc",
            alive: 0,
            dead: 0,
        });
        try {
            const result = await (0, sessionAdminService_1.filterDeadSessions)({
                concurrency,
                onProgress: (p) => {
                    (0, sessionJobStore_1.updateSessionJob)(job.id, {
                        status: "running",
                        phase: p.phase,
                        current: p.current,
                        total: p.total,
                        detail: p.detail,
                        alive: p.alive,
                        dead: p.dead,
                    });
                },
            });
            (0, sessionJobStore_1.finishSessionJob)(job.id, result);
        }
        catch (err) {
            (0, sessionJobStore_1.failSessionJob)(job.id, err.message);
        }
    })();
});
exports.sessionsRouter.post("/sync", async (_req, res) => {
    try {
        const result = await (0, sessionAdminService_1.syncManifestToConfig)();
        res.json({ ok: true, ...result });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
