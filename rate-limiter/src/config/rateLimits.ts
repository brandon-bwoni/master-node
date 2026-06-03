import type { RateLimitConfig } from "../core/rateLimiter.js";

export const rateLimitConfig: {
    global: RateLimitConfig;
    user:   RateLimitConfig;
} = {
    global: {
        strategy: "sliding_window",
        limit:    Number(process.env.RATE_LIMIT_GLOBAL_LIMIT  ?? 100),
        window:   Number(process.env.RATE_LIMIT_GLOBAL_WINDOW ?? 60_000),
    },
    user: {
        strategy: "token_bucket",
        rate:    Number(process.env.RATE_LIMIT_USER_LIMIT    ?? 100),
        capacity:   Number(process.env.RATE_LIMIT_USER_WINDOW   ?? 100),
    },
}