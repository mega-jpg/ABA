import { SessionManifestEntry } from "../../types/sessionsManifest";
import { DeadSessionsFile } from "../../types/deadSessions";
export interface ImportFileInput {
    name: string;
    content: string;
}
export interface SessionStats {
    sessionsDir: string;
    pendingFiles: string[];
    manifest: {
        exists: boolean;
        generatedAt?: string;
        total: number;
        sessions: SessionManifestEntry[];
    };
    dead: {
        total: number;
        sessions: DeadSessionsFile["sessions"];
    };
}
export declare function getSessionStats(): Promise<SessionStats>;
export declare function importSessionFiles(files: ImportFileInput[]): Promise<{
    saved: string[];
    errors: string[];
}>;
export type SessionProgress = {
    phase: string;
    current: number;
    total: number;
    detail?: string;
    alive?: number;
    dead?: number;
};
export declare function buildSessionsManifest(onProgress?: (p: SessionProgress) => void): Promise<{
    count: number;
    sessions: Array<{
        id: string;
        format: string;
        preview: string;
    }>;
    manifestPath: string;
}>;
export declare function filterDeadSessions(options?: {
    concurrency?: number;
    onProgress?: (p: SessionProgress) => void;
}): Promise<{
    alive: number;
    dead: number;
    deadList: DeadSessionsFile["sessions"];
    aliveList: Array<{
        id: string;
        firstName?: string;
        username?: string;
    }>;
}>;
export declare function syncManifestToConfig(): Promise<{
    clones: number;
    groups: number;
}>;
