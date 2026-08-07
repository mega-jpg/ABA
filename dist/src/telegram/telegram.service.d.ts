export declare const TELEGRAM_SENDS_TEMP_DISABLED = false;
export declare class TelegramService {
    private readonly logger;
    private client;
    private isCommandHandlerStarted;
    private readonly perChatTail;
    private readonly lastOutgoingAt;
    private getMinGapMs;
    private getMinGapMsAoHand;
    private buildEditedPayloadFromLink;
    private normalizeChatKey;
    private runWithMinGap;
    constructor();
    connect(): Promise<void>;
    private getEntitySafe;
    sendMessage(chatId: string | number, message: string, opts?: {
        minGapMs?: number;
    }): Promise<void>;
    sendPhoto(chatId: string | number, photoPath: string, caption?: string, opts?: {
        minGapMs?: number;
    }): Promise<void>;
    sendVideo(chatId: string | number, videoPath: string, caption?: string): Promise<void>;
    forwardMessage(fromPeerStr: string | number, toPeerStr: string | number, messageId: number, opts?: {
        minGapMs?: number;
    }): Promise<void>;
    getAoHandMinGapMs(): number;
    fetchMessageTextFromLink(messageLink: string): Promise<{
        text: string;
    } | null>;
    forwardMessageFromLink(messageLink: string, toChatId: string | number, opts?: {
        minGapMs?: number;
    }): Promise<void>;
    sendEditedMessageFromLink(messageLink: string, toChatId: string | number, editFn: (text: string) => string): Promise<void>;
    sendEditedPhotoCaptionFromLink(messageLink: string, toChatId: string | number, photoPath: string, editFn: (text: string) => string, opts?: {
        minGapMs?: number;
    }): Promise<void>;
    startCommandHandler(): Promise<void>;
    stopCommandHandler(): void;
    disconnect(): Promise<void>;
}
