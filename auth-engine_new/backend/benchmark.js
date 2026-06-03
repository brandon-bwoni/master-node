"use strict";

/**
 * auth-benchmark.js
 *
 * Autocannon benchmark suite for hybrid authentication.
 *
 * Tests five operations with costs derived from their constituent operations:
 *
 *  ┌─────────────────────┬──────────────────────────────────────────────┬──────────────────┐
 *  │ Endpoint            │ Operations in order                          │ Expected latency │
 *  ├─────────────────────┼──────────────────────────────────────────────┼──────────────────┤
 *  │ POST /auth/login    │ DB query + argon2.verify                     │ 51–105 ms        │
 *  │ GET  /auth/me       │ JWT verify only                              │ 0.1–0.3 ms       │
 *  │ POST /auth/refresh  │ Redis GET + JWT verify + DB query + Redis SET│ 1.4–7 ms         │
 *  │ POST /auth/logout   │ Redis DEL                                    │ 0.2–1 ms         │
 *  │ Mixed (realistic)   │ 80% /me, 10% /refresh, 5% /login, 5% logout │ weighted average │
 *  └─────────────────────┴──────────────────────────────────────────────┴──────────────────┘
 *
 * Usage:
 *   node auth-benchmark.js [--url http://localhost:3000] [--duration 20] [--connections 50]
 *
 * Prerequisites:
 *   npm install autocannon
 *   Your auth server must be running at the target URL
 *   A valid access token and refresh cookie must be obtainable via login
 */

import autocannon from "autocannon";
import { parseArgs } from "util";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    duration: { type: "string", default: "15" },
    connections: { type: "string", default: "50" },
    pipelining: { type: "string", default: "1" },
    warm: { type: "string", default: "3" }, // warmup duration in seconds
  },
  strict: false,
});

const BASE_URL = args.url;
const DURATION = parseInt(args.duration);
const CONNECTIONS = parseInt(args.connections);
const PIPELINING = parseInt(args.pipelining);
const WARM_DUR = parseInt(args.warm);

// ─── Expected latency thresholds (ms) ────────────────────────────────────────
// Derived directly from the operation costs provided.
// p99 adds ~2x headroom over theoretical minimum to account for:
//   - OS scheduling jitter
//   - GC pauses
//   - Connection overhead

