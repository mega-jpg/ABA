import { TelegramClient } from "telegram";
import { Api } from "telegram";
import { GoResult, tryAsync } from "../goResult";

/** Trích hash từ link mời: https://t.me/+HASH hoặc https://t.me/joinchat/HASH */
export function extractInviteHash(inviteLink: string): string {
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

export async function isInGroup(
  client: TelegramClient,
  chatId: string
): Promise<boolean> {
  try {
    const entity = await client.getEntity(chatId);
    await client.invoke(
      new Api.channels.GetParticipant({
        channel: entity,
        participant: new Api.InputPeerSelf(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function safeJoinByInvite(
  client: TelegramClient,
  inviteLink: string
): Promise<GoResult<string>> {
  return tryAsync(async () => {
    const hash = extractInviteHash(inviteLink);
    const result = await client.invoke(
      new Api.messages.ImportChatInvite({ hash })
    );
    const chats = (result as Api.Updates).chats;
    if (chats && chats.length > 0) {
      const chat = chats[0];
      return chat.className === "Channel" ? `-100${chat.id}` : `-${chat.id}`;
    }
    return inviteLink;
  });
}

export async function safeJoinByUsername(
  client: TelegramClient,
  username: string
): Promise<GoResult<string>> {
  return tryAsync(async () => {
    const handle = username.startsWith("@") ? username : `@${username}`;
    const entity = await client.getEntity(handle);
    await client.invoke(
      new Api.channels.JoinChannel({ channel: entity })
    );
    return entity.className === "Channel"
      ? `-100${entity.id}`
      : `-${entity.id}`;
  });
}

export async function safeSendGif(
  client: TelegramClient,
  chatId: string,
  gifUrl: string,
  replyTo?: number,
  caption?: string
): Promise<GoResult<number>> {
  return tryAsync(async () => {
    const message = await client.sendFile(chatId, {
      file: gifUrl,
      caption: caption || undefined,
      replyTo: replyTo,
      attributes: [new Api.DocumentAttributeAnimated()],
      forceDocument: false,
    });
    return message.id;
  });
}

export async function safeSendMessage(
  client: TelegramClient,
  chatId: string,
  text: string,
  replyTo?: number
): Promise<GoResult<number>> {
  return tryAsync(async () => {
    const message = await client.sendMessage(chatId, {
      message: text,
      replyTo: replyTo,
    });
    return message.id;
  });
}

export async function safeForwardMessage(
  client: TelegramClient,
  toChatId: string,
  fromPeer: string,
  messageId: number
): Promise<GoResult<number>> {
  return tryAsync(async () => {
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

/** @deprecated dùng safeJoinByInvite */
export async function safeJoinGroup(
  client: TelegramClient,
  inviteLink: string
): Promise<GoResult<string>> {
  return safeJoinByInvite(client, inviteLink);
}

export async function safeReact(
  client: TelegramClient,
  chatId: string,
  messageId: number,
  reaction: string
): Promise<GoResult<void>> {
  return tryAsync(async () => {
    await client.invoke(
      new Api.messages.SendReaction({
        peer: chatId,
        msgId: messageId,
        reaction: [new Api.ReactionEmoji({ emoticon: reaction })],
      })
    );
  });
}

export async function safeGetMe(
  client: TelegramClient
): Promise<GoResult<{ id: string; username?: string }>> {
  return tryAsync(async () => {
    const me = await client.getMe();
    return {
      id: String(me.id),
      username: me.username ?? undefined,
    };
  });
}
