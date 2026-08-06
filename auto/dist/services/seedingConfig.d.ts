import { SeedingConfigFile, CloneConfig } from "../types/seedingConfig";
export declare function getSeedingConfigPath(): string;
export declare function loadSeedingConfig(): Promise<SeedingConfigFile>;
export declare function clearSeedingConfigCache(): void;
export declare function getEnabledClones(cfg: SeedingConfigFile): CloneConfig[];
export declare function getEnabledGroups(cfg: SeedingConfigFile): import("../types/seedingConfig").GroupConfig[];
export declare function resolveTargetGroupId(cfg: SeedingConfigFile): string;
/** Resolve session path tuyệt đối từ clone config */
export declare function resolveSessionFilePath(clone: CloneConfig): string | null;
