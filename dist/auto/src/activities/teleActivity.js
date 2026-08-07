"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teleActivityProcessor = teleActivityProcessor;
exports.createSeedingWorker = createSeedingWorker;
const bullmq_1 = require("bullmq");
const config_1 = require("../config");
const connection_1 = require("../queue/connection");
const clientPool_1 = require("../telegram/clientPool");
const safeTele_1 = require("../telegram/safeTele");
const cloneStore_1 = require("../services/cloneStore");
const workflowState_1 = require("../services/workflowState");
const goResult_1 = require("../goResult");
const groupAccess_1 = require("../services/groupAccess");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function applyJitter(baseSec) {
    const jitter = Math.random() * 0.3 * baseSec;
    return Math.floor((baseSec + jitter) * 1000);
}
async function requireChatAccess(client, chatId, cloneId, workflowId) {
    const [, accessErr] = await (0, groupAccess_1.ensureChatAccess)(client, chatId, cloneId);
    if (!accessErr)
        return null;
    await (0, workflowState_1.recordStepError)(workflowId, accessErr.message);
    return { success: false, error: accessErr.message, retryable: false };
}
async function teleActivityProcessor(job) {
    const { cloneId, action, payload, chatId, delayBefore, workflowId, stepIndex } = job.data;
    console.log(`[Activity] Step ${stepIndex} | Clone ${cloneId} | Action: ${action} | Workflow: ${workflowId}`);
    await sleep(applyJitter(delayBefore));
    const [client, loginErr] = await (0, clientPool_1.getTelegramClient)(cloneId);
    if (loginErr) {
        await (0, cloneStore_1.markCloneAsDead)(cloneId);
        const msg = `Nick ${cloneId} lỗi đăng nhập: ${loginErr.message}`;
        await (0, workflowState_1.recordStepError)(workflowId, msg);
        return { success: false, error: msg, retryable: false };
    }
    try {
        switch (action) {
            case "join": {
                if (!payload.inviteLink) {
                    return { success: false, error: "Thiếu inviteLink", retryable: false };
                }
                const [, joinErr] = await (0, safeTele_1.safeJoinGroup)(client, payload.inviteLink);
                if (joinErr) {
                    if ((0, goResult_1.isFloodWait)(joinErr))
                        throw joinErr;
                    await (0, workflowState_1.recordStepError)(workflowId, joinErr.message);
                    return { success: false, error: joinErr.message, retryable: false };
                }
                await (0, workflowState_1.recordStepSuccess)(workflowId, stepIndex);
                return { success: true };
            }
            case "send_gif": {
                if (!payload.gifUrl) {
                    return { success: false, error: "Thiếu gifUrl", retryable: false };
                }
                {
                    const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
                    if (blocked)
                        return blocked;
                }
                let replyTo = payload.replyToMsgId;
                if (replyTo === undefined && payload.replyToPrevious === true) {
                    const state = await (0, workflowState_1.getWorkflowState)(workflowId);
                    replyTo = state?.lastMessageId;
                }
                const [msgId, sendErr] = await (0, safeTele_1.safeSendGif)(client, chatId, payload.gifUrl, replyTo, payload.text);
                if (sendErr) {
                    if ((0, goResult_1.isFloodWait)(sendErr)) {
                        const waitSec = (0, goResult_1.parseFloodWaitSeconds)(sendErr) ?? 60;
                        console.warn(`[Activity] FLOOD_WAIT ${waitSec}s cho clone ${cloneId}, sẽ retry...`);
                        throw sendErr;
                    }
                    await (0, workflowState_1.recordStepError)(workflowId, sendErr.message);
                    return { success: false, error: sendErr.message, retryable: false };
                }
                await (0, workflowState_1.recordStepSuccess)(workflowId, stepIndex, msgId);
                console.log(`[Activity] Clone ${cloneId} gửi GIF #${msgId} thành công`);
                return { success: true, messageId: msgId };
            }
            case "forward_message": {
                if (!payload.forwardFromPeer || !payload.forwardMessageId) {
                    return {
                        success: false,
                        error: "Thiếu forwardFromPeer hoặc forwardMessageId",
                        retryable: false,
                    };
                }
                {
                    const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
                    if (blocked)
                        return blocked;
                }
                const [msgId, fwdErr] = await (0, safeTele_1.safeForwardMessage)(client, chatId, payload.forwardFromPeer, payload.forwardMessageId);
                if (fwdErr) {
                    if ((0, goResult_1.isFloodWait)(fwdErr))
                        throw fwdErr;
                    await (0, workflowState_1.recordStepError)(workflowId, fwdErr.message);
                    return { success: false, error: fwdErr.message, retryable: false };
                }
                await (0, workflowState_1.recordStepSuccess)(workflowId, stepIndex, msgId);
                console.log(`[Activity] Clone ${cloneId} forward GIF #${payload.forwardMessageId} → tin #${msgId}`);
                return { success: true, messageId: msgId };
            }
            case "send_message": {
                if (!payload.text) {
                    return { success: false, error: "Thiếu text", retryable: false };
                }
                {
                    const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
                    if (blocked)
                        return blocked;
                }
                let replyTo = payload.replyToMsgId;
                if (replyTo === undefined && payload.replyToPrevious === true) {
                    const state = await (0, workflowState_1.getWorkflowState)(workflowId);
                    replyTo = state?.lastMessageId;
                }
                const [msgId, sendErr] = await (0, safeTele_1.safeSendMessage)(client, chatId, payload.text, replyTo);
                if (sendErr) {
                    if ((0, goResult_1.isFloodWait)(sendErr)) {
                        const waitSec = (0, goResult_1.parseFloodWaitSeconds)(sendErr) ?? 60;
                        console.warn(`[Activity] FLOOD_WAIT ${waitSec}s cho clone ${cloneId}, sẽ retry...`);
                        throw sendErr;
                    }
                    await (0, workflowState_1.recordStepError)(workflowId, sendErr.message);
                    return { success: false, error: sendErr.message, retryable: false };
                }
                await (0, workflowState_1.recordStepSuccess)(workflowId, stepIndex, msgId);
                console.log(`[Activity] Clone ${cloneId} gửi tin #${msgId} thành công`);
                return { success: true, messageId: msgId };
            }
            case "react": {
                const state = await (0, workflowState_1.getWorkflowState)(workflowId);
                const targetMsgId = payload.replyToMsgId ?? state?.lastMessageId;
                if (!targetMsgId || !payload.reaction) {
                    return {
                        success: false,
                        error: "Thiếu messageId hoặc reaction",
                        retryable: false,
                    };
                }
                {
                    const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
                    if (blocked)
                        return blocked;
                }
                const [, reactErr] = await (0, safeTele_1.safeReact)(client, chatId, targetMsgId, payload.reaction);
                if (reactErr) {
                    if ((0, goResult_1.isFloodWait)(reactErr))
                        throw reactErr;
                    await (0, workflowState_1.recordStepError)(workflowId, reactErr.message);
                    return { success: false, error: reactErr.message, retryable: false };
                }
                await (0, workflowState_1.recordStepSuccess)(workflowId, stepIndex);
                return { success: true };
            }
            default:
                return { success: false, error: `Action không hỗ trợ: ${action}`, retryable: false };
        }
    }
    finally {
    }
}
function createSeedingWorker() {
    const worker = new bullmq_1.Worker(config_1.config.queueName, teleActivityProcessor, {
        connection: (0, connection_1.getBullMQConnection)(),
        concurrency: 2,
        limiter: {
            max: 5,
            duration: 60_000,
        },
    });
    worker.on("completed", (job, result) => {
        console.log(`[Worker] Job ${job.id} hoàn thành:`, result.success ? "OK" : result.error);
    });
    worker.on("failed", (job, err) => {
        console.error(`[Worker] Job ${job?.id} thất bại:`, err.message);
    });
    worker.on("error", (err) => {
        console.error("[Worker] Lỗi worker:", err.message);
    });
    return worker;
}
