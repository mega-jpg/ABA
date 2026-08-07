import { CloneInfo, GroupInfo } from "../../types/customScenario";
export declare function loadDeadCloneIds(): Promise<Set<string>>;
export declare function listClones(): Promise<CloneInfo[]>;
export declare function listGroups(): Promise<GroupInfo[]>;
