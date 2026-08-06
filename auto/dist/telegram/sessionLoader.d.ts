import { ProxyConfig } from "../types/seeding";
export interface CloneMeta {
    /** GramJS StringSession — chuỗi bắt đầu bằng "1" */
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
/**
 * Load session cho 1 clone theo thứ tự ưu tiên:
 * 1. clones/sessions.manifest.json
 * 2. seeding.config.json
 * 3. clones/{id}.session
 * 4. clones/{id}.json
 */
export declare function resolveCloneSession(cloneId: string, clonesDir: string): Promise<ResolvedSession>;
/** Liệt kê cloneId từ manifest + seeding.config + thư mục clones/ */
export declare function listCloneIds(clonesDir: string): Promise<string[]>;
