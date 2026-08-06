import express from "express";
import path from "path";
import { apiRouter } from "./routes/api";
import { sessionsRouter } from "./routes/sessions";

const PUBLIC_DIR = path.resolve(process.cwd(), "src/admin/public");

export function createAdminApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", apiRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use(express.static(PUBLIC_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  return app;
}

export async function startAdminServer(port = 3333): Promise<void> {
  const app = createAdminApp();
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`\n🎛  Admin Panel: http://localhost:${port}`);
      console.log(`   API: http://localhost:${port}/api/scenarios\n`);
      resolve();
    });
  });
}
