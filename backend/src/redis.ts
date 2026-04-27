import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  retryStrategy: (times) => {
    if (times > 3) return null; // 超过3次重试就放弃，不影响主服务
    return Math.min(times * 200, 1000);
  },
});

redis.on('connect', () => console.log('Redis连接成功'));
redis.on('error', (err) => console.warn('Redis连接失败，降级为直查MySQL:', err.message));

export default redis;