# SKILLS.md — Queue Core Engineering Guide

## Purpose

This document is the working guide for any assistant or contributor modifying `queue-core`.

`queue-core` is a reusable, framework-agnostic TypeScript package. It defines the public queue API, canonical domain model, validation, capability contracts, lifecycle abstractions, and application-level orchestration. It must **not** import or depend on BullMQ, Redis, Fastify, Express, NestJS, a database client, or any queue broker.

BullMQ belongs in a separate adapter package such as `@<npm-scope>/queue-bullmq`.

---

## Project Intent

Build a queue abstraction that applications can use consistently:

```ts
import { createQueueClient } from "@<npm-scope>/queue-core";

// Adapter construction belongs to the composition root, not application logic.
const queue = createQueueClient({ adapter });

await queue.add("emails", "send-welcome-email", {
  userId: "usr_123",
});
```

A Fastify route, Express controller, CLI command, scheduled task, or background service should all use the same `queue-core` API.

---

## Technology and Tooling

| Concern | Standard |
|---|---|
| Language | TypeScript with `strict: true` |
| Runtime | Node.js `>=20` |
| Module format | ESM-first |
| Package manager | pnpm |
| Test runner | Vitest |
| Linting | ESLint |
| Formatting | Prettier |
| Build output | `tsup` or `tsc` to `dist/` |
| Versioning | SemVer + Changesets |
| Documentation | JSDoc for every public API |

Recommended development dependencies:

```bash
pnpm add -D typescript tsup vitest @vitest/coverage-v8 eslint prettier \
  @changesets/cli publint are-the-types-wrong
```

The core package must not list BullMQ or `ioredis` in `dependencies`, `peerDependencies`, or `devDependencies` unless a test fixture is deliberately isolated outside the core package.

---

## Core Engineering Principles

### 1. The core owns abstractions, never broker details

Allowed inside `queue-core`:

```ts
export interface QueueAdapter {
  enqueue<T>(input: EnqueueJobInput<T>): Promise<QueueJob<T>>;
}
```

Not allowed inside `queue-core`:

```ts
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
```

### 2. Framework independence is non-negotiable

No imports from:

- `fastify`
- `express`
- `@nestjs/*`
- `next`
- HTTP request/response types
- ORM or database libraries

Framework integration belongs in an application project or an optional integration package.

### 3. Core contracts are stable

A public interface is a promise to every consuming project. Prefer adding optional fields or new interfaces over breaking an existing method signature.

Breaking changes require a major version bump.

### 4. Avoid leaking adapter-native types

The public API must never expose a BullMQ `Job`, `Worker`, `QueueEvents`, Redis connection, or equivalent backend object.

Map adapter-native concepts into canonical core types:

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
```

### 5. Public APIs require complete JSDoc

Every exported class, function, interface, type, enum, and public option field must have JSDoc that explains:

- purpose;
- valid values and defaults;
- side effects;
- errors;
- adapter capability requirements;
- relevant lifecycle semantics.

Example:

```ts
/**
 * Adds a unit of work to a named queue.
 *
 * The method returns after the configured adapter accepts and persists the job;
 * it does not wait for the job handler to execute.
 *
 * @typeParam T - Serializable payload shape for the job.
 * @throws {QueueValidationError} When queue name, job name, or options are invalid.
 * @throws {QueueAdapterError} When the configured adapter cannot persist the job.
 */
add<T>(
  queueName: string,
  jobName: string,
  data: T,
  options?: JobOptions,
): Promise<QueueJob<T>>;
```

### 6. Runtime payloads must be serializable

`data` should be JSON-serializable because Redis-backed and message-broker-backed adapters need to cross a process boundary.

Reject or clearly document unsupported values such as functions, symbols, circular references, class instances requiring custom serialization, and open resources.

### 7. Do not promise exactly-once execution

The default semantic is **at-least-once processing**. A job can execute more than once after a worker crash, network partition, or lock expiry.

Consumers must make handlers idempotent.

---

## Workflows

### Adding a job

1. `QueueClient.add()` validates normalized input.
2. Core resolves defaults into `ResolvedJobOptions`.
3. Core delegates to `QueueAdapter.enqueue()`.
4. Adapter persists the job in its broker.
5. Core returns a canonical `QueueJob`.
6. Optional event adapter may emit `job.created`.

### Starting a worker

1. Application registers a handler with `WorkerClient`.
2. Core validates worker options.
3. Core delegates to `WorkerAdapter.start()`.
4. Adapter maps a backend job into `QueueJob`.
5. Core invokes the handler.
6. Adapter performs broker-native acknowledgement, retry, lock renewal, and state persistence.

The core may normalize lifecycle events but does not reimplement broker storage algorithms.

---

## Required Implementation Habits

### Before changing a public contract

1. Read `Architecture.md`, `Rules.md`, and `TRD.md`.
2. Determine whether the requested change is core behavior or adapter behavior.
3. Search for affected exports and tests.
4. Add or update JSDoc.
5. Add unit tests and compile-time type tests.
6. Add a Changeset if the package is versioned.
7. Update documentation examples when API behavior changes.

### While writing code

- Prefer immutable data for public DTOs.
- Use branded IDs or validated string aliases when practical.
- Use custom error classes instead of anonymous `Error` for library-facing failures.
- Normalize dates to epoch milliseconds at boundaries; expose `Date` only when this is intentional and documented.
- Validate inputs at the public boundary, not only in adapters.
- Keep constructors lightweight. Use factory functions for runtime setup.
- Treat cleanup as part of the API: worker and client handles must be closable.

### While writing tests

Test behavior, not implementation details.

Required tests for a new public feature:

- happy path;
- validation failure;
- adapter error propagation;
- default-option resolution;
- canonical type mapping;
- disposal/close behavior where relevant;
- capability-not-supported behavior where relevant.

Use fake adapters in `queue-core` tests. Do not run Redis or BullMQ integration tests in this package.

---

## Package Commands

Recommended scripts:

```json
{
  "scripts": {
    "clean": "rimraf dist coverage",
    "build": "tsup src/index.ts --format esm,cjs --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "lint": "eslint src test",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "pack:check": "pnpm pack --pack-destination .artifacts && publint && attw --pack .artifacts/*.tgz",
    "prepublishOnly": "pnpm clean && pnpm typecheck && pnpm test && pnpm build && pnpm pack:check"
  }
}
```

All of these must pass before a release.

---

## Definition of Done

A change is complete only when:

- [ ] it respects the dependency direction;
- [ ] it does not introduce broker or framework imports into `queue-core`;
- [ ] all new public exports have JSDoc;
- [ ] runtime validation and errors are documented;
- [ ] tests cover successful and failure behavior;
- [ ] the package builds with declaration files;
- [ ] `pnpm pack` contains only intended runtime artifacts;
- [ ] a changeset exists when the change affects a published package.

---

## Non-Goals for queue-core

The core package must not implement:

- Redis Lua scripts;
- delayed-job polling;
- worker heartbeats;
- distributed locks;
- BullMQ scheduler configuration;
- a dashboard;
- HTTP endpoints;
- framework plugins;
- database persistence;
- application-specific job handlers.

Those responsibilities belong to adapters, optional integration packages, or consuming applications.
