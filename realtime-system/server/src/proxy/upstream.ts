import type { IncomingMessage } from "http";
import { logger } from "../shared/logger.js";

// TYPES
interface UpstreamNode {
  url: string;
  healthy: boolean;
  lastChecked: number;
  failures: number;
  latencyMs: number;
}

// CONFIG
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const HEALTH_CHECK_PATH = "/health";
const FAILURE_THRESHOLD = 3;
const RECOVERY_THRESHOLD = 2;

// STATE
const upstreams: Map<string, UpstreamNode> = new Map(
  (
    process.env["UPSTREAM_NODES"] ??
    "http://localhost:3001,http://localhost:3002"
  )
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => [
      url,
      {
        url,
        healthy: true,
        lastChecked: 0,
        failures: 0,
        latencyMs: 0,
      },
    ]),
);

// const nodes = ["http://localhost:3001", "http://localhost:3002"];

const recoveryCounters = new Map<string, number>();

let healthCheckTimer: NodeJS.Timeout | null = null;

/**
 * ROUTING
 */

export function getUpstream(req: IncomingMessage): string | null {
  const healthy = healthyUpstreams();

  if (healthy.length === 0) {
    logger.error("No healthy upstreams available");
    return null;
  }

  const key = extractRoutingKey(req);
  const idx = hash(key) % healthy.length;
  const target = healthy[idx];

  if (!target) return null;

  logger.debug(
    { key, target: target.url, idx, healthyCount: healthy.length },
    "Upstream selected",
  );

  return target.url;
}

function extractRoutingKey(req: IncomingMessage): string {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = auth.slice(7).split(".")[1];
      if (payload) {
        const decoded = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Record<string, unknown>;
        if (typeof decoded["sub"] === "string") return decoded["sub"];
      }
    } catch {
      // Malformed token — fall through to IP-based routing
    }
  }

  // Fallback — use real client IP from X-Forwarded-For or socket
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? (forwarded[0] ?? "")
    : (forwarded?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown");

  return ip;
}

function healthyUpstreams(): UpstreamNode[] {
  return [...upstreams.values()].filter((n) => n.healthy);
}

/**
 * MARK UNHEALTHY
 */
export function markUnhealthy(url: string): void {
  const node = upstreams.get(normaliseUrl(url));
  if (!node) {
    logger.warn({ url }, "markUnhealthy called for unknown upstream");
    return;
  }

  // Idempotent — don't log repeatedly if already unhealthy
  if (node.healthy) {
    node.healthy = false;
    node.failures = FAILURE_THRESHOLD; // skip gradual failure ramp-up
    recoveryCounters.set(node.url, 0);

    logger.warn(
      { url: node.url, failures: node.failures },
      "Upstream marked unhealthy by proxy error",
    );
  }
}

/**
 * HEALTH CHECKS
 */
export function startHealthChecks(): NodeJS.Timeout {
  if (healthCheckTimer) {
    logger.warn("Health checks already running — ignoring duplicate start");
    return healthCheckTimer;
  }

  logger.info(
    { intervalMs: HEALTH_CHECK_INTERVAL_MS, nodes: [...upstreams.keys()] },
    "Starting upstream health checks",
  );

  void checkAllUpstreams();

  healthCheckTimer = setInterval(
    () => void checkAllUpstreams(),
    HEALTH_CHECK_INTERVAL_MS,
  );

  healthCheckTimer.unref();

  return healthCheckTimer;
}
export function stopHealthChecks(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    logger.info("Upstream health checks stopped");
  }
}

async function checkAllUpstreams(): Promise<void> {
  await Promise.allSettled(
    [...upstreams.values()].map((node) => checkUpstream(node)),
  );
}

async function checkUpstream(node: UpstreamNode): Promise<void> {
  const url = `${node.url}${HEALTH_CHECK_PATH}`;
  const startedAt = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HEALTH_CHECK_TIMEOUT_MS,
    );

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    node.latencyMs = Date.now() - startedAt;
    node.lastChecked = Date.now();

    if (res.ok) {
      onUpstreamSuccess(node);
    } else {
      onUpstreamFailure(node, new Error(`HTTP ${res.status}`));
    }
  } catch (err) {
    node.latencyMs = Date.now() - startedAt;
    node.lastChecked = Date.now();
    onUpstreamFailure(node, err as Error);
  }
}

/**
 * STATE TRANSITIONS
 */
function onUpstreamSuccess(node: UpstreamNode): void {
  node.failures = 0;

  if (!node.healthy) {
    const successes = (recoveryCounters.get(node.url) ?? 0) + 1;
    recoveryCounters.set(node.url, successes);

    if (successes >= RECOVERY_THRESHOLD) {
      node.healthy = true;
      recoveryCounters.set(node.url, 0);

      logger.info(
        { url: node.url, latencyMs: node.latencyMs },
        "Upstream recovered — marked healthy",
      );
    } else {
      logger.debug(
        { url: node.url, successes, threshold: RECOVERY_THRESHOLD },
        "Upstream recovering — not yet healthy",
      );
    }
  }
}

function onUpstreamFailure(node: UpstreamNode, err: Error): void {
  node.failures++;
  recoveryCounters.set(node.url, 0);

  if (node.healthy && node.failures >= FAILURE_THRESHOLD) {
    node.healthy = false;

    logger.warn(
      { url: node.url, failures: node.failures, err: err.message },
      "Upstream marked unhealthy after repeated failures",
    );
  } else if (!node.healthy) {
    logger.debug(
      { url: node.url, failures: node.failures, err: err.message },
      "Unhealthy upstream still failing",
    );
  }
}

/**
 * HELPERS
 */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h |= 0; // force 32-bit integer
  }
  return Math.abs(h);
}

function normaliseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

// METRICS
export function getUpstreamStats(): UpstreamNode[] {
  return [...upstreams.values()].map((n) => ({ ...n }));
}
