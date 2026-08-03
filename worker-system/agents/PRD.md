# PRD.md — Product Requirements Document

## 1. Product Summary

### Product name

`@<npm-scope>/queue-core`

### Product statement

A reusable TypeScript queue abstraction for Node.js applications that gives developers one clean API for background job processing while allowing queue-broker implementations to be swapped without rewriting application code.

### Initial ecosystem

```text
@<npm-scope>/queue-core      Stable public API, validation, contracts
@<npm-scope>/queue-bullmq    BullMQ and Redis implementation
@<npm-scope>/queue-memory    In-memory implementation for tests and local development
```

---

## 2. Problem

Applications built with Fastify, Express, NestJS, Hono, Next.js, scripts, or workers commonly need to run non-request work asynchronously:

- sending email;
- generating reports;
- processing uploads;
- calling unreliable third-party APIs;
- issuing notifications;
- synchronizing external data;
- retrying transient failures.

When every application calls BullMQ directly, the codebase becomes coupled to BullMQ types, Redis configuration, event names, operational behavior, and migration constraints.

The product solves this by establishing a stable internal queue API and isolating broker-specific behavior in adapters.

---

## 3. Target Users

### Primary user

The package owner, building multiple Node.js services and wanting a single queue abstraction across projects.

### Secondary user

A TypeScript backend developer who wants:

- framework independence;
- typed job payloads;
- portable queue concepts;
- clear lifecycle management;
- ability to move from BullMQ to another backend later;
- predictable, documented behavior.

### Non-user

A frontend-only developer or a user looking for a cloud-hosted queue service without operating backend infrastructure.

---

## 4. Product Goals

1. Enable job submission from any Node.js server framework.
2. Let workers run independently from web applications.
3. Keep application code independent of BullMQ and Redis.
4. Preserve a small and understandable public API.
5. Make retries, delays, priorities, concurrency, and job events available through portable concepts when adapters support them.
6. Make unsupported features explicit rather than silently ignored.
7. Support safe package publication and installation using pnpm or npm.
8. Provide enough documentation and tests for the package to be reused confidently across projects.

---

## 5. Product Principles

### Stable application API, replaceable infrastructure

Consumers depend on `queue-core`; they choose an adapter only in the application composition root.

### Explicit capabilities over false portability

Not every broker supports every queue feature. The package must say so clearly with capabilities and errors.

### Reliability is documented, not implied

The product documents at-least-once processing and idempotency requirements. It does not market impossible exactly-once guarantees.

### Thin core, rich adapters

The core should be small. Broker-specific operational intelligence belongs in adapter packages.

### Publishable quality

The package should be safe to install as a dependency: typed, tested, versioned, documented, packaged cleanly, and free from accidental runtime infrastructure dependencies.

---

## 6. User Stories

### US-001: Add a background job from a web application

As a backend developer, I want to add a job after an HTTP request succeeds so that the request remains fast.

```ts
await queue.add("emails", "send-welcome-email", {
  userId: user.id,
});
```

Acceptance criteria:

- returns a job descriptor after persistence;
- does not wait for email delivery;
- works identically from Fastify and Express applications.

### US-002: Configure retries safely

As a backend developer, I want to configure a transient job retry policy so that temporary provider outages do not immediately lose work.

```ts
await queue.add("billing", "capture-payment", payload, {
  attempts: 5,
  backoff: { type: "exponential", delayMs: 1_000 },
});
```

Acceptance criteria:

- core validates the configuration;
- the adapter reports unsupported retry capability clearly;
- documentation states that attempts includes the first execution.

### US-003: Process jobs with typed payloads

As a worker developer, I want a handler to receive typed job data so that job implementation remains safe and readable.

```ts
await workers.start<SendWelcomeEmailPayload>({
  queueName: "emails",
  concurrency: 10,
  processor: async (job) => {
    await mailer.sendWelcome(job.data.userId);
  },
});
```

Acceptance criteria:

- payload generic is preserved;
- handler receives a canonical job object;
- handler does not need BullMQ imports.

### US-004: Shut down safely

As an operations engineer, I want worker lifecycle controls so that deployments can stop accepting new jobs and complete active work gracefully where supported.

Acceptance criteria:

- a worker handle exposes `pause`, `resume`, and `close`;
- graceful shutdown is capability-aware;
- cleanup semantics are documented.

