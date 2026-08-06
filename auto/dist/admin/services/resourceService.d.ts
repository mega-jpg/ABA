import { CloneInfo, GroupInfo } from "../../types/customScenario";
/** ID session đã chết — từ .dead-clones.json và sessions.dead.json */
export declare function loadDeadCloneIds(): Promise<Set<string>>;
export declare function listClones(): Promise<CloneInfo[]>;
export declare function listGroups(): Promise<GroupInfo[]>;
