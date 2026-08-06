import { SeedingConfigFile } from "../types/seedingConfig";
import { SeedingScript } from "../types/seeding";
export declare function buildScriptFromConfig(cfg: SeedingConfigFile): Promise<SeedingScript>;
export declare function createScriptFromConfigFile(): Promise<SeedingScript>;
