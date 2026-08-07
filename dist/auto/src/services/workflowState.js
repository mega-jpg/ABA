"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWorkflowState = initWorkflowState;
exports.getWorkflowState = getWorkflowState;
exports.updateWorkflowState = updateWorkflowState;
exports.recordStepSuccess = recordStepSuccess;
exports.recordStepError = recordStepError;
const connection_1 = require("../queue/connection");
const STATE_PREFIX = "workflow:state:";
const STATE_TTL_SEC = 60 * 60 * 24;
function stateKey(workflowId) {
    return `${STATE_PREFIX}${workflowId}`;
}
async function initWorkflowState(workflowId, totalSteps) {
    const redis = (0, connection_1.getRedisConnection)();
    const state = {
        workflowId,
        completedSteps: 0,
        totalSteps,
        status: "pending",
        errors: [],
    };
    await redis.set(stateKey(workflowId), JSON.stringify(state), "EX", STATE_TTL_SEC);
    return state;
}
async function getWorkflowState(workflowId) {
    const redis = (0, connection_1.getRedisConnection)();
    const raw = await redis.get(stateKey(workflowId));
    return raw ? JSON.parse(raw) : null;
}
async function updateWorkflowState(workflowId, patch) {
    const current = await getWorkflowState(workflowId);
    if (!current)
        return null;
    const updated = { ...current, ...patch };
    const redis = (0, connection_1.getRedisConnection)();
    await redis.set(stateKey(workflowId), JSON.stringify(updated), "EX", STATE_TTL_SEC);
    return updated;
}
async function recordStepSuccess(workflowId, stepIndex, messageId) {
    const current = await getWorkflowState(workflowId);
    if (!current)
        return;
    const completedSteps = stepIndex + 1;
    const status = completedSteps >= current.totalSteps ? "completed" : "running";
    await updateWorkflowState(workflowId, {
        completedSteps,
        status,
        ...(messageId !== undefined ? { lastMessageId: messageId } : {}),
    });
}
async function recordStepError(workflowId, error) {
    const current = await getWorkflowState(workflowId);
    if (!current)
        return;
    await updateWorkflowState(workflowId, {
        errors: [...current.errors, error],
        status: "failed",
    });
}
