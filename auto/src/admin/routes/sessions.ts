import { spawn } from "child_process";
import { Router } from "express";
import express from "express";
import {
  getSessionStats,
  importSessionFiles,
  buildSessionsManifest,
  filterDeadSessions,
  syncManifestToConfig,
} from "../services/sessionAdminService";
import {
  createSessionJob,
  getSessionJob,
  getActiveSessionJob,
  updateSessionJob,
  finishSessionJob,
  failSessionJob,
} from "../services/sessionJobStore";

export const sessionsRouter = Router();

sessionsRouter.get("/stats", async (_req, res) => {
  try {
    res.json(await getSessionStats());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.get("/jobs/active", (req, res) => {
  const type = req.query.type as "build" | "filter" | undefined;
  const job = getActiveSessionJob(type);
  res.json({ job: job ?? null });
});

sessionsRouter.get("/jobs/:id", (req, res) => {
  const job = getSessionJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job không tồn tại" });
  }
  res.json(job);
});

sessionsRouter.post(
  "/import",
  express.json({ limit: "50mb" }),
  async (req, res) => {
    try {
      const files = req.body?.files as Array<{ name: string; content: string }>;
      if (!files?.length) {
        return res.status(400).json({ error: "Thiếu files (name + content base64)" });
      }
      const result = await importSessionFiles(files);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

sessionsRouter.post("/login", async (req, res) => {
  const cloneId = String(req.body?.cloneId ?? "").trim();
  if (!cloneId) {
    return res.status(400).json({ error: "Thiếu cloneId" });
  }

  try {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmCommand, ["run", "login", "--", cloneId], {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post("/build", async (_req, res) => {
  const running = getActiveSessionJob("build");
  if (running) {
    return res.json({ jobId: running.id, alreadyRunning: true });
  }

  const job = createSessionJob("build");
  res.json({ jobId: job.id });

  void (async () => {
    updateSessionJob(job.id, { status: "running", phase: "Bắt đầu gia công" });
    try {
      const result = await buildSessionsManifest((p) => {
        updateSessionJob(job.id, {
          status: "running",
          phase: p.phase,
          current: p.current,
          total: p.total,
          detail: p.detail,
        });
      });
      finishSessionJob(job.id, result);
    } catch (err) {
      failSessionJob(job.id, (err as Error).message);
    }
  })();
});

sessionsRouter.post("/filter", async (req, res) => {
  const running = getActiveSessionJob("filter");
  if (running) {
    return res.json({ jobId: running.id, alreadyRunning: true });
  }

  const concurrency = Math.min(
    10,
    Math.max(1, parseInt(String(req.body?.concurrency ?? 3), 10))
  );

  const job = createSessionJob("filter");
  res.json({ jobId: job.id });

  void (async () => {
    updateSessionJob(job.id, {
      status: "running",
      phase: "Bắt đầu lọc",
      alive: 0,
      dead: 0,
    });
    try {
      const result = await filterDeadSessions({
        concurrency,
        onProgress: (p) => {
          updateSessionJob(job.id, {
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
      finishSessionJob(job.id, result);
    } catch (err) {
      failSessionJob(job.id, (err as Error).message);
    }
  })();
});

sessionsRouter.post("/sync", async (_req, res) => {
  try {
    const result = await syncManifestToConfig();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
