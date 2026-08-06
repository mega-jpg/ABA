export type ScenarioAction = "send_message" | "send_gif" | "react" | "join";
/** Kết quả BCR từ hệ thống kéo nhóm */
export type BcrEventType = "win" | "draw" | "lose" | "qa";
export type ScenarioSource = "manual" | "bcr";
export interface ScenarioStep {
    id: string;
    cloneId: string;
    action: ScenarioAction;
    text?: string;
    /** URL file .gif / .mp4 (Telegram animation) */
    gifUrl?: string;
    reaction?: string;
    replyToPrevious?: boolean;
    inviteLink?: string;
    /** Chờ bao nhiêu giây trước khi thực hiện bước này */
    delayBeforeSec: number;
    /** Thời điểm chạy tuyệt đối (ISO). Nếu có, ưu tiên hơn delayBeforeSec */
    runAt?: string;
}
export interface CustomScenario {
    id: string;
    name: string;
    groupId: string;
    enabled: boolean;
    /** manual = tạo tay, bcr = template tự động từ Pub/Sub */
    source?: ScenarioSource;
    /** win | draw | lose — chỉ với source bcr */
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
/** Payload Pub/Sub từ service kéo nhóm BCR */
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
