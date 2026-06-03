// src/tests/loadTest.ts
import autocannon from "autocannon";
import type { Result, Instance } from "autocannon";
import { performance } from "perf_hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricCounters {
    allowed:      number;
    blocked:      number;
    errors:       number;
    totalLatency: number;
    latencies:    number[];
}

interface ScenarioConfig {
    title:         string;
    strategy:      "sliding_window" | "token_bucket";
    path:          string;
    connections:   number;
    duration:      number;
    apiKey:        string;
    expectedLimit: number;
}

// ─── In-process metric state ──────────────────────────────────────────────────

function makeCounters(): MetricCounters {
    return { allowed: 0, blocked: 0, errors: 0, totalLatency: 0, latencies: [] };
}

const obs = {
    allowedCounter: {
        inc(counters: MetricCounters) { counters.allowed++; },
    },
    blockedCounter: {
        inc(counters: MetricCounters) { counters.blocked++; },
    },
    latencyHistogram: {
        observe(counters: MetricCounters, duration: number) {
            counters.totalLatency += duration;
            counters.latencies.push(duration);
        },
    },
};

// ─── Config ───────────────────────────────────────────────────────────────────
function makeKey(): string {
  return `user:${Math.floor(Math.random() * 100000)}:${Date.now()}`
}

const BASE_URL      = process.env.SERVER_URL            ?? "http://localhost:3000";
const SLIDING_LIMIT = Number(process.env.RATE_LIMIT_USER_LIMIT ?? 100);
const TOKEN_LIMIT   = Number(process.env.RATE_LIMIT_USER_LIMIT ?? 100);

const scenarios: ScenarioConfig[] = [
    {
        title:         "Sliding window — single user burst",
        strategy:      "sliding_window",
        path:          "/api/sliding",
        connections:   10,
        duration:      10,
        apiKey:        makeKey(),
        expectedLimit: SLIDING_LIMIT,
    },
    {
        title:         "Sliding window — sustained load beyond limit",
        strategy:      "sliding_window",
        path:          "/api/sliding",
        connections:   50,
        duration:      15,
        apiKey:        makeKey(),
        expectedLimit: SLIDING_LIMIT,
    },
    {
        title:         "Token bucket — burst until empty",
        strategy:      "token_bucket",
        path:          "/api/token",
        connections:   20,
        duration:      10,
        apiKey:        makeKey(),
        expectedLimit: TOKEN_LIMIT,
    },
    {
        title:         "Token bucket — sustained load with refill",
        strategy:      "token_bucket",
        path:          "/api/token",
        connections:   5,
        duration:      30,
        apiKey:        makeKey(),
        expectedLimit: TOKEN_LIMIT,
    },
];

// ─── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
}

// ─── Result printer ───────────────────────────────────────────────────────────

function printScenarioResult(
    counters: MetricCounters,
    scenario: ScenarioConfig,
    elapsed: string
): void {
    const { allowed, blocked, errors, latencies } = counters;
    const total    = allowed + blocked + errors;
    const blockPct = total > 0 ? ((blocked / total) * 100).toFixed(1) : "0.0";
    const avgLat   = total > 0 ? (counters.totalLatency / total).toFixed(2) : "0.00";

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50    = percentile(sorted, 50).toFixed(2);
    const p95    = percentile(sorted, 95).toFixed(2);
    const p99    = percentile(sorted, 99).toFixed(2);
    const maxLat = (sorted[sorted.length - 1] ?? 0).toFixed(2);

    console.log(`\n✔  Completed in ${elapsed}s`);
    console.log(`\n   THROUGHPUT`);
    console.log(`   Total requests  : ${total}`);
    console.log(`   Allowed  (2xx)  : ${allowed}`);
    console.log(`   Blocked  (429)  : ${blocked}  (${blockPct}%)`);
    console.log(`   Errors          : ${errors}`);
    console.log(`\n   LATENCY (ms)`);
    console.log(`   Average         : ${avgLat}ms`);
    console.log(`   p50             : ${p50}ms`);
    console.log(`   p95             : ${p95}ms`);
    console.log(`   p99             : ${p99}ms`);
    console.log(`   max             : ${maxLat}ms`);

    const tolerance = scenario.expectedLimit * 1.10;
    if (allowed > tolerance) {
        console.warn(
            `\n   ⚠  LEAK DETECTED: ${allowed} allowed — ` +
            `expected ≤ ${scenario.expectedLimit} (tolerance ${tolerance.toFixed(0)})`
        );
    } else {
        console.log(`\n   ✓  Correctness OK: ${allowed} allowed ≤ limit ${scenario.expectedLimit}`);
    }
}

