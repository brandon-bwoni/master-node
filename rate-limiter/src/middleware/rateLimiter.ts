import { IncomingMessage, ServerResponse } from "http";
import { checkRateLimit } from "../core/rateLimiter.js";
import { rateLimitConfig} from "../config/rateLimits.js";


const globalConfig = rateLimitConfig.global;
const userConfig = rateLimitConfig.user;

function getUserId(req: IncomingMessage): string | null {
    // Replace with however you resolve identity —
    // parsed JWT claim, session lookup, API key header, etc.
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey === "string" && apiKey.length > 0) return apiKey;
    return null;
}

export async function applyRateLimit(
    req: IncomingMessage,
    res: ServerResponse
): Promise<boolean> {
    const id = getUserId(req);

    if (!id) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return false;
    }

    let globalResult, userResult;

    try {
        [globalResult, userResult] = await Promise.all([
            checkRateLimit("myservice:global", globalConfig),
            checkRateLimit(`myservice:user:${id}`, userConfig)
        ]);
    } catch (err) {
        console.error("Rate limiter unavailable:", err);
        return true;
    }


    const globalWindow = "window" in globalConfig ? globalConfig.window : 60_000;
    const userWindow   = "window" in userConfig   ? userConfig.window   : 60_000;

    // Always write quota headers so clients can self-regulate
    // res.setHeader("X-RateLimit-Limit-Global",       globalConfig.limit);
    // res.setHeader("X-RateLimit-Remaining-Global",   globalResult.remaining);
    // res.setHeader("X-RateLimit-Limit-User",         userConfig.limit);
    // res.setHeader("X-RateLimit-Remaining-User",     userResult.remaining);

    if (!globalResult.allowed || !userResult.allowed) {
        const retryAfterMs = !globalResult.allowed ? globalWindow : userWindow;

        res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            error:  "Too Many Requests",
            reason: !globalResult.allowed ? "system" : "user"
        }));
        return false;
    }

    return true;
}