const THRESHOLDS = {
  login: {
    // DB query (1–5ms) + argon2.verify (50–100ms)
    p50: 120, // ms — argon2 dominates; most requests should land here
    p99: 300, // ms — allows for Redis + DB variance + GC pause
    rps: 10, // req/s — argon2 is intentionally slow; high rps = pool exhaustion
  },
  me: {
    // JWT verify only (0.1–0.3ms) — no I/O
    p50: 5, // ms — includes HTTP overhead; pure verify is sub-ms
    p99: 20, // ms — allows for event loop lag under high concurrency
    rps: 2000, // req/s — should be very high; no I/O bottleneck
  },
  refresh: {
    // Redis GET (0.2–1ms) + JWT verify (0.1–0.3ms) + DB query (1–5ms) + Redis SET pipeline (0.2–1ms)
    p50: 15, // ms — two Redis round trips + one DB round trip
    p99: 50, // ms — allows for Redis + DB variance
    rps: 200, // req/s — Redis-bound; lower than /me but much higher than /login
  },
  logout: {
    // Redis DEL (0.2–1ms)
    p50: 5, // ms
    p99: 20, // ms
    rps: 500, // req/s
  },
  mixed: {
    // Weighted average: 80% me + 10% refresh + 5% login + 5% logout
    p50: 10, // ms — /me dominates the distribution
    p99: 100, // ms — tail driven by login requests in the mix
    rps: 500, // req/s
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obtain a valid access token and session cookies by logging in.
 * This runs before the benchmark to ensure all tests start with valid credentials.
 */
async function authenticate() {
  console.log(`\n[setup] Logging in at ${BASE_URL}/api/auth/login ...`);

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.BENCH_EMAIL || "jack@example.com",
      password: process.env.BENCH_PASSWORD || "1234567890",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const body = await res.json();
  const accessToken = body.accessToken;

  // Extract Set-Cookie headers — we need sid + refresh_token for refresh/logout tests
  const rawCookies = res.headers.getSetCookie?.() ?? [];
  const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");

  if (!accessToken) throw new Error("No accessToken in login response");
  if (!cookieStr) throw new Error("No cookies in login response");

  console.log(
    `[setup] Got access token (${accessToken.length} chars) and cookies`,
  );
  return { accessToken, cookieStr };
}

/**
 * Warm the server before benchmarking.
 * Eliminates JIT cold-start and connection pool spin-up from measurements.
 */
async function warmup(url, headers) {
  console.log(`\n[warmup] Warming ${url} for ${WARM_DUR}s ...`);
  await run({
    title: "warmup",
    url,
    headers,
    duration: WARM_DUR,
    connections: 10,
    silent: true,
  });
  console.log("[warmup] Done");
}

/**
 * Core autocannon runner — wraps the callback API in a Promise.
 *
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}   opts.url
 * @param {object}   [opts.headers]
 * @param {object}   [opts.body]
 * @param {string}   [opts.method]
 * @param {number}   [opts.duration]
 * @param {number}   [opts.connections]
 * @param {object[]} [opts.requests]     — for mixed/multi-request scenarios
 * @param {boolean}  [opts.silent]       — suppress progress output
 * @returns {Promise<object>}            autocannon result
 */
function run(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: opts.url,
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        duration: opts.duration ?? DURATION,
        connections: opts.connections ?? CONNECTIONS,
        pipelining: PIPELINING,
        requests: opts.requests, // used for mixed scenario
        // Timeout per request — if server doesn't respond in 10s, mark as error
        timeout: 10,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );

    if (!opts.silent) {
      autocannon.track(instance, {
        renderProgressBar: true,
        renderResultsTable: false, // we print our own table
      });
    }
  });
}

// ─── Result analysis ──────────────────────────────────────────────────────────

/**
 * Analyse an autocannon result against expected thresholds.
 * Prints a structured report and returns whether all thresholds passed.
 *
 * @param {string} name
 * @param {object} result    autocannon result object
 * @param {object} threshold
 * @returns {boolean}        true if all thresholds met
 */
function analyse(name, result, threshold) {
  const lat = result.latency;
  const req = result.requests;
  const errors = result.errors + result.timeouts;

  // Autocannon latency values are in milliseconds
  const p50 = lat.p50;
  const p99 = lat.p99;
  const p999 = lat.p999;
  const rps = Math.round(req.average);

  const p50Pass = p50 <= threshold.p50;
  const p99Pass = p99 <= threshold.p99;
  const rpsPass = rps >= threshold.rps;
  const allPass = p50Pass && p99Pass && rpsPass;

  const tick = (pass) => (pass ? "✓" : "✗");
  const bar = "─".repeat(56);

  console.log(`\n┌${bar}┐`);
  console.log(`│  ${name.padEnd(54)}│`);
  console.log(`├${bar}┤`);
  console.log(
    `│  ${"Metric".padEnd(20)} ${"Actual".padEnd(12)} ${"Threshold".padEnd(12)} ${"Pass".padEnd(6)}│`,
  );
  console.log(`├${bar}┤`);
  console.log(
    `│  ${"p50 latency".padEnd(20)} ${(p50 + " ms").padEnd(12)} ${("<= " + threshold.p50 + " ms").padEnd(12)} ${tick(p50Pass).padEnd(6)}│`,
  );
  console.log(
    `│  ${"p99 latency".padEnd(20)} ${(p99 + " ms").padEnd(12)} ${("<= " + threshold.p99 + " ms").padEnd(12)} ${tick(p99Pass).padEnd(6)}│`,
  );
  console.log(
    `│  ${"p999 latency".padEnd(20)} ${(p999 + " ms").padEnd(12)} ${"(info)".padEnd(12)} ${"".padEnd(6)}│`,
  );
  console.log(
    `│  ${"throughput".padEnd(20)} ${(rps + " rps").padEnd(12)} ${(">= " + threshold.rps + " rps").padEnd(12)} ${tick(rpsPass).padEnd(6)}│`,
  );
  console.log(
    `│  ${"errors".padEnd(20)} ${String(errors).padEnd(12)} ${"0".padEnd(12)} ${tick(errors === 0).padEnd(6)}│`,
  );
  console.log(
    `│  ${"total requests".padEnd(20)} ${String(result.requests.total).padEnd(26)}│`,
  );
  console.log(
    `│  ${"duration".padEnd(20)} ${(result.duration + "s").padEnd(26)}│`,
  );
  console.log(`└${bar}┘`);

  if (!allPass) {
    console.log(`  ⚠  Failures:`);
    if (!p50Pass)
      console.log(
        `     p50: ${p50}ms exceeded threshold of ${threshold.p50}ms`,
      );
    if (!p99Pass)
      console.log(
        `     p99: ${p99}ms exceeded threshold of ${threshold.p99}ms`,
      );
    if (!rpsPass)
      console.log(`     rps: ${rps} below minimum of ${threshold.rps}`);
  }

  // Actionable diagnosis based on which metric failed
  diagnose(name, { p50, p99, rps, errors, threshold });

  return allPass;
}

