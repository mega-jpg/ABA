/** GIF/sticker forward từ kênh steelmess2 */
export interface BcrForwardGif {
    fromPeer: string;
    messageId: number;
    url: string;
}
export declare const BCR_FORWARD_GIFS: BcrForwardGif[];
export declare function pickRandomBcrForwardGif(): Pick<BcrForwardGif, "fromPeer" | "messageId">;
