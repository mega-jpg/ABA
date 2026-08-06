"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const scenarioStore_1 = require("../services/scenarioStore");
const resourceService_1 = require("../services/resourceService");
const scheduler_1 = require("../../queue/scheduler");
const workflowState_1 = require("../../services/workflowState");
const bcrTemplateSeeder_1 = require("../../bcr/bcrTemplateSeeder");
const scenarioStore_2 = require("../services/scenarioStore");
const bcrEventHandler_1 = require("../../bcr/bcrEventHandler");
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.get("/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});
exports.apiRouter.get("/clones", async (_req, res) => {
    try {
        res.json(await (0, resourceService_1.listClones)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
async function assertAliveCloneIds(steps) {
    const dead = await (0, resourceService_1.loadDeadCloneIds)();
    for (const step of steps) {
        if (step.cloneId && dead.has(step.cloneId)) {
            return `Clone ${step.cloneId} đã chết — chọn account sống khác`;
        }
    }
    return null;
}
exports.apiRouter.get("/groups", async (_req, res) => {
    try {
        res.json(await (0, resourceService_1.listGroups)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.get("/queue/stats", async (_req, res) => {
    try {
        res.json(await (0, scheduler_1.getQueueStats)());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.get("/workflows/:id", async (req, res) => {
    try {
        const state = await (0, workflowState_1.getWorkflowState)(req.params.id);
        if (!state)
            return res.status(404).json({ error: "Workflow không tồn tại" });
        res.json(state);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.get("/scenarios", async (req, res) => {
    try {
        const source = req.query.source;
        const eventType = req.query.eventType;
        res.json(await (0, scenarioStore_1.listScenarios)({ source, eventType }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.get("/bcr/stats", async (_req, res) => {
    try {
        const counts = await (0, scenarioStore_2.countScenariosByEvent)();
        res.json({ counts });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.post("/bcr/seed", async (req, res) => {
    try {
        const force = req.body?.force === true;
        const result = await (0, bcrTemplateSeeder_1.seedBcrTemplates)({ force });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.post("/bcr/test", async (req, res) => {
    try {
        const event = req.body?.event ?? "win";
        const groupId = req.body?.groupId;
        const result = await (0, bcrEventHandler_1.handleBcrPubSubMessage)(JSON.stringify({ event, groupId, roundId: `admin-test-${Date.now()}` }));
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.get("/scenarios/:id", async (req, res) => {
    try {
        const scenario = await (0, scenarioStore_1.getScenario)(req.params.id);
        if (!scenario)
            return res.status(404).json({ error: "Không tìm thấy" });
        res.json(scenario);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.post("/scenarios", async (req, res) => {
    try {
        const body = req.body;
        if (!body.name?.trim())
            return res.status(400).json({ error: "Thiếu tên kịch bản" });
        if (!body.groupId)
            return res.status(400).json({ error: "Thiếu group" });
        if (!body.steps?.length)
            return res.status(400).json({ error: "Cần ít nhất 1 bước" });
        for (const step of body.steps) {
            if (!step.cloneId)
                return res.status(400).json({ error: "Mỗi bước cần cloneId" });
            if (!step.action)
                return res.status(400).json({ error: "Mỗi bước cần action" });
        }
        const deadErr = await assertAliveCloneIds(body.steps);
        if (deadErr)
            return res.status(400).json({ error: deadErr });
        const scenario = await (0, scenarioStore_1.createScenario)(body);
        res.status(201).json(scenario);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.put("/scenarios/:id", async (req, res) => {
    try {
        const body = req.body;
        if (body.steps?.length) {
            const deadErr = await assertAliveCloneIds(body.steps);
            if (deadErr)
                return res.status(400).json({ error: deadErr });
        }
        const updated = await (0, scenarioStore_1.updateScenario)(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: "Không tìm thấy" });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.delete("/scenarios/:id", async (req, res) => {
    try {
        const ok = await (0, scenarioStore_1.deleteScenario)(req.params.id);
        if (!ok)
            return res.status(404).json({ error: "Không tìm thấy" });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.apiRouter.post("/scenarios/:id/run", async (req, res) => {
    try {
        const scenario = await (0, scenarioStore_1.getScenario)(req.params.id);
        if (!scenario)
            return res.status(404).json({ error: "Không tìm thấy" });
        if (!scenario.enabled)
            return res.status(400).json({ error: "Kịch bản đang tắt" });
        const deadErr = await assertAliveCloneIds(scenario.steps);
        if (deadErr)
            return res.status(400).json({ error: deadErr });
        const script = (0, scenarioStore_1.toSeedingScript)(scenario);
        const delays = (0, scenarioStore_1.computeJobDelays)(scenario);
        const workflowId = await (0, scheduler_1.scheduleSeedingScript)(script, delays);
        await (0, scenarioStore_1.markScenarioRun)(scenario.id, workflowId);
        res.json({
            ok: true,
            workflowId,
            message: `Đã lên lịch ${scenario.steps.length} bước cho group ${scenario.groupId}`,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
