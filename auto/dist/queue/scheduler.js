"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSeedingQueue = getSeedingQueue;
exports.scheduleSeedingScript = scheduleSeedingScript;
exports.getQueueStats = getQueueStats;
exports.closeQueue = closeQueue;
const bullmq_1 = require("bullmq");
const config_1 = require("../config");
const connection_1 = require("./connection");
const workflowState_1 = require("../services/workflowState");
let queueInstance = null;
function getSeedingQueue() {
    if (!queueInstance) {
        queueInstance = new bullmq_1.Queue(config_1.config.queueName, {
            connection: (0, connection_1.getBullMQConnection)(),
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
async function scheduleSeedingScript(script, delaysMs) {
    const queue = getSeedingQueue();
    const workflowId = script.id;
    await (0, workflowState_1.initWorkflowState)(workflowId, script.steps.length);
    let cumulativeDelayMs = 0;
    for (let i = 0; i < script.steps.length; i++) {
        const step = script.steps[i];
        if (delaysMs) {
            cumulativeDelayMs = delaysMs[i];
        }
        else {
            cumulativeDelayMs += step.delayBefore * 1000;
        }
        const jobData = {
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
    console.log(`[Scheduler] Đã đẩy ${script.steps.length} job vào queue cho workflow "${script.name}" (${workflowId})`);
    return workflowId;
}
async function getQueueStats() {
    const queue = getSeedingQueue();
    const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
}
async function closeQueue() {
    if (queueInstance) {
        await queueInstance.close();
        queueInstance = null;
    }
}
