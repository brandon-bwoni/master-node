# Architecture.md — Queue Core Package

## 1. Architectural Goal

`queue-core` is the stable, reusable API and domain layer of a queueing ecosystem.

It is intentionally independent of:

- queue brokers such as BullMQ, RabbitMQ, Kafka, SQS, or a custom in-memory queue;
- storage technologies such as Redis or PostgreSQL;
- web frameworks such as Fastify, Express, NestJS, Hono, or Next.js;
- deployment topology.

The package gives applications one canonical queue API. Adapter packages translate that API into broker-specific behavior.

---

## 2. Package Topology

```text
workspace/
├── packages/
│   ├── queue-core/                 # framework and broker independent
│   ├── queue-bullmq/               # depends on queue-core + bullmq
│   ├── queue-memory/               # test/dev adapter; depends on queue-core
│   ├── queue-dashboard/            # optional; depends on queue-core
│   └── queue-fastify/              # optional; depends on queue-core
├── examples/
│   ├── fastify-api/
│   ├── express-api/
│   └── worker-service/
└── apps/
    └── documentation/
```

Dependency direction:

```text
queue-core  ←  queue-bullmq
queue-core  ←  queue-memory
queue-core  ←  queue-fastify
queue-core  ←  queue-dashboard
```

`queue-core` must never depend on a package to its right.

---

## 3. Layers Inside queue-core

```text
src/
├── domain/
│   ├── entities/
│   ├── errors/
│   ├── events/
│   ├── types/
│   └── value-objects/
├── application/
│   ├── dto/
│   ├── services/
│   └── validation/
├── contracts/
│   ├── adapters/
│   ├── events/
│   └── factories/
├── shared/
│   ├── result/
│   ├── serialization/
│   └── utilities/
└── index.ts
```

### Domain

Contains concepts that are true regardless of any broker:

- job identity;
- canonical job states;
- job options;
- retry policy;
- queue and worker capability types;
- library errors;
- lifecycle event payloads.

The domain may validate invariants, but it does not reach out to a broker.

### Application

Contains orchestration that turns public API calls into adapter calls:

- validate `add()` input;
- normalize defaults;
- call `QueueAdapter.enqueue()`;
- map responses to canonical DTOs;
- emit normalized core events;
- validate worker registration.

Application services know contracts, never concrete adapters.

### Contracts

Contains ports that adapter packages implement:

- `QueueAdapter`;
- `WorkerAdapter`;
- `QueueEventsAdapter`;
- optional capability interfaces;
- factory interfaces.

Contracts are the most important public boundary.

### Shared

Contains small, dependency-free helpers. It must not become a generic dumping ground.

---

## 4. Composition Root

The application chooses the adapter at startup.

```ts
import { createQueueClient, createWorkerClient } from "@<npm-scope>/queue-core";
import { createBullMQAdapter } from "@<npm-scope>/queue-bullmq";

const adapter = createBullMQAdapter({
  connection: {
    host: "127.0.0.1",
    port: 6379,
  },
});

export const queue = createQueueClient({ adapter });

export const workers = createWorkerClient({ adapter });
```

Only the composition root imports `@<npm-scope>/queue-bullmq`.

A Fastify route should import `queue`, not the BullMQ adapter:

```ts
fastify.post("/users", async (request) => {
  const user = await users.create(request.body);

  await queue.add("emails", "send-welcome-email", {
    userId: user.id,
  });

  return { userId: user.id };
});
```

---

## 5. Canonical Domain Model

### Canonical job state

```ts
/**
 * A portable lifecycle state. Adapters must map their native states to this set.
 */
export type JobStatus =
  | "waiting"
  | "active"
  | "delayed"
  | "completed"
  | "failed"
  | "dead-letter"
  | "unknown";
```

Not every adapter supports every state. `unknown` exists for safe mapping of backend-specific states without leaking them into the stable API.

### Job options

```ts
/**
 * Portable configuration for a queued job.
 *
 * Adapters must reject unsupported requested features with
 * `QueueCapabilityError`; they must not silently ignore them.
 */
export interface JobOptions {
  /** Maximum execution attempts, including the first attempt. Default: 1. */
  attempts?: number;

  /** Retry configuration. Only meaningful when attempts is greater than 1. */
  backoff?: BackoffOptions;

  /** Delay in milliseconds before the job becomes eligible for processing. */
  delayMs?: number;

  /** Higher values indicate higher priority in adapters that support priority. */
  priority?: number;

  /** Stable identifier for deduplication where supported by an adapter. */
  jobId?: string;

  /** Whether to retain job data after successful completion. */
  removeOnComplete?: boolean | RetentionPolicy;

  /** Whether to retain job data after terminal failure. */
  removeOnFail?: boolean | RetentionPolicy;

  /** Adapter-specific options, explicitly namespaced to avoid accidental coupling. */
  adapter?: Record<string, unknown>;
}

export interface BackoffOptions {
  type: "fixed" | "exponential";
  delayMs: number;
}

export interface RetentionPolicy {
  ageSeconds?: number;
  count?: number;
}
```

### Canonical job representation

```ts
export interface QueueJob<T = unknown> {
  id: string;
  queueName: string;
  name: string;
  data: T;
  status: JobStatus;
  options: ResolvedJobOptions;
  timestamps: JobTimestamps;
  attemptsMade: number;
  failure?: JobFailure;
}

export interface JobTimestamps {
  createdAt: number;
  processedAt?: number;
  finishedAt?: number;
}

export interface JobFailure {
  message: string;
  name?: string;
  stack?: string;
  failedAt: number;
}
```

