import { CloneAccount } from "../types/seeding";
export declare function loadDeadClones(): Promise<void>;
export declare function markCloneAsDead(cloneId: string): Promise<void>;
export declare function isCloneDead(cloneId: string): boolean;
export declare function loadCloneAccounts(): Promise<CloneAccount[]>;
export declare function getCloneAccount(cloneId: string): Promise<CloneAccount | null>;
