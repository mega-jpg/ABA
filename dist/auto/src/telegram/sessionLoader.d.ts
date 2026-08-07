import { ProxyConfig } from "../types/seeding";
export interface CloneMeta {
    session?: string;
    proxy?: ProxyConfig;
    phone?: string;
    label?: string;
}
export interface ResolvedSession {
    session: string;
    proxy?: ProxyConfig;
    source: "session-file" | "json-meta" | "seeding-config" | "sessions-manifest";
}
export declare function resolveCloneSession(cloneId: string, clonesDir: string): Promise<ResolvedSession>;
export declare function listCloneIds(clonesDir: string): Promise<string[]>;
