# Architecture & Design Documentation

## Document Purpose

This document provides deep technical insights into the rate limiter's architecture, design decisions, and implementation patterns. It complements the main README.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Component Details](#component-details)
3. [Data Structures](#data-structures)
4. [Algorithm Explanations](#algorithm-explanations)
5. [Design Patterns](#design-patterns)
6. [Concurrency & Thread Safety](#concurrency--thread-safety)
7. [Scalability Considerations](#scalability-considerations)
8. [Implementation Walkthrough](#implementation-walkthrough)

---

## System Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│           HTTP/Network Layer                        │
│  - Node.js native HTTP module                       │
│  - Request/Response handling                        │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         Application Layer (Router)                  │
│  - Request routing                                  │
│  - Content negotiation                              │
│  - Health checks                                    │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         Middleware Layer (HTTP Middleware)          │
│  - Identity extraction                              │
│  - Request authorization                            │
│  - Rate limit enforcement                           │
│  - HTTP response formatting                         │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         Business Logic Layer (Core)                 │
│  - Rate limit strategy selection                    │
│  - Configuration management                         │
│  - Quota calculation                                │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│      Persistence Layer (Redis + Lua)                │
│  - Atomic script execution                          │
│  - Distributed state management                     │
│  - Key expiration (TTL)                             │
└────────────────────┬────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│         Redis Server                                │
│  - Sorted Sets (ZSET)                               │
│  - Hash Maps (HMAP)                                 │
│  - Expiration                                       │
└─────────────────────────────────────────────────────┘
```

### Request Flow Diagram

```
Client Request
    ↓
GET /api/sliding
x-api-key: user:123
    ↓
┌─────────────────────────────────┐
│   Router (server.ts)            │
│   - Route matching              │
└────────┬────────────────────────┘
         ↓
┌─────────────────────────────────┐
│   Middleware (rateLimiter.ts)   │
│   1. Extract API key            │
│   2. getUserId() = "user:123"   │
└────────┬────────────────────────┘
         ↓
┌─────────────────────────────────┐
│   Parallel Promise.all()        │
├────────┬────────────────────────┤
│ Global │ Per-User               │
│ Limit  │ Limit                  │
└────────┴────────────────────────┘
         ↓
┌─────────────────────────────────┐
│   checkRateLimit()              │
│   - Select strategy             │
│   - Dispatch to handler         │
└────────┬────────────────────────┘
         ↓
┌────────────────┬────────────────┐
│ Sliding        │ Token          │
│ Window         │ Bucket         │
└────────┬───────┴────────┬───────┘
         ↓                ↓
┌─────────────────────────────────┐
│   Redis.evalsha(sha, ...)       │
│   Execute Lua atomically        │
└────────┬────────────────────────┘
         ↓
    Redis Execution
    ↓
Return [allowed: 1/0, count/tokens: number]
    ↓
Both allowed?
    ├─ YES → res.statusCode = 200
    └─ NO  → res.statusCode = 429 + Retry-After
    ↓
Response to Client
```

---

## Component Details

### 1. Server Component (`src/server.ts`)

**Responsibilities:**

- HTTP server creation and lifecycle
- Request routing
- Error handling
- Lua script preloading

**Key Functions:**

```typescript
// Sends JSON with proper headers
sendJSON(res: ServerResponse, status: number, payload: unknown)

// Extracts pathname from request
getPath(req: IncomingMessage): string

// Main router function
router(req: IncomingMessage, res: ServerResponse)

// Server startup and initialization
start()
```

**Initialization Flow:**

```
1. Load Lua scripts into Redis cache
   - slidingWindow.lua
   - tokenBucket.lua
2. Create HTTP server
3. Bind request handler
4. Listen on port 3000
5. Log available endpoints
```

**Endpoints:**

- `GET /health` → 200 OK (no rate limiting)
- `GET /api/sliding` → Rate limited (sliding window strategy)
- `GET /api/token` → Rate limited (token bucket strategy)
- `GET /api/data` → Rate limited (global default config)
- `*` → 404 Not Found

---

### 2. Middleware Component (`src/middleware/rateLimiter.ts`)

**Responsibilities:**

- Extract user identity from request
- Enforce rate limits (global + per-user)
- Format HTTP 429 responses
- Set Retry-After headers

**Key Functions:**

```typescript
// Extract user identity (pluggable)
getUserId(req: IncomingMessage): string | null

// Main middleware function
applyRateLimit(
    req: IncomingMessage,
    res: ServerResponse
): Promise<boolean>
```

**Authentication Logic:**

```typescript
// Default: Extract from x-api-key header
function getUserId(req: IncomingMessage): string | null {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) return apiKey;
  return null;
}
```

**Rate Limit Check Flow:**

```
1. Extract API key from headers
   ├─ NOT FOUND → Return 401 Unauthorized
   └─ FOUND → Continue
2. Build cache keys
   ├─ Global: "myservice:global"
   └─ User: "myservice:user:{userId}"
3. Execute checks in parallel
   ├─ Global limit check
   └─ Per-user limit check
4. Evaluate results
   ├─ Both allowed → Return true (request proceeds)
   └─ Either blocked → Return 429 with Retry-After header
```

**Response Headers:**

```typescript
// Set on 429 response
Retry-After: <ceil(retryAfterMs / 1000)>  // In seconds

// Optional headers (uncomment in code)
X-RateLimit-Limit-Global: <number>
X-RateLimit-Remaining-Global: <number>
X-RateLimit-Limit-User: <number>
X-RateLimit-Remaining-User: <number>
```

---

### 3. Core Rate Limiter (`src/core/rateLimiter.ts`)

**Responsibilities:**

- Strategy dispatch
- Configuration validation
- Type safety for rate limit configs

**Key Function:**

```typescript
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult>;
```

**Type System:**

```typescript
type SlidingWindowConfig = {
  strategy: "sliding_window";
  limit: number; // Max requests
  window: number; // Time window (ms)
};

type TokenBucketConfig = {
  strategy: "token_bucket";
  rate: number; // Tokens per second
  capacity: number; // Max bucket size
};

type RateLimitConfig = SlidingWindowConfig | TokenBucketConfig;

type RateLimitResult = {
  allowed: boolean;
  remaining: number; // Remaining quota
};
```

**Strategy Dispatch Logic:**

```typescript
// Exhaustive match ensures all strategies are handled
if (config.strategy === "sliding_window") {
  return checkSlidingWindow(key, config.limit, config.window);
}
if (config.strategy === "token_bucket") {
  return checkTokenBucket(key, config.rate, config.capacity);
}
// TypeScript prevents adding strategy without handling
const _exhaustive: never = config;
throw new Error(`Unhandled strategy: ${(_exhaustive as any).strategy}`);
```

---

### 4. Strategy Components

#### Sliding Window (`src/core/strategies/slidingWindow.ts`)

**Responsibilities:**

- Load sliding window Lua script
- Execute EVALSHA for rate limit checks
- Handle script reloading on NOSCRIPT errors

**Key Functions:**

```typescript
// Load script into Redis cache, store SHA-1
export async function loadScript(): Promise<void>;

// Ensure script is loaded before execution
async function ensureLoaded(): Promise<string>;

// Execute rate limit check
export async function checkSlidingWindow(
  key: string,
  limit: number,
  window: number,
): Promise<RateLimitResult>;
```

**Error Handling:**

```
try:
    Execute EVALSHA with cached SHA
catch NOSCRIPT:
    Reload script
    Retry EVALSHA
catch other error:
    Re-throw
```

---

#### Token Bucket (`src/core/strategies/tokenBucket.ts`)

**Similar structure to Sliding Window**

**Key Functions:**

```typescript
export async function loadScript(): Promise<void>;
export async function checkTokenBucket(
  key: string,
  rate: number,
  capacity: number,
): Promise<RateLimitResult>;
```

---

### 5. Redis Client (`src/infra/redisClient.ts`)

**Responsibilities:**

- Create and configure Redis connection
- Error handling and logging
- Connection pooling

**Configuration:**

```typescript
const redis = new Redis({
  host: "localhost", // Redis server hostname
  port: 6379, // Standard Redis port
  maxRetriesPerRequest: null, // Important for Lua scripts
});

// Log connection errors
redis.on("error", (err) => {
  console.error("Redis error", err);
});
```

**Critical Setting Explanation:**

```
maxRetriesPerRequest: null

Why? Lua scripts must execute atomically.
Setting maxRetriesPerRequest: null allows:
- Blocking operations (scripts)
- Pub/Sub
- Other advanced features

Without it, Redis would retry failed scripts,
breaking atomicity guarantees.
```

---

### 6. Observability (`src/observability/metrics.ts`)

**Responsibilities:**

- Define Prometheus metrics
- Export registry for scraping

**Metrics Exported:**

```typescript
// Counter: requests allowed
allowedCounter = new Counter({
  name: "rate_limit_allowed_total",
  help: "Total allowed requests",
  labelNames: ["strategy", "tier"], // global | user
});

// Counter: requests blocked
blockedCounter = new Counter({
  name: "rate_limit_blocked_total",
  help: "Total blocked requests",
  labelNames: ["strategy", "tier", "reason"], // system | user
});

// Histogram: latency distribution
latencyHistogram = new Histogram({
  name: "rate_limit_check_duration_ms",
  help: "Duration of rate limit checks",
  labelNames: ["strategy"],
  buckets: [0.5, 1, 2, 5, 10, 20, 50],
});

// Counter: load test requests
requestsInFlight = new Counter({
  name: "load_test_requests_total",
  help: "Total load test requests",
  labelNames: ["status"], // 200 | 429 | error
});
```

**Usage Pattern:**

```typescript
// Record metric
allowedCounter.inc({ strategy: "sliding_window", tier: "user" });
latencyHistogram.observe({ strategy: "token_bucket" }, 2.5);

// Export for Prometheus
const metrics = registry.metrics();
```

---

### 7. Configuration (`src/config/rateLimits.ts`)

**Responsibilities:**

- Centralized rate limit configuration
- Environment variable integration

**Configuration Structure:**

```typescript
export const rateLimitConfig = {
  global: {
    strategy: "sliding_window",
    limit: Number(process.env.RATE_LIMIT_GLOBAL_LIMIT ?? 100),
    window: Number(process.env.RATE_LIMIT_GLOBAL_WINDOW ?? 60_000),
  },
  user: {
    strategy: "token_bucket",
    rate: Number(process.env.RATE_LIMIT_USER_LIMIT ?? 100),
    capacity: Number(process.env.RATE_LIMIT_USER_WINDOW ?? 100),
  },
};
```

---

## Data Structures

### Sliding Window: Redis Sorted Set (ZSET)

**Redis Command:** `ZADD`, `ZCARD`, `ZREMRANGEBYSCORE`

**Structure:**

```
Key: "myservice:global"
Type: Sorted Set

┌──────────────────────────────┐
│  Sorted Set (ZSET)           │
│  Members (requests)          │
├──────────────────────────────┤
│ Score      │ Member         │
├────────────┼────────────────┤
│ 1700000100 │ 1700000100-42  │  ← Timestamp - UUID
│ 1700000200 │ 1700000200-15  │
│ 1700000250 │ 1700000250-88  │
│ 1700000300 │ 1700000300-27  │
│ 1700000400 │ 1700000400-64  │
└──────────────────────────────┘

TTL: 60000ms (window duration)
```

**Operations:**

```lua
-- Remove entries older than window
ZREMRANGEBYSCORE key 0 (now - window)

-- Count current entries
ZCARD key

-- Add new entry
ZADD key now (now-uuid)

-- Expire key
PEXPIRE key window
```

**Memory Example:**

- 100 requests/minute
- ~50 bytes per entry
- ~5 KB per key for 1 hour of data

---

### Token Bucket: Redis Hash (HMAP)

**Redis Commands:** `HMGET`, `HMSET`, `PEXPIRE`

**Structure:**

```
Key: "myservice:user:user123"
Type: Hash

┌──────────────────────────────┐
│  Hash (HMAP)                 │
│  Token State                 │
├──────────────────────────────┤
│ Field      │ Value          │
├────────────┼────────────────┤
│ tokens     │ 95.3           │ ← Remaining tokens
│ last       │ 1700000500     │ ← Last update time (ms)
└──────────────────────────────┘

TTL: ~60000ms (capacity / rate * 1000)
```

**Operations:**

```lua
-- Fetch current state
HMGET key "tokens" "last"

-- Update state
HMSET key "tokens" <new_tokens> "last" <now>

-- Expire key
PEXPIRE key ttl
```

**Memory Example:**

- ~50 bytes per key
- Scales with number of unique users
- Low memory footprint

---

## Algorithm Explanations

### Sliding Window Algorithm (Detailed)

**Pseudocode:**

```
FUNCTION checkSlidingWindow(key, limit, window):
    now = current_time_ms()

    // Remove stale entries outside window
    ZREMRANGEBYSCORE(key, 0, now - window)

    // Count current entries
    count = ZCARD(key)

    IF count < limit:
        // Add new request entry
        ZADD(key, now, "{now}-{random()}")
        // Refresh TTL
        PEXPIRE(key, window)
        RETURN [1, count + 1]
    ELSE:
        // Limit exceeded
        RETURN [0, count]
```

**Time Complexity:**

- ZREMRANGEBYSCORE: O(log N + M) where M = removed entries
- ZCARD: O(1)
- ZADD: O(log N)
- Overall: O(log N + M)

**Space Complexity:** O(limit) per key

**Example Walkthrough:**

```
limit = 5 requests
window = 10 seconds
now = 1700000000

t=0s: Request 1 → ZADD key 1700000000 "1700000000-1" → allowed [1,1]
t=1s: Request 2 → ZADD key 1700000001 "1700000001-2" → allowed [1,2]
t=2s: Request 3 → ZADD key 1700000002 "1700000002-3" → allowed [1,3]
t=3s: Request 4 → ZADD key 1700000003 "1700000003-4" → allowed [1,4]
t=4s: Request 5 → ZADD key 1700000004 "1700000004-5" → allowed [1,5]
t=5s: Request 6 → count=5, limit=5 → rejected [0,5]
t=8s: Request 7 → count=5, limit=5 → rejected [0,5]
t=11s: Request 8 → ZREMRANGEBYSCORE removes first entry
                 → count=4, limit=5 → ZADD allowed [1,5]
```

---

### Token Bucket Algorithm (Detailed)

**Pseudocode:**

```
FUNCTION checkTokenBucket(key, rate, capacity):
    now = current_time_ms()

    // Fetch current state
    [tokens, last] = HMGET(key, "tokens", "last")

    IF tokens == null:
        tokens = capacity
        last = now

    // Calculate refill
    elapsed_ms = now - last
    elapsed_sec = elapsed_ms / 1000
    refill = elapsed_sec * rate
    tokens = MIN(capacity, tokens + refill)

    // TTL calculation
    ttl_ms = CEIL((capacity / rate) * 1000)

    IF tokens >= 1:
        // Allow request, consume token
        tokens -= 1
        HMSET(key, "tokens", tokens, "last", now)
        PEXPIRE(key, ttl_ms)
        RETURN [1, tokens]
    ELSE:
        // Deny request
        HMSET(key, "tokens", tokens, "last", now)
        PEXPIRE(key, ttl_ms)
        RETURN [0, tokens]
```

**Calculation Examples:**

```
Example 1: Standard rate limit
rate = 10 tokens/sec
capacity = 50 tokens

At t=0: Add 50 tokens
At t=1: Add 10 tokens (total: 50)
At t=2: Add 10 tokens (total: 50)
At t=0+5s: Made 45 requests, 5 tokens remaining

Burst allowance: Can process 50 requests immediately
Average rate: 10 requests/sec
```

```
Example 2: API with burst
rate = 100 tokens/sec
capacity = 1000 tokens

At t=0: Add 1000 tokens
Request 0.1s: Process 100 requests
Request 0.2s: Process 100 requests
Request 0.3s: Process 100 requests
Request 0.4s: Process 100 requests
Request 0.5s: Process 100 requests
Request 0.6s: Process 100 requests
Request 0.7s: Process 100 requests
Request 0.8s: Process 100 requests
Request 0.9s: Process 100 requests
Request 1.0s: Process 100 requests

All 1000 requests succeed due to burst capacity
After t=10s: 100 tokens/sec refill rate allows
continuous throughput at 100 req/sec
```

---

## Design Patterns

### 1. Strategy Pattern

**Pattern:** Encapsulate algorithms in interchangeable objects

**Implementation:**

```
RateLimitConfig (Strategy Selector)
    ├─ SlidingWindowConfig
    │   └─ checkSlidingWindow(lua)
    └─ TokenBucketConfig
        └─ checkTokenBucket(lua)
```

**Benefits:**

- Easy to add new strategies
- Runtime strategy selection
- Isolated algorithm logic

---

### 2. Repository Pattern

**Pattern:** Abstract data persistence layer

**Implementation:**

```typescript
// Redis acts as repository
redis.evalsha(sha, 1, key, ...args);
```

**Benefits:**

- Swappable storage (Redis, Memcached, etc.)
- Consistent data access interface

---

### 3. Middleware Pattern

**Pattern:** Chain of responsibility for request processing

**Implementation:**

```
Request
    ↓ Router
    ↓ applyRateLimit (Middleware)
    ↓ Route Handler
    ↓ Response
```

**Benefits:**

- Separation of concerns
- Reusable across routes
- Easy to add/remove

---

### 4. Dependency Injection

**Pattern:** Inject dependencies rather than creating them

**Implementation:**

```typescript
// Injected via import
import { redis } from "./infra/redisClient";

// Used in strategies
redis.evalsha(...)
```

**Benefits:**

- Testable (can mock Redis)
- Decoupled components
- Easy configuration

---

## Concurrency & Thread Safety

### Problem: Race Conditions

**Without atomic operations:**

```
Thread 1: Read count = 10
Thread 2: Read count = 10       ← Both see same value!
Thread 1: Write count = 11
Thread 2: Write count = 11      ← Overwrite Thread 1!

Result: Should be 12, but is 11 (lost update)
```

### Solution: Lua Scripts (Atomic Operations)

**Redis Lua scripts execute atomically:**

```lua
-- This entire block is atomic
-- No other script/command can interleave
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
if count < limit then
    redis.call("ZADD", key, now, member)
    return {1, count + 1}
else
    return {0, count}
end
```

**Thread Safety Guarantees:**

- Single Lua script execution per key
- No interleaving with other commands
- Redis blocks other commands during script

### Distributed System Considerations

**Multiple instances, single Redis:**

```
Server A ──────┐
Server B ──────┼─→ Redis (Single instance)
Server C ──────┘

All three servers use same Redis
All rate limit state centralized
Atomicity guaranteed by Redis Lua
```

**Multiple Redis instances (not recommended):**

```
Server A → Redis A
Server B → Redis B
Server C → Redis C

PROBLEM: No global view of traffic
PROBLEM: Users can bypass by hitting different servers
```

---

## Scalability Considerations

### Horizontal Scaling

**Architecture:**

```
Load Balancer
    ↓
    ├─ Server 1
    ├─ Server 2  ─────┐
    ├─ Server 3       │
    └─ Server 4       │
                      ↓
                  Shared Redis

All servers share same Redis instance
Rate limits apply globally across all servers
Single source of truth
```

**Benefits:**

- Transparent to clients
- Accurate rate limiting
- High availability (if Redis HA configured)

### Redis Scalability

**Single Redis Instance:**

- Handles 10k-50k ops/sec
- Suitable for small-medium deployments

**Redis Cluster:**

```
Cluster Node 1 (Slots 0-5460)
Cluster Node 2 (Slots 5461-10921)
Cluster Node 3 (Slots 10922-16383)

Lua script routes to correct slot
```

**Redis Sentinel (HA):**

```
Master Redis
    ├─ Replica 1
    └─ Replica 2
Sentinel monitors + failover
```

### Database Size

**Sliding Window:**

- 100 requests/min × 60 min = 6,000 entries
- ~50 bytes each = ~300 KB per key
- For 1M users = 300 GB (impractical)
- **Solution:** Aggressive TTL, or separate store for analytics

**Token Bucket:**

- One entry per user (~50 bytes)
- 1M users = ~50 MB (manageable)
- Much better for scaling

---

## Implementation Walkthrough

### Request Lifecycle: Complete Example

**Scenario:** User with API key "premium-user-1" makes request to `/api/sliding`

```
1. CLIENT sends:
   GET /api/sliding HTTP/1.1
   x-api-key: premium-user-1

2. SERVER.router() receives request
   path = "/api/sliding"
   → Matches slidingHandler route

3. slidingHandler() calls applyRateLimit()

4. applyRateLimit():
   a) getUserId(req)
      → Returns "premium-user-1"

   b) Build cache keys:
      - globalKey = "myservice:global"
      - userKey = "myservice:user:premium-user-1"

   c) Promise.all([
        checkRateLimit(globalKey, globalConfig),
        checkRateLimit(userKey, userConfig)
      ])

5. checkRateLimit("myservice:global", globalConfig):
   - Selects strategy = "sliding_window"
   - Calls checkSlidingWindow()

6. checkSlidingWindow():
   a) Ensure lua script loaded
   b) Execute redis.evalsha(sha, 1, key, now, window, limit)
   c) Redis executes lua atomically:
      - Remove old entries < (now - window)
      - Count current = 45 entries
      - Add new entry (within limit of 100)
      - Return [1, 46]
   d) Return {allowed: true, remaining: 54}

