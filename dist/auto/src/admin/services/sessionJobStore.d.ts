export type SessionJobType = "build" | "filter";
export type SessionJobStatus = "pending" | "running" | "done" | "error";
export interface SessionJobProgress {
    id: string;
    type: SessionJobType;
    status: SessionJobStatus;
    phase: string;
    current: number;
    total: number;
    alive?: number;
    dead?: number;
    detail?: string;
    error?: string;
    result?: unknown;
    startedAt: string;
    finishedAt?: string;
}
export declare function createSessionJob(type: SessionJobType): SessionJobProgress;
export declare function getSessionJob(id: string): SessionJobProgress | undefined;
export declare function getActiveSessionJob(type?: SessionJobType): SessionJobProgress | undefined;
export declare function updateSessionJob(id: string, patch: Partial<Omit<SessionJobProgress, "id" | "type" | "startedAt">>): SessionJobProgress | undefined;
export declare function finishSessionJob(id: string, result: unknown): SessionJobProgress | undefined;
export declare function failSessionJob(id: string, error: string): SessionJobProgress | undefined;
