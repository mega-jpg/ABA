"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnection = getRedisConnection;
exports.getBullMQConnection = getBullMQConnection;
exports.closeRedisConnection = closeRedisConnection;
const ioredis_1 = require("ioredis");
const config_1 = require("../config");
let redisInstance = null;
function getRedisConnection() {
    if (!redisInstance) {
        redisInstance = new ioredis_1.Redis({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            maxRetriesPerRequest: null,
        });
    }
    return redisInstance;
}
function getBullMQConnection() {
    return {
        host: config_1.config.redis.host,
        port: config_1.config.redis.port,
        password: config_1.config.redis.password,
    };
}
async function closeRedisConnection() {
    if (redisInstance) {
        await redisInstance.quit();
        redisInstance = null;
    }
}
