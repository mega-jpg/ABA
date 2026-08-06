export type SeedingAction =
  | "join"
  | "send_message"
  | "send_gif"
  | "forward_message"
  | "react";

export interface SeedingStepPayload {
  text?: string;
  gifUrl?: string;
  reaction?: string;
  replyToMsgId?: number;
  replyToPrevious?: boolean;
  inviteLink?: string;
  /** @username hoặc peer id — nguồn forward */
  forwardFromPeer?: string;
  forwardMessageId?: number;
}

export interface SeedingStep {
  cloneId: string;
  action: SeedingAction;
  payload: SeedingStepPayload;
  /** Seconds to wait before executing (use randomDelay for human-like behavior) */
  delayBefore: number;
}

export interface SeedingJobData extends SeedingStep {
  chatId: string;
  workflowId: string;
  stepIndex: number;
}

export interface SeedingScript {
  id: string;
  name: string;
  chatId: string;
  steps: SeedingStep[];
}

export interface CloneAccount {
  id: string;
  /** GramJS StringSession đã resolve từ file/json */
  session: string;
  proxy?: ProxyConfig;
  status: "active" | "dead" | "flood_wait";
  lastUsedAt?: Date;
  floodWaitUntil?: Date;
}

export interface ProxyConfig {
  type: "socks5" | "http";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface WorkflowState {
  workflowId: string;
  lastMessageId?: number;
  completedSteps: number;
  totalSteps: number;
  status: "pending" | "running" | "completed" | "failed";
  errors: string[];
}

export interface ActivityResult {
  success: boolean;
  messageId?: number;
  error?: string;
  retryable?: boolean;
}

/** Generate human-like random delay between min and max seconds */
export function randomDelay(minSec: number, maxSec: number): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}
