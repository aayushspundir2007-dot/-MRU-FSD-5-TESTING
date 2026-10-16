const Redis = require("ioredis");

const redisClient = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
});

redisClient.on("connect", () => {
  console.log("Redis database connected");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message || err);
});

module.exports = redisClient;