### US-005: Change broker later

As the package owner, I want application code to remain unchanged when the underlying queue backend changes.

Acceptance criteria:

- application imports from `queue-core`;
- BullMQ is imported only by `queue-bullmq` and the composition root;
- core contract tests can be reused by another adapter.

### US-006: Install from npm

As a consumer, I want to install the package through normal package-manager commands.

```bash
pnpm add @<npm-scope>/queue-core @<npm-scope>/queue-bullmq
# or
npm install @<npm-scope>/queue-core @<npm-scope>/queue-bullmq
```

Acceptance criteria:

- package is public in the npm registry;
- package contains built code and declarations;
- install works in a clean fixture.

---

## 7. MVP

### Included

- `QueueClient` with add, get job, get counts, and close.
- `WorkerClient` with worker startup and lifecycle handle.
- Canonical job and option types.
- Runtime validation.
- Error hierarchy.
- Capability contract.
- Adapter contracts.
- Event contracts.
- In-memory test adapter.
- Complete TypeScript declarations.
- Unit tests and package tests.
- npm publish readiness.

### Deferred to adapter implementations

- BullMQ integration.
- Redis connection settings.
- retries, delayed jobs, priority jobs, dead-letter processing, lock renewal, stalled job recovery, and distributed worker coordination.
- These features are exposed in the core as portable contracts/options but are physically implemented by adapters.

### Out of MVP

- UI dashboard.
- queue administration web API.
- application-specific job registry.
- cron or workflow engine.
- multi-language clients.
- cloud-hosted service.

---

## 8. Success Metrics

### Developer experience

- A new project can enqueue and process a typed job in less than 15 minutes using documented examples.
- A user does not need to import BullMQ in regular route/controller code.
- TypeScript catches invalid public API usage at compile time where possible.

### Quality

- 100% of public exports have JSDoc.
- Core test suite runs without Redis or a broker.
- Package passes install tests using pnpm and npm.
- `pnpm pack` contains only intended files.
- Every adapter passes relevant core contract tests.

### Architecture

- `queue-core` has no runtime broker/framework dependency.
- All broker-specific imports remain in `queue-bullmq` or another adapter.
- All adapter-specific capability gaps produce explicit errors.

---

## 9. Constraints and Assumptions

- Node.js consumers can use ESM. Optional CJS support is included only if verified.
- Job payloads are serializable and do not contain active connections or functions.
- A user is responsible for running a queue backend and worker deployment when using a production adapter.
- Job handlers must be idempotent because failures may cause reprocessing.
- The package scope is available on npm before the first publish.

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Core copies BullMQ’s API too closely | weak portability | design around canonical concepts and capability contracts |
| Features differ across brokers | surprising behavior | explicit capability flags and errors |
| Public API churn | breaks consuming projects | SemVer, Changesets, contract tests |
| Duplicate job execution | duplicate external side effects | idempotency documentation and examples |
| Package ships broken exports | install/runtime failures | package tarball tests, publint, type checks |
| Core expands into a framework | maintenance burden | strict non-goals and architecture rules |
| Sensitive payloads leak into logs | security issue | no default payload logging; documented redaction policy |

---

## 11. Roadmap

### Release 0.1.0

- core public types and contracts;
- queue and worker clients;
- fake adapter;
- validation and errors;
- documentation;
- private/local workspace use.

### Release 0.2.0

- memory adapter package;
- contract test suite;
- complete examples;
- public npm prerelease channel.

### Release 0.3.0

- BullMQ adapter package;
- Redis-backed integration tests;
- normalized retries, delays, priorities, events, and worker lifecycle.

### Release 1.0.0

- stable public API;
- complete documentation;
- published package;
- CI release pipeline;
- compatibility policy;
- framework examples.

### Later

- Fastify integration;
- observability integration;
- dashboard;
- optional outbox helper;
- alternative adapters.

---

## 12. Product Boundary

The product is a reusable queue **abstraction** and adapter ecosystem.

It is not:

- a replacement for BullMQ in the first release;
- a self-managed queue cluster;
- an HTTP task API;
- a guarantee of exactly-once execution;
- a substitute for job handler idempotency;
- a monolithic framework dependency.

The design keeps the core stable while allowing the queue runtime to evolve independently.