---

## 6. Adapter Contracts

The initial stable contract should be narrow. Avoid copying every BullMQ method into core.

```ts
export interface QueueAdapter {
  /**
   * Declares the features the adapter can reliably support.
   */
  readonly capabilities: QueueCapabilities;

  /**
   * Persists a new job and makes it eligible according to its resolved options.
   */
  enqueue<T>(input: EnqueueJobInput<T>): Promise<QueueJob<T>>;

  /**
   * Returns a canonical job snapshot, or null when no matching job exists.
   */
  getJob<T>(queueName: string, jobId: string): Promise<QueueJob<T> | null>;

  /**
   * Returns counts mapped into portable lifecycle categories.
   */
  getCounts(queueName: string): Promise<QueueCounts>;

  /**
   * Releases connections and resources created by this adapter.
   */
  close(): Promise<void>;
}

export interface WorkerAdapter {
  readonly capabilities: WorkerCapabilities;

  /**
   * Starts a broker-backed worker and returns a handle for lifecycle control.
   */
  start<T>(
    registration: WorkerRegistration<T>,
  ): Promise<WorkerHandle>;
}

export interface QueueEventsAdapter {
  subscribe(
    queueName: string,
    listener: QueueEventListener,
  ): Promise<Unsubscribe>;
}
```

### Capability negotiation

```ts
export interface QueueCapabilities {
  retries: boolean;
  delays: boolean;
  priorities: boolean;
  deadLetterQueue: boolean;
  jobRetention: boolean;
  deduplication: boolean;
  jobEvents: boolean;
}

export interface WorkerCapabilities {
  concurrency: boolean;
  gracefulShutdown: boolean;
  distributedWorkers: boolean;
  rateLimiting: boolean;
}
```

When a caller requests an unsupported option, fail explicitly:

```ts
throw new QueueCapabilityError({
  feature: "priorities",
  adapter: "memory",
  message: "The configured adapter does not support job priorities.",
});
```

Do not silently downgrade behavior.

---

## 7. Runtime Flows

### Add a job

```text
Application
  │
  ▼
QueueClient.add()
  │ validate and resolve defaults
  ▼
QueueAdapter.enqueue()
  │ broker-specific persistence
  ▼
QueueJob (canonical result)
```

### Start a worker

```text
Application
  │
  ▼
WorkerClient.start()
  │ validate handler and options
  ▼
WorkerAdapter.start()
  │ native worker creation + native state management
  ▼
WorkerHandle
```

### Processing a job

```text
Broker-native worker
  │ receives native job
  ▼
Adapter maps native job → QueueJob
  │
  ▼
Core invokes JobHandler
  │
  ├── resolve → adapter acknowledges/completes
  └── reject  → adapter records failure/retries/DLQ
```

The adapter owns broker-native locks, state transitions, delays, retries, acknowledgements, and recovery. The core owns the portable API and canonical representation.

---

## 8. What Does Not Belong in queue-core

| Concern | Correct location |
|---|---|
| BullMQ `Queue`, `Worker`, `QueueEvents` | `queue-bullmq` |
| Redis connection options | `queue-bullmq` |
| Lua scripts | `queue-bullmq` |
| RabbitMQ channels | `queue-rabbitmq` |
| Fastify plugin registration | `queue-fastify` |
| HTTP routes | consuming application |
| queue dashboard UI | `queue-dashboard` |
| business handlers such as `send-email` | consuming application |
| database outbox implementation | consuming application or a dedicated package |

---

## 9. Extension Strategy

Add features through contracts and capabilities in this order:

1. Core type and capability definition.
2. Core validation and normalized public API.
3. In-memory adapter behavior and tests.
4. BullMQ adapter behavior and integration tests.
5. Documentation and examples.
6. Release with a changeset.

This prevents one adapter from becoming the accidental definition of the entire architecture.

---

## 10. Error Boundary

```ts
export class QueueError extends Error {
  readonly code: string;
  readonly cause?: unknown;
}

export class QueueValidationError extends QueueError {}
export class QueueCapabilityError extends QueueError {}
export class QueueAdapterError extends QueueError {}
export class QueueLifecycleError extends QueueError {}
```

Adapters must map unknown provider errors into `QueueAdapterError` while retaining the original error as `cause`.

Applications can safely branch on the stable error types without inspecting BullMQ-specific error messages.

---

## 11. Design Decisions

### At-least-once execution

`queue-core` documents at-least-once semantics because distributed queue systems cannot guarantee exactly-once external side effects in the general case.

Handlers must be idempotent. Example:

```ts
await emails.sendWelcome({
  idempotencyKey: `welcome:${job.data.userId}`,
  userId: job.data.userId,
});
```

### Serialization boundary

Job payloads should be structured-clone/JSON-safe. The adapter may serialize them; consumers must not rely on object identity or class methods surviving queue transport.

### Worker lifecycle

Workers must return a `WorkerHandle` with `pause`, `resume`, and `close` semantics. `close()` must support graceful shutdown where the adapter advertises that capability.

---

## 12. Testing Architecture

```text
queue-core
  ├── unit tests using fake adapters
  ├── contract tests against every adapter
  └── type-level tests for exported declarations

queue-bullmq
  ├── adapter unit tests
  └── Redis-backed integration tests

examples
  └── end-to-end workflow tests
```

Every adapter must pass the same reusable contract-test suite for the capabilities it claims.
