import { Job, Worker } from "bullmq";
import { SeedingJobData, ActivityResult } from "../types/seeding";
import { config } from "../config";
import { getBullMQConnection } from "../queue/connection";
import { getTelegramClient, disconnectClient } from "../telegram/clientPool";
import {
  safeSendMessage,
  safeSendGif,
  safeForwardMessage,
  safeJoinGroup,
  safeReact,
} from "../telegram/safeTele";
import { markCloneAsDead } from "../services/cloneStore";
import {
  recordStepSuccess,
  recordStepError,
  getWorkflowState,
} from "../services/workflowState";
import { isFloodWait, parseFloodWaitSeconds } from "../goResult";
import { ensureChatAccess } from "../services/groupAccess";
import { TelegramClient } from "telegram";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jitter: thêm 0-30% random vào delay để tránh pattern cố định */
function applyJitter(baseSec: number): number {
  const jitter = Math.random() * 0.3 * baseSec;
  return Math.floor((baseSec + jitter) * 1000);
}

async function requireChatAccess(
  client: TelegramClient,
  chatId: string,
  cloneId: string,
  workflowId: string
): Promise<ActivityResult | null> {
  const [, accessErr] = await ensureChatAccess(client, chatId, cloneId);
  if (!accessErr) return null;

  await recordStepError(workflowId, accessErr.message);
  return { success: false, error: accessErr.message, retryable: false };
}

export async function teleActivityProcessor(
  job: Job<SeedingJobData>
): Promise<ActivityResult> {
  const { cloneId, action, payload, chatId, delayBefore, workflowId, stepIndex } =
    job.data;

  console.log(
    `[Activity] Step ${stepIndex} | Clone ${cloneId} | Action: ${action} | Workflow: ${workflowId}`
  );

  // 1. Human-like delay với jitter
  await sleep(applyJitter(delayBefore));

  // 2. Lấy Telegram client
  const [client, loginErr] = await getTelegramClient(cloneId);
  if (loginErr) {
    await markCloneAsDead(cloneId);
    const msg = `Nick ${cloneId} lỗi đăng nhập: ${loginErr.message}`;
    await recordStepError(workflowId, msg);
    return { success: false, error: msg, retryable: false };
  }

  // 3. Thực hiện hành động
  try {
    switch (action) {
      case "join": {
        if (!payload.inviteLink) {
          return { success: false, error: "Thiếu inviteLink", retryable: false };
        }
        const [, joinErr] = await safeJoinGroup(client, payload.inviteLink);
        if (joinErr) {
          if (isFloodWait(joinErr)) throw joinErr;
          await recordStepError(workflowId, joinErr.message);
          return { success: false, error: joinErr.message, retryable: false };
        }
        await recordStepSuccess(workflowId, stepIndex);
        return { success: true };
      }

      case "send_gif": {
        if (!payload.gifUrl) {
          return { success: false, error: "Thiếu gifUrl", retryable: false };
        }

        {
          const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
          if (blocked) return blocked;
        }

        let replyTo = payload.replyToMsgId;
        if (replyTo === undefined && payload.replyToPrevious === true) {
          const state = await getWorkflowState(workflowId);
          replyTo = state?.lastMessageId;
        }

        const [msgId, sendErr] = await safeSendGif(
          client,
          chatId,
          payload.gifUrl,
          replyTo,
          payload.text
        );

        if (sendErr) {
          if (isFloodWait(sendErr)) {
            const waitSec = parseFloodWaitSeconds(sendErr) ?? 60;
            console.warn(
              `[Activity] FLOOD_WAIT ${waitSec}s cho clone ${cloneId}, sẽ retry...`
            );
            throw sendErr;
          }
          await recordStepError(workflowId, sendErr.message);
          return { success: false, error: sendErr.message, retryable: false };
        }

        await recordStepSuccess(workflowId, stepIndex, msgId);
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
          if (blocked) return blocked;
        }

        const [msgId, fwdErr] = await safeForwardMessage(
          client,
          chatId,
          payload.forwardFromPeer,
          payload.forwardMessageId
        );

        if (fwdErr) {
          if (isFloodWait(fwdErr)) throw fwdErr;
          await recordStepError(workflowId, fwdErr.message);
          return { success: false, error: fwdErr.message, retryable: false };
        }

        await recordStepSuccess(workflowId, stepIndex, msgId);
        console.log(
          `[Activity] Clone ${cloneId} forward GIF #${payload.forwardMessageId} → tin #${msgId}`
        );
        return { success: true, messageId: msgId };
      }

      case "send_message": {
        if (!payload.text) {
          return { success: false, error: "Thiếu text", retryable: false };
        }

        {
          const blocked = await requireChatAccess(client, chatId, cloneId, workflowId);
          if (blocked) return blocked;
        }

        // Nếu cần reply mà chưa có msgId, lấy từ workflow state
        let replyTo = payload.replyToMsgId;
        if (replyTo === undefined && payload.replyToPrevious === true) {
          const state = await getWorkflowState(workflowId);
          replyTo = state?.lastMessageId;
        }

        const [msgId, sendErr] = await safeSendMessage(
          client,
          chatId,
          payload.text,
          replyTo
        );

        if (sendErr) {
          if (isFloodWait(sendErr)) {
            const waitSec = parseFloodWaitSeconds(sendErr) ?? 60;
            console.warn(
              `[Activity] FLOOD_WAIT ${waitSec}s cho clone ${cloneId}, sẽ retry...`
            );
            throw sendErr;
          }
          await recordStepError(workflowId, sendErr.message);
          return { success: false, error: sendErr.message, retryable: false };
        }

        await recordStepSuccess(workflowId, stepIndex, msgId);
        console.log(`[Activity] Clone ${cloneId} gửi tin #${msgId} thành công`);
        return { success: true, messageId: msgId };
      }

      case "react": {
        const state = await getWorkflowState(workflowId);
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
          if (blocked) return blocked;
        }

        const [, reactErr] = await safeReact(
          client,
          chatId,
          targetMsgId,
          payload.reaction
        );

        if (reactErr) {
          if (isFloodWait(reactErr)) throw reactErr;
          await recordStepError(workflowId, reactErr.message);
          return { success: false, error: reactErr.message, retryable: false };
        }

        await recordStepSuccess(workflowId, stepIndex);
        return { success: true };
      }

      default:
        return { success: false, error: `Action không hỗ trợ: ${action}`, retryable: false };
    }
  } finally {
    // Giữ connection pool, không disconnect sau mỗi job
  }
}

export function createSeedingWorker(): Worker<SeedingJobData, ActivityResult> {
  const worker = new Worker<SeedingJobData, ActivityResult>(
    config.queueName,
    teleActivityProcessor,
    {
      connection: getBullMQConnection(),
      concurrency: 2, // Tối đa 2 clone chạy song song — tránh spam
      limiter: {
        max: 5,
        duration: 60_000, // Tối đa 5 job/phút
      },
    }
  );

  worker.on("completed", (job, result) => {
    console.log(
      `[Worker] Job ${job.id} hoàn thành:`,
      result.success ? "OK" : result.error
    );
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} thất bại:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Lỗi worker:", err.message);
  });

  return worker;
}
