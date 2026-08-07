import { ProxyConfig } from "./seeding";
export type InteractionMode = "preset" | "random";
export type GroupPickStrategy = "first" | "random";
export type ClonePickStrategy = "first" | "random" | "round_robin";
export interface CloneConfig {
    id: string;
    enabled: boolean;
    label?: string;
    phone?: string;
    sessionFile?: string;
    session?: string;
    proxy?: ProxyConfig;
}
export interface GroupConfig {
    id: string;
    name: string;
    enabled: boolean;
    inviteLink?: string;
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
