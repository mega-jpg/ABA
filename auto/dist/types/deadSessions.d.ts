export interface DeadSessionEntry {
    id: string;
    reason: string;
    checkedAt: string;
    sourceFile?: string;
}
export interface DeadSessionsFile {
    updatedAt: string;
    total: number;
    sessions: DeadSessionEntry[];
}
