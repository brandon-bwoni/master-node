import { checkSlidingWindow } from "./strategies/slidingWindow.js"
import { checkTokenBucket } from "./strategies/tokenBucket.js"

type SlidingWindowConfig = {
    strategy: "sliding_window";
    limit: number;
    window: number;
}

type TokenBucketConfig = {
    strategy: "token_bucket";
    rate: number;
    capacity: number;
}

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
};

export type RateLimitConfig = SlidingWindowConfig | TokenBucketConfig;

export async function checkRateLimit (
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    if(config.strategy === "sliding_window"){
        return checkSlidingWindow(key, config.limit, config.window)
    }
    if(config.strategy === "token_bucket"){
        return checkTokenBucket(key, config.rate, config.capacity)
    }

    const _exhaustive: never = config
    throw new Error(`Unhandled strategy: ${(_exhaustive as any).strategy}`);
}

