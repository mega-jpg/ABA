import { TelegramClient } from "telegram";
import { GoResult } from "../goResult";
export declare function getTelegramClient(cloneId: string): Promise<GoResult<TelegramClient>>;
export declare function disconnectClient(cloneId: string): Promise<void>;
export declare function disconnectAllClients(): Promise<void>;
