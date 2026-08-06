import { ProxyConfig } from "./seeding";

export type InteractionMode = "preset" | "random";
export type GroupPickStrategy = "first" | "random";
export type ClonePickStrategy = "first" | "random" | "round_robin";

export interface CloneConfig {
  id: string;
  enabled: boolean;
  label?: string;
  phone?: string;
  /** Đường dẫn file session (ưu tiên) — vd: clones/84326098841.session */
  sessionFile?: string;
  /** Hoặc dán trực tiếp GramJS StringSession */
  session?: string;
  proxy?: ProxyConfig;
}

export interface GroupConfig {
  id: string;
  name: string;
  enabled: boolean;
  /** Link mời private group: https://t.me/+HASH */
  inviteLink?: string;
  /** Username group public (không cần @) */
  username?: string;
}

export interface PresetStepConfig {
  cloneId: string;
  action: "send_message" | "send_gif" | "react" | "join";
  text?: string;
  gifUrl?: string;
  reaction?: string;
  replyToPrevious?: boolean;
  delayBeforeSec: number;
}

export interface RandomInteractionConfig {
  minSteps: number;
  maxSteps: number;
  messages: string[];
  reactions: string[];
  actions: Array<"send_message" | "react">;
  delayMinSec: number;
  delayMaxSec: number;
  pickClone: ClonePickStrategy;
}

export interface SeedingConfigFile {
  mode: InteractionMode;
  clones: CloneConfig[];
  groups: GroupConfig[];
  target: {
    /** ID group cố định, hoặc bỏ trống để dùng pickGroup */
    groupId?: string;
    pickGroup: GroupPickStrategy;
  };
  interaction: {
    preset: {
      name: string;
      steps: PresetStepConfig[];
    };
    random: RandomInteractionConfig;
  };
}
