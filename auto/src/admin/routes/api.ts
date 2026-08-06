import { Router, Request, Response } from "express";
import {
  listScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
  markScenarioRun,
  toSeedingScript,
  computeJobDelays,
} from "../services/scenarioStore";
import { listClones, listGroups, loadDeadCloneIds } from "../services/resourceService";
import { scheduleSeedingScript, getQueueStats } from "../../queue/scheduler";
import { getWorkflowState } from "../../services/workflowState";
import { CreateScenarioInput, BcrEventType } from "../../types/customScenario";
import { seedBcrTemplates } from "../../bcr/bcrTemplateSeeder";
import { countScenariosByEvent } from "../services/scenarioStore";
import { handleBcrPubSubMessage } from "../../bcr/bcrEventHandler";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

apiRouter.get("/clones", async (_req, res) => {
  try {
    res.json(await listClones());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function assertAliveCloneIds(steps: Array<{ cloneId?: string }>): Promise<string | null> {
  const dead = await loadDeadCloneIds();
  for (const step of steps) {
    if (step.cloneId && dead.has(step.cloneId)) {
      return `Clone ${step.cloneId} đã chết — chọn account sống khác`;
    }
  }
  return null;
}

apiRouter.get("/groups", async (_req, res) => {
  try {
    res.json(await listGroups());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get("/queue/stats", async (_req, res) => {
  try {
    res.json(await getQueueStats());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get("/workflows/:id", async (req, res) => {
  try {
    const state = await getWorkflowState(req.params.id);
    if (!state) return res.status(404).json({ error: "Workflow không tồn tại" });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get("/scenarios", async (req, res) => {
  try {
    const source = req.query.source as string | undefined;
    const eventType = req.query.eventType as string | undefined;
    res.json(await listScenarios({ source, eventType }));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get("/bcr/stats", async (_req, res) => {
  try {
    const counts = await countScenariosByEvent();
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post("/bcr/seed", async (req, res) => {
  try {
    const force = req.body?.force === true;
    const result = await seedBcrTemplates({ force });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post("/bcr/test", async (req, res) => {
  try {
    const event = (req.body?.event as string) ?? "win";
    const groupId = req.body?.groupId as string | undefined;

    const result = await handleBcrPubSubMessage(
      JSON.stringify({ event, groupId, roundId: `admin-test-${Date.now()}` })
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get("/scenarios/:id", async (req, res) => {
  try {
    const scenario = await getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post("/scenarios", async (req, res) => {
  try {
    const body = req.body as CreateScenarioInput;
    if (!body.name?.trim()) return res.status(400).json({ error: "Thiếu tên kịch bản" });
    if (!body.groupId) return res.status(400).json({ error: "Thiếu group" });
    if (!body.steps?.length) return res.status(400).json({ error: "Cần ít nhất 1 bước" });

    for (const step of body.steps) {
      if (!step.cloneId) return res.status(400).json({ error: "Mỗi bước cần cloneId" });
      if (!step.action) return res.status(400).json({ error: "Mỗi bước cần action" });
    }

    const deadErr = await assertAliveCloneIds(body.steps);
    if (deadErr) return res.status(400).json({ error: deadErr });

    const scenario = await createScenario(body);
    res.status(201).json(scenario);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.put("/scenarios/:id", async (req, res) => {
  try {
    const body = req.body as CreateScenarioInput;
    if (body.steps?.length) {
      const deadErr = await assertAliveCloneIds(body.steps);
      if (deadErr) return res.status(400).json({ error: deadErr });
    }

    const updated = await updateScenario(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Không tìm thấy" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.delete("/scenarios/:id", async (req, res) => {
  try {
    const ok = await deleteScenario(req.params.id);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post("/scenarios/:id/run", async (req, res) => {
  try {
    const scenario = await getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: "Không tìm thấy" });
    if (!scenario.enabled) return res.status(400).json({ error: "Kịch bản đang tắt" });

    const deadErr = await assertAliveCloneIds(scenario.steps);
    if (deadErr) return res.status(400).json({ error: deadErr });

    const script = toSeedingScript(scenario);
    const delays = computeJobDelays(scenario);
    const workflowId = await scheduleSeedingScript(script, delays);
    await markScenarioRun(scenario.id, workflowId);

    res.json({
      ok: true,
      workflowId,
      message: `Đã lên lịch ${scenario.steps.length} bước cho group ${scenario.groupId}`,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
