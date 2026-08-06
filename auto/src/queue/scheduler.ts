import { Job, Queue } from "bullmq";
import { SeedingJobData, SeedingScript } from "../types/seeding";
import { config } from "../config";
import { getBullMQConnection } from "./connection";
import { initWorkflowState } from "../services/workflowState";

let queueInstance: Queue<SeedingJobData> | null = null;

export function getSeedingQueue(): Queue<SeedingJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<SeedingJobData>(config.queueName, {
      connection: getBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queueInstance;
}

export async function scheduleSeedingScript(
  script: SeedingScript,
  delaysMs?: number[]
): Promise<string> {
  const queue = getSeedingQueue();
  const workflowId = script.id;

  await initWorkflowState(workflowId, script.steps.length);

  let cumulativeDelayMs = 0;

  for (let i = 0; i < script.steps.length; i++) {
    const step = script.steps[i];
    if (delaysMs) {
      cumulativeDelayMs = delaysMs[i];
    } else {
      cumulativeDelayMs += step.delayBefore * 1000;
    }

    const jobData: SeedingJobData = {
      ...step,
      chatId: script.chatId,
      workflowId,
      stepIndex: i,
    };

    await queue.add(`step-${i}-${step.action}`, jobData, {
      delay: cumulativeDelayMs,
      jobId: `${workflowId}-step-${i}`,
    });
  }

  console.log(
    `[Scheduler] Đã đẩy ${script.steps.length} job vào queue cho workflow "${script.name}" (${workflowId})`
  );

  return workflowId;
}

export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = getSeedingQueue();
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

export async function closeQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
