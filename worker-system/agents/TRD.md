# TRD.md — Technical Requirements Document

## 1. Document Control

| Field | Value |
|---|---|
| Product | `@<npm-scope>/queue-core` |
| Type | Reusable TypeScript library |
| Status | Initial implementation specification |
| Primary runtime | Node.js `>=20` |
| Package manager | pnpm |
| Registry target | npm public registry initially |
| Repository host | GitHub |
| Architecture | Ports-and-adapters / clean architecture |

Replace `<npm-scope>` with the actual npm user or organization scope before publication.

---

## 2. Purpose

`queue-core` provides a stable, framework-agnostic and broker-agnostic queue API for Node.js applications.

It allows consuming applications to:

- add jobs to named queues;
- inspect normalized job state;
- register background processors;
- configure retries, delays, priorities, retention, and concurrency through portable options;
- receive lifecycle events;
- close queue and worker resources cleanly.

The package delegates persistence, queueing, distributed coordination, retries, locks, and worker execution to an adapter package.

---

## 3. Scope

### In scope for `queue-core`

- Canonical TypeScript types and public API.
- Input validation and default resolution.
- Core error hierarchy.
- Broker capability negotiation.
- Queue client and worker client factories.
- Adapter interfaces.
- Event contracts.
- Test utilities and fake adapter support.
- Package build, exports, release metadata, and documentation.

### Out of scope for `queue-core`

- BullMQ implementation.
- Redis connectivity or configuration.
- Native queue state machines.
- Distributed lock implementations.
- Scheduler polling.
- Dashboard application.
- HTTP integration.
- Business job handlers.
- Database transactional outbox implementation.

---

## 4. Functional Requirements

### FR-001: Create queue client

The package shall expose a factory that creates a queue client from a valid `QueueAdapter`.

```ts
const queue = createQueueClient({ adapter });
```

Acceptance criteria:

- the factory rejects missing or invalid adapters;
- no network connection is created merely by importing the package;
- configuration is immutable after construction.

### FR-002: Add job

The queue client shall support adding a JSON-safe payload to a named queue.

```ts
const job = await queue.add(
  "emails",
  "send-welcome-email",
  { userId: "usr_123" },
  { attempts: 3, delayMs: 30_000 },
);
```

Acceptance criteria:

- validates queue name and job name;
- validates option bounds;
- resolves documented defaults;
- rejects unsupported requested capabilities before delegating to adapter;
- returns a canonical `QueueJob<T>`;
- does not wait for the handler to run;
- maps adapter failures to `QueueAdapterError`.

### FR-003: Get job

The queue client shall return a canonical job snapshot by queue name and job ID.

```ts
const job = await queue.getJob("emails", "job_123");
```

Acceptance criteria:

- returns `null` when the adapter finds no matching job;
- does not expose adapter-native job types;
- maps unknown adapter state to `JobStatus = "unknown"`.

### FR-004: Get queue counts

The queue client shall expose portable counts.

```ts
const counts = await queue.getCounts("emails");
```

```ts
export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  deadLetter: number;
}
```

Acceptance criteria:

- values are non-negative integers;
- unsupported state categories return `0` only when this is semantically correct and documented by the adapter;
- no raw provider count keys are exposed.

### FR-005: Start worker

The package shall provide a worker client that delegates worker startup to a `WorkerAdapter`.

```ts
const handle = await workers.start({
  queueName: "emails",
  concurrency: 10,
  processor: async (job, context) => {
    await sendWelcomeEmail(job.data);
  },
});
```

Acceptance criteria:

- validates queue name, processor, and concurrency;
- does not expose native worker objects;
- returns a stable `WorkerHandle`;
- preserves generic payload type where possible.

### FR-006: Worker lifecycle

The worker handle shall support lifecycle management.

```ts
await handle.pause();
await handle.resume();
await handle.close({ graceful: true });
```

Acceptance criteria:

- `close({ graceful: true })` is capability-gated;
- lifecycle operations are idempotent where adapters can support that behavior;
- adapter failures map to a stable core error.

### FR-007: Event subscription

The package shall define normalized lifecycle events.

```ts
const unsubscribe = await events.subscribe("emails", (event) => {
  if (event.type === "job.failed") {
    reportFailure(event);
  }
});
```

Acceptance criteria:

- event payloads contain canonical job identifiers and timestamps;
- adapter-native event objects are not leaked;
- unsubscribe is safe to call more than once.

### FR-008: Capability reporting

Every adapter shall declare supported features.

```ts
if (!adapter.capabilities.priorities) {
  // caller can choose a fallback before enqueueing
}
```

Acceptance criteria:

- a requested unsupported feature results in `QueueCapabilityError`;
- capability values are available without performing a network operation;
- adapter documentation lists qualifications or limitations.

---

## 5. Non-Functional Requirements

### NFR-001: Framework agnosticism

No production code in `queue-core` may import an HTTP framework or framework-specific type.

### NFR-002: Broker agnosticism

No production code in `queue-core` may import broker, database, cache, or lock client libraries.

### NFR-003: Type safety

- TypeScript compilation uses `strict: true`.
- Public API does not use `any`.
- Package publishes `.d.ts` declarations.
- ESM import paths must be valid in a consumer project.

### NFR-004: Testability

- Core unit tests run without a network connection.
- Core tests use fake adapters.
- Tests achieve meaningful coverage of public behaviors and error paths.
- Time and ID generation are injectable when needed for deterministic tests.

### NFR-005: Reliability semantics

- The library must document at-least-once execution semantics.
- The library must document idempotent job handler requirements.
- The core must not promise backend behavior it does not control.

### NFR-006: Performance

