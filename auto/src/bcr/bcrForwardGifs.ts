/** GIF/sticker forward từ kênh steelmess2 */
export interface BcrForwardGif {
  fromPeer: string;
  messageId: number;
  url: string;
}

export const BCR_FORWARD_GIFS: BcrForwardGif[] = [
  { fromPeer: "steelmess2", messageId: 1735, url: "https://t.me/steelmess2/1735" },
  { fromPeer: "steelmess2", messageId: 1737, url: "https://t.me/steelmess2/1737" },
  { fromPeer: "steelmess2", messageId: 1738, url: "https://t.me/steelmess2/1738" },
  { fromPeer: "steelmess2", messageId: 1739, url: "https://t.me/steelmess2/1739" },
];

export function pickRandomBcrForwardGif(): Pick<BcrForwardGif, "fromPeer" | "messageId"> {
  const gif = BCR_FORWARD_GIFS[Math.floor(Math.random() * BCR_FORWARD_GIFS.length)];
  return { fromPeer: gif.fromPeer, messageId: gif.messageId };
}
