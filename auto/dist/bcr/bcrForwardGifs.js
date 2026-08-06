"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BCR_FORWARD_GIFS = void 0;
exports.pickRandomBcrForwardGif = pickRandomBcrForwardGif;
exports.BCR_FORWARD_GIFS = [
    { fromPeer: "steelmess2", messageId: 1735, url: "https://t.me/steelmess2/1735" },
    { fromPeer: "steelmess2", messageId: 1737, url: "https://t.me/steelmess2/1737" },
    { fromPeer: "steelmess2", messageId: 1738, url: "https://t.me/steelmess2/1738" },
    { fromPeer: "steelmess2", messageId: 1739, url: "https://t.me/steelmess2/1739" },
];
function pickRandomBcrForwardGif() {
    const gif = exports.BCR_FORWARD_GIFS[Math.floor(Math.random() * exports.BCR_FORWARD_GIFS.length)];
    return { fromPeer: gif.fromPeer, messageId: gif.messageId };
}