/**
 * Print a diagnosis when thresholds are breached.
 * Maps each failure mode to its likely cause based on the operation cost model.
 */
function diagnose(name, { p50, p99, rps, errors, threshold }) {
  const issues = [];

  if (p50 > threshold.p50) {
    if (name.includes("login")) {
      issues.push(
        "p50 too high: argon2 cost factor may be too high for this hardware, or DB query is slow (check indexes on users.email)",
      );
    } else if (name.includes("me")) {
      issues.push(
        "p50 too high for JWT-only path: event loop is blocked — check for synchronous operations in middleware",
      );
    } else if (name.includes("refresh")) {
      issues.push(
        "p50 too high: likely Redis latency — check Redis connection pool size and network proximity",
      );
    } else if (name.includes("logout")) {
      issues.push(
        "p50 too high: Redis DEL is slow — check Redis memory pressure or eviction policy",
      );
    }
  }

  if (p99 > threshold.p99) {
    issues.push(
      `p99 spike (${p99}ms): GC pause, connection pool exhaustion, or Redis/DB queue buildup under load`,
    );
  }

  if (rps < threshold.rps) {
    if (name.includes("login")) {
      issues.push(
        `Low rps (${rps}): expected — argon2 is CPU-bound; consider increasing Node cluster workers`,
      );
    } else {
      issues.push(
        `Low rps (${rps}): check connection pool limits — increase 'connections' in pool config or Redis maxclients`,
      );
    }
  }

  if (errors > 0) {
    issues.push(
      `${errors} errors/timeouts: server may be overwhelmed — reduce concurrency or check server logs`,
    );
  }

  if (issues.length > 0) {
    console.log(`  📋 Diagnosis:`);
    issues.forEach((i) => console.log(`     • ${i}`));
  }
}

// ─── Individual benchmark scenarios ──────────────────────────────────────────

/**
 * Scenario 1: Login
 * Cost: DB query (1–5ms) + argon2.verify (50–100ms)
 * This is the most expensive operation. Concurrency must be low or
 * your Node process will be saturated running argon2 on every core.
 *
 * We use LOW concurrency (10) intentionally — high concurrency here
 * does not increase throughput (CPU-bound), it just queues requests.
 */
async function benchLogin() {
  console.log("\n[1/5] Benchmarking POST /api/auth/login (argon2 + DB)...");
  console.log("      Note: low concurrency intentional — argon2 is CPU-bound");

  const result = await run({
    title: "login",
    url: `${BASE_URL}/api/auth/login`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      email: process.env.BENCH_EMAIL || "bench@example.com",
      password: process.env.BENCH_PASSWORD || "BenchmarkPass1!",
    },
    connections: 10, // low — argon2 is ~100ms/req, 10 concurrent = ~1000ms total CPU/s
    duration: DURATION,
  });

  return analyse(
    "POST /api/auth/login — argon2 + DB query",
    result,
    THRESHOLDS.login,
  );
}

