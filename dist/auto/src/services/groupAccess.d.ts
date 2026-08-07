import { TelegramClient } from "telegram";
import { GoResult } from "../goResult";
export type GroupJoinInfo = {
    id: string;
    name?: string;
    inviteLink?: string;
    username?: string;
};
export declare function getGroupJoinInfo(chatId: string): Promise<GroupJoinInfo | null>;
export declare function ensureChatAccess(client: TelegramClient, chatId: string, cloneLabel?: string): Promise<GoResult<void>>;