7. checkRateLimit("myservice:user:premium-user-1", userConfig):
   - Selects strategy = "token_bucket"
   - Calls checkTokenBucket()

8. checkTokenBucket():
   a) Ensure lua script loaded
   b) Execute redis.evalsha(sha, 1, key, now, rate, capacity)
   c) Redis executes lua atomically:
      - Fetch current tokens = 87.5
      - Calculate refill = (now - last) * rate = 2.5
      - New tokens = min(100, 87.5 + 2.5) = 90
      - Consume 1 token = 89
      - Return [1, 89]
   d) Return {allowed: true, remaining: 89}

9. Back in applyRateLimit():
   - globalResult.allowed = true
   - userResult.allowed = true
   - Both passed!
   - Return true

10. slidingHandler() receives true
    sendJSON(res, 200, {message: "Sliding window allowed"})

11. Response sent to client:
    HTTP/1.1 200 OK
    Content-Type: application/json

    {"message":"Sliding window allowed"}

12. CLIENT receives response
```

### Error Scenario Walkthrough

**Scenario:** Rate limit exceeded on global quota

```
1. applyRateLimit() checks in parallel

2. checkRateLimit("myservice:global") returns:
   {allowed: false, remaining: 0}

3. checkRateLimit("myservice:user:...") returns:
   {allowed: true, remaining: 50}