/**
 * Scenario 2: Authenticated GET /me
 * Cost: JWT verify only (0.1–0.3ms) — no Redis, no DB
 * This is the fast path. Should sustain very high RPS.
 * Benchmark with high concurrency to find the true ceiling.
 */
async function benchMe(accessToken) {
  console.log("\n[2/5] Benchmarking GET /api/auth/me (JWT verify only)...");

  await warmup(`${BASE_URL}/api/auth/me`, {
    Authorization: `Bearer ${accessToken}`,
  });

  const result = await run({
    title: "me",
    url: `${BASE_URL}/api/auth/me`,
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return analyse(
    "GET /api/auth/me — JWT verify only (no I/O)",
    result,
    THRESHOLDS.me,
  );
}

/**
 * Scenario 3: Token refresh
 * Cost: Redis GET (0.2–1ms) + timingSafeEqual + DB query (1–5ms) + Redis pipeline SET+EXPIRE (0.2–1ms)
 * Medium cost. Redis-bound. Should sustain moderate RPS.
 *
 * Note: Each refresh rotates the token. Under benchmark load, rapid rotation means
 * subsequent requests use a stale cookie. We use a single connection to serialise
 * refreshes and avoid concurrent rotation conflicts.
 */
async function benchRefresh(cookieStr) {
  console.log("\n[3/5] Benchmarking POST /api/auth/refresh (Redis + DB)...");
  console.log(
    "      Note: single connection — token rotation requires serialised requests",
  );

  const result = await run({
    title: "refresh",
    url: `${BASE_URL}/api/auth/refresh`,
    method: "POST",
    headers: { Cookie: cookieStr },
    connections: 1, // serialised — each refresh rotates the token; concurrent would use stale tokens
    duration: DURATION,
  });

  return analyse(
    "POST /api/auth/refresh — Redis GET + DB + Redis SET pipeline",
    result,
    THRESHOLDS.refresh,
  );
}

/**
 * Scenario 4: Logout
 * Cost: Redis GET (session lookup) + Redis pipeline DEL (session) + SREM (index)
 * Cheap. Should be fast and high throughput.
 *
 * Note: logout invalidates the session. Under load, subsequent logout requests
 * hit missing sessions and return early (even faster). This is intentional —
 * we're measuring the Redis DEL cost, not session management logic.
 */
async function benchLogout(cookieStr) {
  console.log(
    "\n[4/5] Benchmarking POST /api/auth/logout (Redis DEL pipeline)...",
  );

  const result = await run({
    title: "logout",
    url: `${BASE_URL}/api/auth/logout`,
    method: "POST",
    headers: { Cookie: cookieStr },
  });

  return analyse(
    "POST /api/auth/logout — Redis DEL pipeline",
    result,
    THRESHOLDS.logout,
  );
}

/**
 * Scenario 5: Realistic mixed traffic
 * Distribution:
 *   80% GET /me         — authenticated page loads, API calls (JWT only)
 *   10% POST /refresh   — access token renewal (~every 15 min per user)
 *    5% POST /login     — new sessions, returning users
 *    5% POST /logout    — session termination
 *
 * This models a real application where most requests are authenticated
 * reads. The p99 here will be pulled up by the login requests in the mix.
 *
 * Autocannon's `requests` array cycles through in round-robin order.
 * We repeat /me entries 16x, /refresh 2x, /login 1x, /logout 1x = 20 total
 * to approximate the 80/10/5/5 distribution.
 */
async function benchMixed(accessToken, cookieStr) {
  console.log(
    "\n[5/5] Benchmarking mixed traffic (80% /me, 10% /refresh, 5% /login, 5% /logout)...",
  );

  const loginBody = JSON.stringify({
    email: process.env.BENCH_EMAIL || "bench@example.com",
    password: process.env.BENCH_PASSWORD || "BenchmarkPass1!",
  });
  const jsonHeaders = { "Content-Type": "application/json", Cookie: cookieStr };
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Cookie: cookieStr,
  };

  // Build the request cycle array: 16 + 2 + 1 + 1 = 20 requests per cycle
  // approximating the 80/10/5/5 distribution
  const requests = [
    // 16x GET /me — 80%
    ...Array(16).fill({
      method: "GET",
      path: "/api/auth/me",
      headers: authHeaders,
    }),
    // 2x POST /refresh — 10%
    ...Array(2).fill({
      method: "POST",
      path: "/api/auth/refresh",
      headers: jsonHeaders,
    }),
    // 1x POST /login — 5%
    {
      method: "POST",
      path: "/api/auth/login",
      headers: { "Content-Type": "application/json" },
      body: loginBody,
    },
    // 1x POST /logout — 5%
    {
      method: "POST",
      path: "/api/auth/logout",
      headers: jsonHeaders,
    },
  ];

  const result = await run({
    title: "mixed",
    url: BASE_URL,
    requests,
    duration: DURATION,
  });

  return analyse(
    "Mixed traffic — realistic production distribution",
    result,
    THRESHOLDS.mixed,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(results) {
  const bar = "─".repeat(56);
  const pass = results.filter(Boolean).length;
  const fail = results.length - pass;

  console.log(`\n\n┌${bar}┐`);
  console.log(`│  ${"BENCHMARK SUMMARY".padEnd(54)}│`);
  console.log(`├${bar}┤`);
  console.log(`│  Scenarios run:    ${String(results.length).padEnd(36)}│`);
  console.log(`│  Passed:           ${String(pass).padEnd(36)}│`);
  console.log(`│  Failed:           ${String(fail).padEnd(36)}│`);
  console.log(`├${bar}┤`);
  console.log(`│  Configuration                                         │`);
  console.log(`│    Base URL:       ${BASE_URL.padEnd(36)}│`);
  console.log(
    `│    Duration:       ${(DURATION + "s per scenario").padEnd(36)}│`,
  );
  console.log(`│    Connections:    ${String(CONNECTIONS).padEnd(36)}│`);
  console.log(`│    HTTP pipeline:  ${String(PIPELINING).padEnd(36)}│`);
  console.log(`└${bar}┘`);

  console.log("\n  Operation cost model used for thresholds:");
  console.log("    JWT verify (HMAC)  :  0.1–0.3  ms");
  console.log("    Redis GET          :  0.2–1    ms");
  console.log("    argon2 compare     :  50–100   ms");
  console.log("    DB query           :  1–5      ms");

  if (fail > 0) {
    console.log(`\n  ⚠  ${fail} scenario(s) did not meet thresholds.`);
    console.log(
      "     Review the per-scenario diagnosis above for actionable steps.\n",
    );
    process.exit(1);
  } else {
    console.log("\n  ✓ All scenarios met thresholds.\n");
    process.exit(0);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        Hybrid Auth — Autocannon Benchmark Suite      ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Target : ${BASE_URL}`);
  console.log(
    `  Duration: ${DURATION}s per scenario | Connections: ${CONNECTIONS}`,
  );

  let credentials;
  try {
    credentials = await authenticate();
  } catch (err) {
    console.error(`\n[fatal] Could not authenticate: ${err.message}`);
    console.error(
      "  Ensure the server is running and BENCH_EMAIL / BENCH_PASSWORD are set.",
    );
    process.exit(1);
  }

  const { accessToken, cookieStr } = credentials;
  const results = [];

  try {
    // Run scenarios sequentially — concurrent benchmarks skew each other's results
    results.push(await benchLogin());
    results.push(await benchMe(accessToken));
    results.push(await benchRefresh(cookieStr));
    results.push(await benchLogout(cookieStr));
    results.push(await benchMixed(accessToken, cookieStr));
  } catch (err) {
    console.error(`\n[error] Benchmark failed: ${err.message}`);
    process.exit(1);
  }

  printSummary(results);
}

main();
