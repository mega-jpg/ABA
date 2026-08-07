import { TelegramClient } from "telegram";
import { GoResult } from "../goResult";
export declare function extractInviteHash(inviteLink: string): string;
export declare function isInGroup(client: TelegramClient, chatId: string): Promise<boolean>;
export declare function safeJoinByInvite(client: TelegramClient, inviteLink: string): Promise<GoResult<string>>;
export declare function safeJoinByUsername(client: TelegramClient, username: string): Promise<GoResult<string>>;
export declare function safeSendGif(client: TelegramClient, chatId: string, gifUrl: string, replyTo?: number, caption?: string): Promise<GoResult<number>>;
export declare function safeSendMessage(client: TelegramClient, chatId: string, text: string, replyTo?: number): Promise<GoResult<number>>;
export declare function safeForwardMessage(client: TelegramClient, toChatId: string, fromPeer: string, messageId: number): Promise<GoResult<number>>;
export declare function safeJoinGroup(client: TelegramClient, inviteLink: string): Promise<GoResult<string>>;
export declare function safeReact(client: TelegramClient, chatId: string, messageId: number, reaction: string): Promise<GoResult<void>>;
export declare function safeGetMe(client: TelegramClient): Promise<GoResult<{
    id: string;
    username?: string;
}>>;