// ─── Summary table ────────────────────────────────────────────────────────────

function printSummary(
    rows: Array<{ scenario: ScenarioConfig; counters: MetricCounters }>
): void {
    console.log(`\n${"═".repeat(64)}`);
    console.log("LOAD TEST SUMMARY");
    console.log(`${"═".repeat(64)}`);
    console.log(
        `${"Strategy".padEnd(16)} ${"Title".padEnd(36)} ${"Allow".padStart(6)} ${"Block".padStart(6)} ${"Err".padStart(5)}`
    );
    console.log("─".repeat(64));

    for (const { scenario, counters } of rows) {
        console.log(
            `${scenario.strategy.padEnd(16)} ` +
            `${scenario.title.slice(0, 35).padEnd(36)} ` +
            `${String(counters.allowed).padStart(6)} ` +
            `${String(counters.blocked).padStart(6)} ` +
            `${String(counters.errors).padStart(5)}`
        );
    }
    console.log(`${"═".repeat(64)}`);
}

// ─── Scenario runner ──────────────────────────────────────────────────────────

async function runScenarioWithCounters(
    scenario: ScenarioConfig
): Promise<MetricCounters> {
    const counters = makeCounters();

    console.log(`\n${"─".repeat(64)}`);
    console.log(`▶  ${scenario.title}`);
    console.log(`   Strategy    : ${scenario.strategy}`);
    console.log(`   Connections : ${scenario.connections}`);
    console.log(`   Duration    : ${scenario.duration}s`);
    console.log(`   API key     : ${scenario.apiKey}`);
    console.log(`${"─".repeat(64)}`);

    const start = performance.now();

    const instance: Instance = autocannon({
    url:         `${BASE_URL}${scenario.path}`,
    connections: scenario.connections,
    duration:    scenario.duration,
    headers: {
        "x-api-key":    scenario.apiKey,
        "content-type": "application/json",
    },
    setupClient(client) {
        client.on("response", (statusCode: number, _resBytes: number, responseTime: number) => {
            obs.latencyHistogram.observe(counters, responseTime);

            if (statusCode === 200) {
                obs.allowedCounter.inc(counters);
            } else if (statusCode === 429) {
                obs.blockedCounter.inc(counters);
            } else {
                counters.errors++;
            }
        });
    },
}, () => {})

    autocannon.track(instance, { renderProgressBar: true });

    await new Promise<Result>((resolve, reject) => {
        instance.on("done", resolve);
        instance.on("error", reject);
    });

    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    printScenarioResult(counters, scenario, elapsed);

    return counters;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("═".repeat(64));
    console.log("RATE LIMITER LOAD TEST");
    console.log(`Target           : ${BASE_URL}`);
    console.log(`Sliding limit    : ${SLIDING_LIMIT} req/min`);
    console.log(`Token limit      : ${TOKEN_LIMIT} req/min`);
    console.log("═".repeat(64));

    const summaryRows: Array<{ scenario: ScenarioConfig; counters: MetricCounters }> = [];

    for (const scenario of scenarios) {
        const counters = await runScenarioWithCounters(scenario);
        summaryRows.push({ scenario, counters });

        if (scenarios.indexOf(scenario) < scenarios.length - 1) {
            console.log(`\n   Cooling down 5s...`);
            await new Promise(r => setTimeout(r, 5_000));
        }
    }

    printSummary(summaryRows);
    process.exit(0);
}

main().catch(err => {
    console.error("Load test failed:", err);
    process.exit(1);
});