4. In applyRateLimit():
   if (!globalResult.allowed || !userResult.allowed)
      → TRUE (globalResult.allowed = false)

5. Determine retryAfter:
   retryAfterMs = globalWindow = 60_000 ms

6. Send response:
   res.setHeader("Retry-After", 60)
   res.writeHead(429)
   res.end({
     error: "Too Many Requests",
     reason: "system"
   })

7. CLIENT receives:
   HTTP/1.1 429 Too Many Requests
   Retry-After: 60
   Content-Type: application/json

   {"error":"Too Many Requests","reason":"system"}

8. CLIENT should wait 60 seconds before retry
```

---

## Deployment Considerations

### Environment Setup

```bash
# Redis must be running
redis-server

# Build TypeScript
npm run build

# Start server
NODE_ENV=production node dist/server.js

# Or with process manager (PM2)
pm2 start dist/server.js --name rate-limiter \
  --watch dist \
  --error dist/logs/error.log \
  --out dist/logs/output.log
```

### Configuration for Production

```bash
# .env.production
RATE_LIMIT_GLOBAL_LIMIT=50000
RATE_LIMIT_GLOBAL_WINDOW=60000
RATE_LIMIT_USER_LIMIT=1000
RATE_LIMIT_USER_WINDOW=1000

REDIS_HOST=redis-prod.company.com
REDIS_PORT=6379
REDIS_AUTH=...
```

### Monitoring Checklist

- [ ] Rate limit metrics exported to Prometheus
- [ ] Redis connection health monitored
- [ ] Latency (p50, p95, p99) tracked
- [ ] Request allow/deny ratio logged
- [ ] Alerting configured for anomalies

---

**Version:** 1.0.0  
**Last Updated:** June 2026
