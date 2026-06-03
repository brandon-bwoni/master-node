# API Reference & Examples

Complete API documentation with practical examples for integrating with the rate limiter.

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Authentication](#authentication)
3. [Request Format](#request-format)
4. [Response Format](#response-format)
5. [HTTP Headers](#http-headers)
6. [Status Codes](#status-codes)
7. [Usage Examples](#usage-examples)
8. [Error Handling](#error-handling)
9. [Rate Limit Configuration](#rate-limit-configuration)
10. [Integration Patterns](#integration-patterns)

---

## API Endpoints

### Base URL

```
http://localhost:3000
```

---

## Health Check

**Endpoint:** `GET /health`

**Description:** Check server health status (no rate limiting)

**Request:**

```bash
curl -X GET http://localhost:3000/health
```

**Response (200 OK):**

```json
{
  "status": "ok"
}
```

**Use Case:** Load balancer health checks, monitoring endpoints

---

## Sliding Window Endpoint

**Endpoint:** `GET /api/sliding`

**Description:** Rate-limited endpoint using sliding window strategy

**Request:**

```bash
curl -X GET \
  -H "x-api-key: user:123" \
  http://localhost:3000/api/sliding
```

**Response (200 OK):**

```json
{
  "message": "Sliding window allowed"
}
```

**Response (429 Too Many Requests):**

```json
{
  "error": "Too Many Requests",
  "reason": "user"
}
```

**Headers:**

```
Retry-After: 45
```

---

## Token Bucket Endpoint

**Endpoint:** `GET /api/token`

**Description:** Rate-limited endpoint using token bucket strategy

**Request:**

```bash
curl -X GET \
  -H "x-api-key: user:456" \
  http://localhost:3000/api/token
```

**Response (200 OK):**

```json
{
  "message": "Token bucket allowed"
}
```

**Response (429 Too Many Requests):**

```json
{
  "error": "Too Many Requests",
  "reason": "user"
}
```

---

## Protected Data Endpoint

**Endpoint:** `GET /api/data`

**Description:** Protected endpoint with default configuration

**Request:**

```bash
curl -X GET \
  -H "x-api-key: user:789" \
  http://localhost:3000/api/data
```

**Response (200 OK):**

```json
{
  "data": "your payload here"
}
```

---

## Authentication

### Header-Based API Key

All endpoints (except `/health`) require the `x-api-key` header.

**Request:**

```bash
curl \
  -H "x-api-key: your-api-key-here" \
  http://localhost:3000/api/sliding
```

**Without API Key:**

```bash
curl http://localhost:3000/api/sliding
```

**Response (401 Unauthorized):**

```json
{
  "error": "Unauthorized"
}
```

### Customizing Authentication

Modify [src/middleware/rateLimiter.ts](src/middleware/rateLimiter.ts):

#### JWT Token Authentication

```typescript
import jwt from "jsonwebtoken";

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    return (decoded as any).sub; // User ID from JWT 'sub' claim
  } catch {
    return null;
  }
}
```

**Request:**

```bash
curl \
  -H "Authorization: Bearer eyJhbGc..." \
  http://localhost:3000/api/sliding
```

#### Session-Based Authentication

```typescript
const sessions = new Map<string, { userId: string }>();

function getUserId(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const sessionMatch = cookies.match(/session_id=([^;]+)/);
  if (!sessionMatch) return null;

  const sessionId = sessionMatch[1];
  const session = sessions.get(sessionId);
  return session?.userId || null;
}
```

**Request:**

```bash
curl \
  -H "Cookie: session_id=abc123def456" \
  http://localhost:3000/api/sliding
```

#### OAuth/External Service

```typescript
async function getUserId(req: IncomingMessage): Promise<string | null> {
  const token = req.headers.authorization?.slice(7);
  if (!token) return null;

  try {
    const response = await fetch("https://auth-service.com/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    return data.userId;
  } catch {
    return null;
  }
}
```

---

## Request Format

All requests follow standard HTTP conventions.

### Example: Full Request

```
GET /api/sliding HTTP/1.1
Host: localhost:3000
x-api-key: user:123
Content-Type: application/json
User-Agent: curl/7.64.1
Accept: */*
```

### Request Headers

| Header         | Required             | Description                                    |
| -------------- | -------------------- | ---------------------------------------------- |
| `x-api-key`    | Yes (except /health) | User/API key identifier                        |
| `Content-Type` | No                   | `application/json` (for future POST endpoints) |
| `Accept`       | No                   | `application/json`                             |

---

## Response Format

### Success Response (200 OK)

```json
{
  "message": "Sliding window allowed"
}
```

or

```json
{
  "data": "your payload here"
}
```

### Rate Limit Exceeded (429)

```json
{
  "error": "Too Many Requests",
  "reason": "user"
}
```

### Unauthorized (401)

```json
{
  "error": "Unauthorized"
}
```

### Not Found (404)

```json
{
  "error": "Not Found"
}
```

### Server Error (500)

```json
{
  "error": "Internal Server Error"
}
```

---

## HTTP Headers

### Request Headers

```
x-api-key: user:123          # Required (except /health)
Authorization: Bearer <token> # Alternative for custom auth
Cookie: session_id=...        # For session-based auth
```

### Response Headers

#### Success (200)

```
Content-Type: application/json
```

#### Rate Limited (429)

```
Content-Type: application/json
Retry-After: 45
```

The `Retry-After` header indicates seconds to wait before retrying:

- Global limit exceeded: Retry-After = global window in seconds
- User limit exceeded: Retry-After = user window in seconds

#### Unauthorized (401)

```
Content-Type: application/json
```

### Optional Response Headers

To enable quota reporting, uncomment these headers in middleware:

```typescript
res.setHeader("X-RateLimit-Limit-Global", globalConfig.limit);
res.setHeader("X-RateLimit-Remaining-Global", globalResult.remaining);
res.setHeader("X-RateLimit-Limit-User", userConfig.limit);
res.setHeader("X-RateLimit-Remaining-User", userResult.remaining);
```

Then requests will include:

```
X-RateLimit-Limit-Global: 100
X-RateLimit-Remaining-Global: 87
X-RateLimit-Limit-User: 100
X-RateLimit-Remaining-User: 94
```

---

## Status Codes

| Code    | Name                  | Scenario        | Meaning                 |
| ------- | --------------------- | --------------- | ----------------------- |
| **200** | OK                    | Request allowed | Rate limit check passed |
| **401** | Unauthorized          | No API key      | Authentication required |
| **404** | Not Found             | Invalid route   | Endpoint doesn't exist  |
| **429** | Too Many Requests     | Limit exceeded  | Rate limit triggered    |
| **500** | Internal Server Error | Server crash    | Unexpected error        |

---

## Usage Examples

### Example 1: Basic Integration with cURL

```bash
#!/bin/bash

API_KEY="user:123"
ENDPOINT="http://localhost:3000/api/sliding"

# Single request
curl -X GET \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT"

# With error handling
response=$(curl -s -w "\n%{http_code}" \
  -H "x-api-key: $API_KEY" \
  "$ENDPOINT")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" = "200" ]; then
  echo "Request allowed: $body"
elif [ "$http_code" = "429" ]; then
  echo "Rate limited. Retry after: $(curl -I -s \
    -H "x-api-key: $API_KEY" \
    "$ENDPOINT" | grep Retry-After)"
else
  echo "Error: $http_code - $body"
fi
```

### Example 2: JavaScript/Node.js

```javascript
const http = require("http");

function makeRequest(apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path: "/api/sliding",
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data),
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// Usage
(async () => {
  try {
    const result = await makeRequest("user:123");
    console.log(`Status: ${result.statusCode}`);
    console.log("Response:", result.body);

    if (result.statusCode === 429) {
      const retryAfter = parseInt(result.headers["retry-after"]);
      console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    }
  } catch (err) {
    console.error("Request failed:", err);
  }
})();
```

### Example 3: Python Integration

```python
import requests
import time
from datetime import datetime

class RateLimitedClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.api_key = api_key
        self.session = requests.Session()

    def make_request(self, endpoint, max_retries=3):
        """Make request with automatic retry on 429"""
        retry_count = 0

        while retry_count < max_retries:
            try:
                response = self.session.get(
                    f"{self.base_url}{endpoint}",
                    headers={"x-api-key": self.api_key},
                    timeout=5
                )

                if response.status_code == 200:
                    return response.json()

                elif response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 1))
                    print(f"[{datetime.now()}] Rate limited. Waiting {retry_after}s...")
                    time.sleep(retry_after)
                    retry_count += 1

                elif response.status_code == 401:
                    raise Exception("Unauthorized: Invalid API key")

                else:
                    raise Exception(f"Error {response.status_code}: {response.text}")

            except requests.exceptions.RequestException as e:
                print(f"Request error: {e}")
                raise

        raise Exception(f"Max retries ({max_retries}) exceeded")

# Usage
client = RateLimitedClient("http://localhost:3000", "user:123")
try:
    data = client.make_request("/api/sliding")
    print("Success:", data)
except Exception as err:
    print("Failed:", err)
```

### Example 4: Fetch API (Browser)

```javascript
async function makeRateLimitedRequest(endpoint, apiKey) {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    const response = await fetch(`http://localhost:3000${endpoint}`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "1");
      console.log(`Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      retries++;
      continue;
    }

    if (response.status === 401) {
      throw new Error("Unauthorized: Invalid API key");
    }

    throw new Error(`HTTP ${response.status}`);
  }

  throw new Error(`Max retries (${maxRetries}) exceeded`);
}

// Usage
makeRateLimitedRequest("/api/sliding", "user:123")
  .then((data) => console.log("Success:", data))
  .catch((err) => console.error("Error:", err));
```

### Example 5: Load Testing with Autocannon

```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon \
  --connections 10 \
  --duration 30 \
  --requests 1000 \
  -H "x-api-key: user:123" \
  http://localhost:3000/api/sliding
```

---

## Error Handling

### Client-Side Error Handling Pattern

```typescript
async function executeWithRateLimit(fn: () => Promise<any>) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      return await fn();
    } catch (err) {
      if (err.statusCode === 429) {
        // Rate limited
        const retryAfter = parseInt(err.headers["retry-after"] || "1");
        console.log(`Rate limited. Waiting ${retryAfter}s...`);

        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

        attempt++;
      } else if (err.statusCode === 401) {
        // Authentication failed - don't retry
        throw new Error("Authentication failed");
      } else {
        // Other errors
        throw err;
      }
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts`);
}
```

### Exponential Backoff Strategy

```typescript
async function exponentialBackoff(
  fn: () => Promise<any>,
  maxRetries = 5,
  initialDelayMs = 100,
) {
  let lastErr;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (err.statusCode !== 429) throw err;

      const delayMs = initialDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.1 * delayMs;

      console.log(
        `Attempt ${attempt + 1} failed. Retrying in ${delayMs + jitter}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }

  throw lastErr;
}
```

---

## Rate Limit Configuration

### Default Configuration

```typescript
Global Limit (Sliding Window):
- Limit: 100 requests
- Window: 60 seconds
- Strategy: Precise counting

User Limit (Token Bucket):
- Rate: 100 tokens/second
- Capacity: 100 tokens
- Strategy: Allows bursts
```

### Override via Environment Variables

```bash
# Global limit: 5000 requests per 5 minutes
export RATE_LIMIT_GLOBAL_LIMIT=5000
export RATE_LIMIT_GLOBAL_WINDOW=300000  # 5 min in ms

# User limit: 50 requests/sec with 500 burst capacity
export RATE_LIMIT_USER_LIMIT=50
export RATE_LIMIT_USER_WINDOW=500
```

### Tier-Based Configuration Example

Modify [src/config/rateLimits.ts](src/config/rateLimits.ts):

```typescript
export const rateLimitConfig = {
  free: {
    strategy: "token_bucket",
    rate: 10, // 10 req/sec
    capacity: 10, // No burst
  },

  pro: {
    strategy: "token_bucket",
    rate: 100, // 100 req/sec
    capacity: 500, // Allow 5s burst
  },

  enterprise: {
    strategy: "sliding_window",
    limit: 100000, // 100k req/min
    window: 60000,
  },
};
```

Modify middleware to use tier:

```typescript
function getUserTier(apiKey: string): "free" | "pro" | "enterprise" {
  if (apiKey.startsWith("free_")) return "free";
  if (apiKey.startsWith("pro_")) return "pro";
  return "enterprise";
}

// In applyRateLimit():
const tier = getUserTier(id);
const config = rateLimitConfig[tier];
```

---

## Integration Patterns

### Pattern 1: Express.js Middleware

```typescript
import express from "express";
import { applyRateLimit } from "./middleware/rateLimiter";

const app = express();

// Apply to specific routes
app.get("/api/data", async (req, res) => {
  const allowed = await applyRateLimit(req, res);
  if (!allowed) return;

  res.json({ data: "payload" });
});

// Apply to all routes
app.use(async (req, res, next) => {
  const allowed = await applyRateLimit(req, res);
  if (allowed) next();
});
```

### Pattern 2: API Gateway

```typescript
// Apply rate limiting at gateway level
async function gatewayMiddleware(req, res, next) {
  const allowed = await applyRateLimit(req, res);
  if (!allowed) return;

  // Route to backend
  proxy.web(req, res, { target: backendUrl });
}

app.use(gatewayMiddleware);
```

### Pattern 3: Microservices

```typescript
// Each service checks rate limits independently
async function rateLimitService() {
  return new Promise((resolve) => {
    const middleware = async (req, res, next) => {
      const allowed = await applyRateLimit(req, res);
      if (allowed) next();
    };

    resolve(middleware);
  });
}
```

---

**Version:** 1.0.0  
**Last Updated:** June 2026
