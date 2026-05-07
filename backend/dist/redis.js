"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./env");
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    retryStrategy: (times) => {
        if (times > 3)
            return null; // 超过3次重试就放弃，不影响主服务
        return Math.min(times * 200, 1000);
    },
});
redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.warn('Redis connection failed, fallback to MySQL:', err.message));
exports.default = redis;
