-- KEYS[1] = key
-- ARGV[1] = now (ms)
-- ARGV[2] = window (ms)
-- ARGV[3] = limit

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove old entries
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)

local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now, (now .. "-" .. math.random()))
  redis.call("PEXPIRE", key, window)
  return {1, count + 1}
else
  return {0, count}
end