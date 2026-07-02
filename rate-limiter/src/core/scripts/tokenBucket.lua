-- KEYS[1] = key
-- ARGV[1] = now
-- ARGV[2] = refill_rate (tokens/sec)
-- ARGV[3] = capacity

local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "last")

local tokens = tonumber(data[1]) 
if tokens == nil then
  tokens = capacity
end
local last = tonumber(data[2]) or now

local delta = now - last
local refill = delta * rate 
tokens = math.min(capacity, tokens + refill)


local ttl = math.ceil((capacity / rate) * 1000)

if tokens >= 1 then
    tokens = tokens -1 
    redis.call("HMSET", key, "tokens", tokens, "last", now)
    redis.call("PEXPIRE", key, ttl)
    return {1, tokens}
else
    redis.call("HMSET", key, "tokens", tokens, "last", now)
    redis.call("PEXPIRE", key, ttl)
    return {0, tokens}
end