export type ScenarioAction = "send_message" | "send_gif" | "react" | "join";
export type BcrEventType = "win" | "draw" | "lose" | "qa";
export type ScenarioSource = "manual" | "bcr";
export interface ScenarioStep {
    id: string;
    cloneId: string;
    action: ScenarioAction;
    text?: string;
    gifUrl?: string;
    reaction?: string;
    replyToPrevious?: boolean;
    inviteLink?: string;
    delayBeforeSec: number;
    runAt?: string;
}
export interface CustomScenario {
    id: string;
    name: string;
    groupId: string;
    enabled: boolean;
    source?: ScenarioSource;
    eventType?: BcrEventType;
    scheduledAt?: string;
    steps: ScenarioStep[];
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    lastWorkflowId?: string;
}
export interface CreateScenarioInput {
    name: string;
    groupId: string;
    scheduledAt?: string;
    source?: ScenarioSource;
    eventType?: BcrEventType;
    steps: Omit<ScenarioStep, "id">[];
}
export interface BcrPubSubMessage {
    event: string;
    groupId?: string;
    roundId?: string;
    tableId?: string;
}
export interface CloneInfo {
    id: string;
    label: string;
    enabled: boolean;
}
export interface GroupInfo {
    id: string;
    name: string;
    enabled: boolean;
    inviteLink?: string;
}
