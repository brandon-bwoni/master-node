# Lua Scripts Guide

Deep dive into the Redis Lua scripts that power the rate limiting algorithms.

---

## Table of Contents

1. [Overview](#overview)
2. [Lua Basics for Redis](#lua-basics-for-redis)
3. [Sliding Window Script](#sliding-window-script)
4. [Token Bucket Script](#token-bucket-script)
5. [Script Execution](#script-execution)
6. [Debugging & Testing](#debugging--testing)
7. [Performance Optimization](#performance-optimization)
8. [Common Patterns](#common-patterns)

---

## Overview

### Why Lua Scripts?

Rate limiting requires **atomic operations** - operations that complete without interruption. Lua scripts in Redis execute atomically, ensuring:

```
Without Lua:
1. Read state              ← Race condition possible here
2. Calculate new state
3. Write state            ← Multiple clients can interfere

With Lua:
1. Read, calculate, write ← All atomic in one operation
```

### Script Lifecycle

```
1. Load Phase
   - Script stored in Redis
   - SHA-1 hash computed
   - Hash cached for subsequent calls

2. Execution Phase
   - Call EVALSHA with key/args
   - Script runs atomically
   - Returns result

3. Error Handling
   - NOSCRIPT → Reload script
   - Other errors → Propagate
```

---

## Lua Basics for Redis

### Redis Lua API

```lua
-- Call Redis commands
redis.call('COMMAND', key, arg1, arg2, ...)
redis.call('COMMAND', KEYS[1], ARGV[1], ARGV[2], ...)

-- Multiple commands in sequence (atomic)
redis.call('DEL', key)
redis.call('ZADD', key, score, member)
redis.call('EXPIRE', key, ttl)

-- Return values
return <value>
return {1, count}    -- Array
return redis.status_reply('OK')
return redis.error_reply('Error message')
```

### Lua Data Types

```lua
-- Numbers
local x = 42
local pi = 3.14

-- Strings
local key = "user:123"
local name = "Alice"

-- Tables (arrays)
local arr = {1, 2, 3}
local result = {1, 100}

-- Conditionals
if x > 10 then
  return 1
else
  return 0
end

-- Loops
for i = 1, 10 do
  redis.call('INCR', 'counter:' .. i)
end

-- Functions
local function add(a, b)
  return a + b
end
```

### Key Differences from JavaScript/Python

```lua
-- String concatenation uses '..'
local key = "prefix:" .. value

-- Array indices start at 1 (not 0)
local arr = {1, 2, 3}
print(arr[1])  -- Outputs: 1

-- nil (not null/undefined)
if value == nil then
  -- value is empty
end

-- tonumber() for type conversion
local num = tonumber(ARGV[1])

-- Math functions
math.min(a, b)
math.max(a, b)
math.random()
math.ceil(x)
```

---

## Sliding Window Script

### Full Script

**Location:** [src/core/scripts/slidingWindow.lua](src/core/scripts/slidingWindow.lua)

```lua
-- KEYS[1] = key (Redis key for this rate limit)
-- ARGV[1] = now (current time in milliseconds)
-- ARGV[2] = window (window duration in milliseconds)
-- ARGV[3] = limit (max requests allowed)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove entries older than the window
-- ZREMRANGEBYSCORE removes all entries with scores < (now - window)
-- Scores represent request timestamps
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)

-- Count remaining entries
local count = redis.call("ZCARD", key)

-- Check if request is allowed
if count < limit then
  -- Add new entry with current timestamp as both score and member
  -- Using timestamp + random ensures uniqueness
  redis.call("ZADD", key, now, (now .. "-" .. math.random()))

  -- Set expiration to the window duration
  -- This prevents memory bloat from abandoned keys
  redis.call("PEXPIRE", key, window)

  -- Return [1 (allowed), count + 1 (new total)]
  return {1, count + 1}
else
  -- Limit reached, request denied
  -- Return [0 (denied), count (current total)]
  return {0, count}
end
```

### Step-by-Step Execution Example

**Scenario:** Rate limit of 3 requests per 10 seconds

```
t=0s, now=1000
Request 1 arrives:
  1. ZREMRANGEBYSCORE key 0 (1000-10000) = Remove nothing (no entries)
  2. ZCARD key = 0
  3. 0 < 3? YES
  4. ZADD key 1000 "1000-0.54"
  5. PEXPIRE key 10000 (expires at t=10s)
  6. Return {1, 1}

Redis State: key = {(score: 1000, member: "1000-0.54")}

─────

t=2s, now=3000
Request 2 arrives:
  1. ZREMRANGEBYSCORE key 0 (3000-10000) = Remove nothing
  2. ZCARD key = 1
  3. 1 < 3? YES
  4. ZADD key 3000 "3000-0.89"
  5. PEXPIRE key 10000
  6. Return {1, 2}

Redis State: key = {
  (score: 1000, member: "1000-0.54"),
  (score: 3000, member: "3000-0.89")
}

─────

t=4s, now=5000
Request 3 arrives:
  1. ZREMRANGEBYSCORE key 0 (5000-10000) = Remove nothing
  2. ZCARD key = 2
  3. 2 < 3? YES
  4. ZADD key 5000 "5000-0.12"
  5. PEXPIRE key 10000
  6. Return {1, 3}

Redis State: key = {
  (score: 1000, member: "1000-0.54"),
  (score: 3000, member: "3000-0.89"),
  (score: 5000, member: "5000-0.12")
}

─────

t=6s, now=7000
Request 4 arrives:
  1. ZREMRANGEBYSCORE key 0 (7000-10000) = Remove nothing
  2. ZCARD key = 3
  3. 3 < 3? NO
  4. Return {0, 3}

Redis State: UNCHANGED (still 3 entries)

─────

t=12s, now=13000 (after window expires)
Request 5 arrives:
  1. ZREMRANGEBYSCORE key 0 (13000-10000) = Remove all!
     (All scores < 3000 are removed)
  2. ZCARD key = 0
  3. 0 < 3? YES
  4. ZADD key 13000 "13000-0.45"
  5. PEXPIRE key 10000
  6. Return {1, 1}

Redis State: key = {(score: 13000, member: "13000-0.45")}
```

### Data Structure Details

#### Sorted Set (ZSET) Operations

```redis
-- Add entries
ZADD key score member1 score member2

-- Count entries
ZCARD key → <number>

-- Get range by score
ZRANGE key min max BYSCORE → [members]

-- Remove by score range
ZREMRANGEBYSCORE key min max → <count removed>

-- Get count in score range
ZCOUNT key min max → <count>
```

#### Why Sorted Set?

```
Need: Find all requests within a time window

Options:
1. List  - O(n) to iterate and find old entries ✗
2. Hash  - No score range query capability ✗
3. Set   - No scoring capability ✗
4. ZSET  - O(log N + M) range query perfect! ✓

ZSET allows:
- O(1) addition
- O(log N) removal
- O(log N + M) range queries
```

### Tuning Parameters

#### Window Size

```lua
-- Small window (100ms):
window = 100
-- Pro: Fresh data, less memory
-- Con: More entries in memory, more cleanup operations

-- Large window (1 hour):
window = 3600000
-- Pro: Smooth averaging
-- Con: Large memory footprint

-- Typical: 60 seconds
window = 60000
```

#### Limit Size

```lua
-- Small limit (5):
limit = 5
-- Pro: Strict rate limiting
-- Con: Users can't burst, may feel restrictive

-- Large limit (10000):
limit = 10000
-- Pro: Allows traffic bursts
-- Con: Less effective at preventing abuse

-- Typical: 100-1000 per minute
```

#### TTL Expiration

```lua
-- Current: Expires at window duration
redis.call("PEXPIRE", key, window)

-- Why this duration?
-- If all requests removed after window,
-- why keep the key in memory longer?
-- Answer: Safety margin for edge cases

-- Alternative: Longer TTL for analytics
redis.call("PEXPIRE", key, window * 10)
-- Keeps data for analysis after limiting
```

---

## Token Bucket Script

### Full Script

**Location:** [src/core/scripts/tokenBucket.lua](src/core/scripts/tokenBucket.lua)

```lua
-- KEYS[1] = key (Redis key for this token bucket)
-- ARGV[1] = now (current time in milliseconds)
-- ARGV[2] = rate (tokens added per second)
-- ARGV[3] = capacity (max tokens)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])

-- Fetch current state (tokens and last update time)
local data = redis.call("HMGET", key, "tokens", "last")

-- Get tokens (or initialize to capacity if new)
local tokens = tonumber(data[1])
if tokens == nil then
  tokens = capacity
end

-- Get last update time (or use now if new)
local last = tonumber(data[2]) or now

-- Calculate elapsed time and refill
local delta = now - last              -- Milliseconds elapsed
local refill = delta * rate / 1000    -- Milliseconds to seconds: delta/1000, rate is per second
tokens = math.min(capacity, tokens + refill)

-- Calculate TTL: Time until bucket empties
-- At consumption rate, capacity / rate seconds = bucket duration
-- Convert to milliseconds and round up
local ttl = math.ceil((capacity / rate) * 1000)

-- Check if request can be served
if tokens >= 1 then
  -- Request approved, consume 1 token
  tokens = tokens - 1
  redis.call("HMSET", key, "tokens", tokens, "last", now)
  redis.call("PEXPIRE", key, ttl)
  return {1, tokens}
else
  -- Request denied, no tokens
  redis.call("HMSET", key, "tokens", tokens, "last", now)
  redis.call("PEXPIRE", key, ttl)
  return {0, tokens}
end
```

### Step-by-Step Execution Example

**Scenario:** 10 tokens/second, capacity 25 tokens

```
t=0s, now=1000, rate=10, capacity=25
Request 1 arrives:
  1. HMGET key "tokens" "last" = {nil, nil}
  2. tokens = 25 (capacity, first request)
  3. last = 1000 (now, first request)
  4. delta = 1000 - 1000 = 0 ms
  5. refill = 0 * 10 / 1000 = 0
  6. tokens = min(25, 25 + 0) = 25
  7. ttl = ceil((25/10)*1000) = 2500 ms
  8. 25 >= 1? YES
  9. tokens = 25 - 1 = 24
  10. HMSET key "tokens" 24 "last" 1000
  11. PEXPIRE key 2500
  12. Return {1, 24}

Redis State: key = {tokens: 24, last: 1000}

─────

t=100ms, now=1100
Request 2 arrives:
  1. HMGET key "tokens" "last" = {24, 1000}
  2. tokens = 24
  3. last = 1000
  4. delta = 1100 - 1000 = 100 ms
  5. refill = 100 * 10 / 1000 = 1.0
  6. tokens = min(25, 24 + 1.0) = 25
  7. ttl = 2500 ms
  8. 25 >= 1? YES
  9. tokens = 25 - 1 = 24
  10. HMSET key "tokens" 24 "last" 1100
  11. PEXPIRE key 2500
  12. Return {1, 24}

Redis State: key = {tokens: 24, last: 1100}

─────

t=1000ms, now=2000 (1 second later)
Request 3 arrives:
  1. HMGET key "tokens" "last" = {24, 1100}
  2. tokens = 24
  3. last = 1100
  4. delta = 2000 - 1100 = 900 ms
  5. refill = 900 * 10 / 1000 = 9.0
  6. tokens = min(25, 24 + 9.0) = 25 (capped at capacity)
  7. ttl = 2500 ms
  8. 25 >= 1? YES
  9. tokens = 25 - 1 = 24
  10. HMSET key "tokens" 24 "last" 2000
  11. PEXPIRE key 2500
  12. Return {1, 24}

Redis State: key = {tokens: 24, last: 2000}

─────

Burst Scenario: 25 immediate requests
t=2100ms, requests arrive rapidly

Request 1: tokens=24 → 23 (allowed)
Request 2: tokens=23 → 22 (allowed)
Request 3: tokens=22 → 21 (allowed)
...
Request 25: tokens=1 → 0 (allowed)
Request 26: tokens=0 → denied {0, 0}
Request 27: tokens=0 → denied {0, 0}

After burst, rate refills at 10/sec:
t=2200ms (100ms later): +1 token
t=2300ms (200ms later): +2 tokens total
...
```

### Data Structure Details

#### Hash Map (HMAP) Operations

```redis
-- Set multiple fields
HMSET key field1 value1 field2 value2

-- Get multiple fields
HMGET key field1 field2 → [value1, value2]

-- Set TTL
PEXPIRE key milliseconds

-- Individual operations
HGET key field → value
HSET key field value
HDEL key field
```

#### Why Hash Map?

```
Need: Store 2 values (tokens, last_time) per key

Options:
1. String (JSON) - decode/encode overhead ✗
2. List - not key-value ✗
3. Set - only one value type ✗
4. Hash - perfect for multiple fields! ✓

Hash allows:
- Atomic update of both fields
- Efficient storage
- Direct field access
```

### Floating Point Precision

```lua
-- Issue: Lua uses floating point
-- 0.1 + 0.2 = 0.30000000000000004

-- Refill calculation
refill = delta * rate / 1000

-- Example:
-- delta = 33ms, rate = 10 tokens/sec
-- refill = 33 * 10 / 1000 = 0.33

-- Problem: Accumulated errors over time
-- Solution: Use math.floor() when appropriate

tokens = tokens + refill    -- Floating point
if tokens >= 1 then         -- Works fine, >= comparison
  tokens = tokens - 1
  remaining = math.floor(tokens)  -- Floor when reporting
end
```

### TTL Calculation

```lua
local ttl = math.ceil((capacity / rate) * 1000)

-- Example calculations:
-- capacity=100, rate=10 tokens/sec
-- ttl = ceil((100/10)*1000) = ceil(10000) = 10000ms = 10s

-- capacity=1000, rate=100 tokens/sec
-- ttl = ceil((1000/100)*1000) = ceil(10000) = 10000ms = 10s

-- capacity=1, rate=0.001 tokens/sec
-- ttl = ceil((1/0.001)*1000) = ceil(1000000) = 1000000ms = 1000s

-- Why TTL?
-- Prevents memory bloat from abandoned keys
-- If key not accessed for TTL period, auto-expires
```

---

## Script Execution

### Loading Scripts

```typescript
// src/core/strategies/slidingWindow.ts

import fs from "fs";
import path from "path";
import { redis } from "../../infra/redisClient";

// Read script from file
const script = fs.readFileSync(
  path.join(__dirname, "../scripts/slidingWindow.lua"),
  "utf-8",
);

// Store SHA-1 hash (computed by Redis.script('LOAD'))
let sha: string | undefined;

// Load script into Redis cache
export async function loadScript(): Promise<void> {
  sha = (await redis.script("LOAD", script)) as string;
}

// Ensure loaded before execution
async function ensureLoaded(): Promise<string> {
  if (!sha) await loadScript();
  return sha!;
}

// Execute script
export async function checkSlidingWindow(
  key: string,
  limit: number,
  window: number,
) {
  const now = Date.now();
  const currentSha = await ensureLoaded();

  // Execute via EVALSHA
  const result = (await redis.evalsha(
    currentSha, // SHA-1 hash
    1, // Number of keys
    key, // KEYS[1]
    now, // ARGV[1]
    window, // ARGV[2]
    limit, // ARGV[3]
  )) as [number, number];

  const [allowed, count] = result;

  return {
    allowed: allowed === 1,
    remaining: Math.max(0, limit - count),
  };
}
```

### EVALSHA Flow

```
1. SCRIPT LOAD script
   ├─ Redis computes SHA-1: "abc123..."
   ├─ Stores script in memory
   └─ Returns SHA-1

2. EVALSHA sha numkeys key [key ...] arg [arg ...]
   ├─ Look up SHA-1 in cache
   ├─ Execute cached script
   └─ Return result

3. If NOSCRIPT error (Redis restarted):
   ├─ Reload script: SCRIPT LOAD
   ├─ Retry EVALSHA
   └─ Return result
```

### Error Handling

```typescript
async function checkSlidingWindow(...) {
  const currentSha = await ensureLoaded();

  const execute = () => redis.evalsha(
    currentSha, 1, key, now, window, limit
  );

  let result: [number, number];

  try {
    result = await execute();
  } catch (err: any) {
    // Handle NOSCRIPT (script lost, e.g., Redis restarted)
    if (err.message?.includes("NOSCRIPT")) {
      await loadScript();
      result = await execute();  // Retry
    } else {
      throw err;  // Re-throw other errors
    }
  }

  const [allowed, count] = result;
  return {
    allowed: allowed === 1,
    remaining: Math.max(0, limit - count)
  };
}
```

---

## Debugging & Testing

### Redis CLI Testing

#### Load Script

```redis
> SCRIPT LOAD "$(cat src/core/scripts/slidingWindow.lua)"
"abc123def456789..."

> SET script_sha "abc123def456789..."
OK
```

#### Execute Script

```redis
-- Test sliding window
> EVALSHA abc123... 1 "user:1" 1700000000 60000 100
1) (integer) 1
2) (integer) 1

> EVALSHA abc123... 1 "user:1" 1700000010 60000 100
1) (integer) 1
2) (integer) 2

-- Check Redis key
> ZCARD user:1
(integer) 2

> ZRANGE user:1 0 -1 WITHSCORES
1) "1700000000-0.54"
2) "1700000000"
3) "1700000010-0.89"
4) "1700000010"
```

#### Token Bucket Test

```redis
> EVALSHA token_sha 1 "bucket:1" 1000 10 25
1) (integer) 1
2) (integer) 24

> HGET bucket:1 tokens
"24"

> HGET bucket:1 last
"1000"

> EVALSHA token_sha 1 "bucket:1" 1100 10 25
1) (integer) 1
2) (integer) 24

> HGET bucket:1 tokens
"24"

> HGET bucket:1 last
"1100"
```

### Unit Tests

```typescript
// src/tests/slidingWindow.test.ts

import { checkSlidingWindow } from "../core/strategies/slidingWindow";

describe("Sliding Window", () => {
  test("allows requests within limit", async () => {
    const key = `test:${Date.now()}`;
    const limit = 5;
    const window = 10000;

    for (let i = 0; i < limit; i++) {
      const result = await checkSlidingWindow(key, limit, window);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }
  });

  test("blocks requests exceeding limit", async () => {
    const key = `test:${Date.now()}`;
    const limit = 3;
    const window = 10000;

    // Use up all tokens
    for (let i = 0; i < limit; i++) {
      await checkSlidingWindow(key, limit, window);
    }

    // Next request should be blocked
    const result = await checkSlidingWindow(key, limit, window);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("resets after window expires", async () => {
    const key = `test:${Date.now()}`;
    const limit = 2;
    const window = 100; // 100ms window

    // Fill bucket
    await checkSlidingWindow(key, limit, window);
    await checkSlidingWindow(key, limit, window);

    // Should be blocked
    let result = await checkSlidingWindow(key, limit, window);
    expect(result.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));

    // Should be allowed again
    result = await checkSlidingWindow(key, limit, window);
    expect(result.allowed).toBe(true);
  });
});
```

### Benchmarking Scripts

```bash
# Using redis-benchmark tool
redis-benchmark -h localhost -p 6379 \
  -c 100 \
  -n 100000 \
  -q \
  --csv

# Load test with autocannon
pnpm run loadtest
```

---

## Performance Optimization

### Script Optimization Techniques

#### 1. Minimize Redis Calls

**Before:**

```lua
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
local ttl = redis.call("TTL", key)
local members = redis.call("ZRANGE", key, 0, -1)
```

**After:**

```lua
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
-- Reuse count instead of fetching separately
```

#### 2. Use Local Variables

```lua
-- BAD: Repeated calls
if redis.call("ZCARD", key) < limit and
   redis.call("ZCARD", key) < limit then
  -- Do something
end

-- GOOD: Store in variable
local count = redis.call("ZCARD", key)
if count < limit and count < limit then
  -- Do something
end
```

#### 3. Batch Operations

```lua
-- BAD: Multiple operations
redis.call("DEL", key1)
redis.call("DEL", key2)
redis.call("DEL", key3)

-- GOOD: Batch (if possible)
-- Redis doesn't support batch DEL in same call,
-- but grouping similar operations is faster
```

### Latency Profile

```
Typical latencies (milliseconds):

Network round-trip:        0.5-1.0ms
ZREMRANGEBYSCORE:          0.1-0.5ms
ZCARD:                     0.05-0.1ms
ZADD:                      0.1-0.3ms
PEXPIRE:                   0.05-0.1ms
─────────────────────────────────────
Total per check:           1.0-2.5ms

Optimizations:
- Use connection pooling
- Minimize network round-trips
- Pre-compute values when possible
```

### Memory Optimization

```lua
-- High memory usage: Storing full timestamp + random
member = now .. "-" .. math.random()
-- ~30 bytes per entry

-- Lower memory: Just sequence numbers
member = count  -- 1, 2, 3, ...
-- ~2 bytes per entry

-- Trade-off: Uniqueness vs memory
-- Current approach: Balance both
```

---

## Common Patterns

### Pattern 1: Custom Rate Limit Logic

```lua
-- File: src/core/scripts/customRateLimit.lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local config = ARGV[2]  -- JSON config

-- Parse config
local limit = 100
local window = 60000

-- Custom logic: More generous on weekends
if os.date("%w") >= 6 then  -- Saturday/Sunday
  limit = limit * 2
end

-- Regular sliding window with modified limit
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now, now .. "-" .. math.random())
  redis.call("PEXPIRE", key, window)
  return {1, count + 1}
else
  return {0, count}
end
```

### Pattern 2: Quota Reservation

```lua
-- Reserve quota without consuming
-- Useful for checking if operation is allowed
local key = KEYS[1]
local required = tonumber(ARGV[1])

local data = redis.call("HMGET", key, "tokens")
local tokens = tonumber(data[1]) or capacity

if tokens >= required then
  return {1, tokens}  -- Can reserve
else
  return {0, tokens}  -- Cannot reserve
end
```

### Pattern 3: Cascade Rate Limiting

```lua
-- Check multiple tiers atomically
local user_key = KEYS[1]
local org_key = KEYS[2]
local global_key = KEYS[3]

-- Check all three in one atomic operation
local user_allowed = redis.call("ZCARD", user_key) < 100
local org_allowed = redis.call("ZCARD", org_key) < 1000
local global_allowed = redis.call("ZCARD", global_key) < 10000

if user_allowed and org_allowed and global_allowed then
  -- All tiers within limit
  redis.call("ZADD", user_key, now, member)
  redis.call("ZADD", org_key, now, member)
  redis.call("ZADD", global_key, now, member)
  return {1}
else
  return {0}
end
```

### Pattern 4: Adaptive Rate Limiting

```lua
-- Adjust limit based on current load
local key = KEYS[1]
local base_limit = tonumber(ARGV[1])

-- Check current queue depth
local pending = tonumber(redis.call("HGET", "queue", "pending")) or 0

-- Reduce limit if queue is deep
local adjusted_limit = base_limit
if pending > 1000 then
  adjusted_limit = math.floor(base_limit * 0.5)  -- 50% reduction
end

-- Continue with adjusted limit...
```

---

**Version:** 1.0.0  
**Last Updated:** June 2026