Core operations should add negligible overhead beyond validation, default resolution, and mapping. The core must not poll, scan queues, or create persistent timers.

### NFR-007: Observability

The package must allow optional logging and lifecycle events without requiring a logging library. No job data is logged by default.

### NFR-008: Packaging quality

- package has a `files` allow-list;
- package has ESM and optional CJS exports if CJS support is intentionally offered;
- package validates output using `pnpm pack`, `publint`, and `@arethetypeswrong/cli`;
- package has `LICENSE`, `README.md`, repository metadata, keywords, and issue URL.

---

## 6. Core Public API

### Types

```ts
export type JobStatus =
  | "waiting"
  | "active"
  | "delayed"
  | "completed"
  | "failed"
  | "dead-letter"
  | "unknown";

export interface AddJobInput<T> {
  queueName: string;
  jobName: string;
  data: T;
  options?: JobOptions;
}

export interface WorkerRegistration<T> {
  queueName: string;
  processor: JobProcessor<T>;
  concurrency?: number;
  workerName?: string;
}

export type JobProcessor<T> = (
  job: QueueJob<T>,
  context: JobExecutionContext,
) => Promise<void>;

export interface JobExecutionContext {
  readonly workerId?: string;
  readonly signal?: AbortSignal;
  readonly attempt: number;
}
```

### Client API

```ts
export interface QueueClient {
  add<T>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions,
  ): Promise<QueueJob<T>>;

  getJob<T>(
    queueName: string,
    jobId: string,
  ): Promise<QueueJob<T> | null>;

  getCounts(queueName: string): Promise<QueueCounts>;

  close(): Promise<void>;
}

export interface WorkerClient {
  start<T>(registration: WorkerRegistration<T>): Promise<WorkerHandle>;
}
```

### Adapter API

```ts
export interface QueueAdapter {
  readonly name: string;
  readonly capabilities: QueueCapabilities;

  enqueue<T>(input: EnqueueJobInput<T>): Promise<QueueJob<T>>;
  getJob<T>(queueName: string, jobId: string): Promise<QueueJob<T> | null>;
  getCounts(queueName: string): Promise<QueueCounts>;
  close(): Promise<void>;
}

export interface WorkerAdapter {
  readonly capabilities: WorkerCapabilities;

  start<T>(registration: WorkerRegistration<T>): Promise<WorkerHandle>;
}
```

---

## 7. Validation Requirements

| Input | Rule |
|---|---|
| `queueName` | non-empty trimmed string; 1–128 characters; letters, numbers, `.`, `_`, `-`, `:` allowed |
| `jobName` | non-empty trimmed string; 1–128 characters |
| `data` | JSON-safe or adapter-supported serializable payload |
| `attempts` | integer in range 1–100 by default |
| `delayMs` | finite integer in range 0–2,147,483,647 unless adapter documents another limit |
| `priority` | finite integer in range -1,000,000–1,000,000 |
| `concurrency` | integer in range 1–1,000 |
| `jobId` | non-empty if supplied; must not contain undisclosed sensitive data |

Validation limits can be configurable only through an explicit `QueueCorePolicy` passed at construction.

---

## 8. Errors

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

Required error behavior:

- stable `code` for programmatic handling;
- human-readable `message`;
- original error preserved in `cause` when wrapping;
- no credential or full sensitive payload leakage.

---

## 9. Package Structure

```text
packages/queue-core/
├── src/
│   ├── application/
│   │   ├── dto/
│   │   ├── services/
│   │   └── validation/
│   ├── contracts/
│   │   ├── adapters/
│   │   ├── events/
│   │   └── factories/
│   ├── domain/
│   │   ├── entities/
│   │   ├── errors/
│   │   ├── events/
│   │   ├── types/
│   │   └── value-objects/
│   ├── shared/
│   │   ├── serialization/
│   │   └── utilities/
│   └── index.ts
├── test/
│   ├── fakes/
│   ├── contracts/
│   └── unit/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── LICENSE
├── Architecture.md
├── Rules.md
├── SKILLS.md
├── TRD.md
└── PRD.md
```

---

## 10. Package Metadata Baseline

```json
{
  "name": "@<npm-scope>/queue-core",
  "version": "0.1.0",
  "description": "Framework-agnostic and broker-agnostic queue contracts for Node.js.",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "sideEffects": false,
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Use `@<npm-scope>/queue-core` only after confirming the scope is owned by the intended npm account or organization.

---

## 11. Test and Quality Gates

Required pre-release commands:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm pack:check
```

Required release gate outcomes:

- all commands exit successfully;
- declaration files exist;
- tarball contains no tests, source maps with secrets, `.env`, credentials, or local configuration;
- package can be installed into a clean fixture using both `pnpm` and `npm`;
- ESM import works; CJS `require` works only if CJS is advertised;
- examples type-check against the packed tarball.

---

## 12. Delivery Milestones

### M1 — Core contracts

- domain types;
- errors;
- options and capability types;
- adapter contracts;
- validation;
- queue client;
- worker client;
- fake adapter;
- unit tests.

### M2 — In-memory adapter

- `queue-memory` package;
- contract test suite;
- basic worker lifecycle;
- examples.

### M3 — BullMQ adapter

- `queue-bullmq` package;
- BullMQ mapping;
- Redis-backed integration tests;
- retries, delays, priorities, events, graceful shutdown;
- adapter capability documentation.

### M4 — Release readiness

- complete README;
- API reference;
- Changesets;
- GitHub Actions CI;
- npm release workflow;
- installation fixtures.

### M5 — Optional integrations

- Fastify plugin;
- Express integration helpers;
- dashboard;
- observability adapter.
