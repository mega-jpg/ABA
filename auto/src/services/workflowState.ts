import { Redis } from "ioredis";
import { WorkflowState } from "../types/seeding";
import { getRedisConnection } from "../queue/connection";

const STATE_PREFIX = "workflow:state:";
const STATE_TTL_SEC = 60 * 60 * 24; // 24h

function stateKey(workflowId: string): string {
  return `${STATE_PREFIX}${workflowId}`;
}

export async function initWorkflowState(
  workflowId: string,
  totalSteps: number
): Promise<WorkflowState> {
  const redis = getRedisConnection();
  const state: WorkflowState = {
    workflowId,
    completedSteps: 0,
    totalSteps,
    status: "pending",
    errors: [],
  };
  await redis.set(stateKey(workflowId), JSON.stringify(state), "EX", STATE_TTL_SEC);
  return state;
}

export async function getWorkflowState(workflowId: string): Promise<WorkflowState | null> {
  const redis = getRedisConnection();
  const raw = await redis.get(stateKey(workflowId));
  return raw ? (JSON.parse(raw) as WorkflowState) : null;
}

export async function updateWorkflowState(
  workflowId: string,
  patch: Partial<WorkflowState>
): Promise<WorkflowState | null> {
  const current = await getWorkflowState(workflowId);
  if (!current) return null;

  const updated: WorkflowState = { ...current, ...patch };
  const redis = getRedisConnection();
  await redis.set(stateKey(workflowId), JSON.stringify(updated), "EX", STATE_TTL_SEC);
  return updated;
}

export async function recordStepSuccess(
  workflowId: string,
  stepIndex: number,
  messageId?: number
): Promise<void> {
  const current = await getWorkflowState(workflowId);
  if (!current) return;

  const completedSteps = stepIndex + 1;
  const status =
    completedSteps >= current.totalSteps ? "completed" : "running";

  await updateWorkflowState(workflowId, {
    completedSteps,
    status,
    ...(messageId !== undefined ? { lastMessageId: messageId } : {}),
  });
}

export async function recordStepError(
  workflowId: string,
  error: string
): Promise<void> {
  const current = await getWorkflowState(workflowId);
  if (!current) return;

  await updateWorkflowState(workflowId, {
    errors: [...current.errors, error],
    status: "failed",
  });
}
