import { Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const allowedCounter = new Counter({
    name:       "rate_limit_allowed_total",
    help:       "Total number of requests allowed through the rate limiter",
    labelNames: ["strategy", "tier"] as const,  // tier: global | user
    registers:  [registry],
});

export const blockedCounter = new Counter({
    name:       "rate_limit_blocked_total",
    help:       "Total number of requests blocked by the rate limiter",
    labelNames: ["strategy", "tier", "reason"] as const, // reason: system | user
    registers:  [registry],
});

export const latencyHistogram = new Histogram({
    name:       "rate_limit_check_duration_ms",
    help:       "Duration of rate limit checks in milliseconds",
    labelNames: ["strategy"] as const,
    // Buckets tuned for Redis round-trips: sub-ms to 50ms range
    buckets:    [0.5, 1, 2, 5, 10, 20, 50],
    registers:  [registry],
});

export const requestsInFlight = new Counter({
    name:       "load_test_requests_total",
    help:       "Total autocannon requests fired during load test",
    labelNames: ["status"] as const,   // status: 200 | 429 | error
    registers:  [registry],
});