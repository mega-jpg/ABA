"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBcrChannel = getBcrChannel;
exports.startBcrSubscriber = startBcrSubscriber;
exports.closeBcrSubscriber = closeBcrSubscriber;
exports.publishBcrTestEvent = publishBcrTestEvent;
const ioredis_1 = require("ioredis");
const config_1 = require("../config");
const bcrEventHandler_1 = require("./bcrEventHandler");
const CHANNEL = process.env.REDIS_BCR_CHANNEL ?? "bcr:events";
let subscriber = null;
function getBcrChannel() {
    return CHANNEL;
}
async function startBcrSubscriber() {
    if (subscriber)
        return subscriber;
    subscriber = new ioredis_1.Redis({
        host: config_1.config.redis.host,
        port: config_1.config.redis.port,
        password: config_1.config.redis.password,
    });
    await subscriber.subscribe(CHANNEL);
    subscriber.on("message", async (channel, message) => {
        if (channel !== CHANNEL)
            return;
        console.log(`[BCR Pub/Sub] Nhận event trên ${channel}:`, message.slice(0, 120));
        try {
            const result = await (0, bcrEventHandler_1.handleBcrPubSubMessage)(message);
            if (!result.ok) {
                console.warn(`[BCR Pub/Sub] ${result.message}`);
            }
            else {
                console.log(`[BCR Pub/Sub] ✅ ${result.message}`);
            }
        }
        catch (err) {
            console.error("[BCR Pub/Sub] Lỗi xử lý:", err.message);
        }
    });
    subscriber.on("error", (err) => {
        console.error("[BCR Pub/Sub] Redis error:", err.message);
    });
    console.log(`📡 BCR Pub/Sub đang subscribe channel: ${CHANNEL}`);
    return subscriber;
}
async function closeBcrSubscriber() {
    if (subscriber) {
        await subscriber.unsubscribe(CHANNEL);
        await subscriber.quit();
        subscriber = null;
    }
}
/** Publish test event (dùng cho debug) */
async function publishBcrTestEvent(event, groupId) {
    const redis = new ioredis_1.Redis({
        host: config_1.config.redis.host,
        port: config_1.config.redis.port,
        password: config_1.config.redis.password,
    });
    await redis.publish(CHANNEL, JSON.stringify({ event, groupId, roundId: `test-${Date.now()}` }));
    await redis.quit();
}
