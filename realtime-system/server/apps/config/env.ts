export const env = {
  REDIS_URL: process.env.REDIS_URL || ("redis://localhost:6379" as string),
  JWT_SECRET: process.env.JWT_SECRET as string,
  PORT: parseInt(process.env.PORT || "3001", 10),
  LOG_LEVEL: process.env.LOG_LEVEL,
  HOST: process.env.HOST || "127.0.0.1",
  NODE_ID: process.env.NODE_ID || "unknown",
};
