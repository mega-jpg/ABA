"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInviteHash = extractInviteHash;
exports.isInGroup = isInGroup;
exports.safeJoinByInvite = safeJoinByInvite;
exports.safeJoinByUsername = safeJoinByUsername;
exports.safeSendGif = safeSendGif;
exports.safeSendMessage = safeSendMessage;
exports.safeForwardMessage = safeForwardMessage;
exports.safeJoinGroup = safeJoinGroup;
exports.safeReact = safeReact;
exports.safeGetMe = safeGetMe;
const telegram_1 = require("telegram");
const goResult_1 = require("../goResult");
function extractInviteHash(inviteLink) {
    const trimmed = inviteLink.trim();
    if (trimmed.startsWith("https://t.me/+")) {
        return trimmed.replace("https://t.me/+", "");
    }
    if (trimmed.includes("joinchat/")) {
        return trimmed.split("joinchat/").pop()?.split("?")[0] ?? trimmed;
    }
    if (trimmed.startsWith("+")) {
        return trimmed.slice(1);
    }
    return trimmed;
}
async function isInGroup(client, chatId) {
    try {
        const entity = await client.getEntity(chatId);
        await client.invoke(new telegram_1.Api.channels.GetParticipant({
            channel: entity,
            participant: new telegram_1.Api.InputPeerSelf(),
        }));
        return true;
    }
    catch {
        return false;
    }
}
async function safeJoinByInvite(client, inviteLink) {
    return (0, goResult_1.tryAsync)(async () => {
        const hash = extractInviteHash(inviteLink);
        const result = await client.invoke(new telegram_1.Api.messages.ImportChatInvite({ hash }));
        const chats = result.chats;
        if (chats && chats.length > 0) {
            const chat = chats[0];
            return chat.className === "Channel" ? `-100${chat.id}` : `-${chat.id}`;
        }
        return inviteLink;
    });
}
async function safeJoinByUsername(client, username) {
    return (0, goResult_1.tryAsync)(async () => {
        const handle = username.startsWith("@") ? username : `@${username}`;
        const entity = await client.getEntity(handle);
        await client.invoke(new telegram_1.Api.channels.JoinChannel({ channel: entity }));
        return entity.className === "Channel"
            ? `-100${entity.id}`
            : `-${entity.id}`;
    });
}
async function safeSendGif(client, chatId, gifUrl, replyTo, caption) {
    return (0, goResult_1.tryAsync)(async () => {
        const message = await client.sendFile(chatId, {
            file: gifUrl,
            caption: caption || undefined,
            replyTo: replyTo,
            attributes: [new telegram_1.Api.DocumentAttributeAnimated()],
            forceDocument: false,
        });
        return message.id;
    });
}
async function safeSendMessage(client, chatId, text, replyTo) {
    return (0, goResult_1.tryAsync)(async () => {
        const message = await client.sendMessage(chatId, {
            message: text,
            replyTo: replyTo,
        });
        return message.id;
    });
}
async function safeForwardMessage(client, toChatId, fromPeer, messageId) {
    return (0, goResult_1.tryAsync)(async () => {
        const forwarded = await client.forwardMessages(toChatId, {
            messages: [messageId],
            fromPeer,
            dropAuthor: true,
        });
        const msg = forwarded[0];
        if (!msg) {
            throw new Error(`Forward tin #${messageId} từ ${fromPeer} thất bại`);
        }
        return msg.id;
    });
}
async function safeJoinGroup(client, inviteLink) {
    return safeJoinByInvite(client, inviteLink);
}
async function safeReact(client, chatId, messageId, reaction) {
    return (0, goResult_1.tryAsync)(async () => {
        await client.invoke(new telegram_1.Api.messages.SendReaction({
            peer: chatId,
            msgId: messageId,
            reaction: [new telegram_1.Api.ReactionEmoji({ emoticon: reaction })],
        }));
    });
}
async function safeGetMe(client) {
    return (0, goResult_1.tryAsync)(async () => {
        const me = await client.getMe();
        return {
            id: String(me.id),
            username: me.username ?? undefined,
        };
    });
}
