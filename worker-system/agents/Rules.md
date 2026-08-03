# Rules.md — Mandatory Contribution Rules

These rules apply to every assistant, contributor, pull request, and release involving `queue-core`.

## 1. Boundary Rules

1. `queue-core` must remain broker-agnostic.
2. `queue-core` must remain framework-agnostic.
3. `queue-core` must not import BullMQ, Redis, `ioredis`, RabbitMQ clients, Kafka clients, AWS SDK queue clients, ORMs, or web frameworks.
4. Adapter packages may depend on `queue-core`; `queue-core` may not depend on adapter packages.
5. The public API must not return adapter-native objects, errors, IDs, or configuration types.
6. If a feature cannot be expressed without a specific broker type, place it in that adapter package instead of polluting the core.

## 2. Public API Rules

1. Every exported API must have complete JSDoc.
2. Every public option must document default behavior, limits, and backend capability requirements.
3. Use named interfaces and types for all public objects. Do not expose anonymous structural types in method signatures when a reusable named type is clearer.
4. Do not accept `any`. Use `unknown`, generics, or validated DTOs.
5. Do not change exported signatures in a minor or patch release.
6. Do not use unstable adapter-specific terminology in the core API.
7. Normalize configuration naming:
   - `delayMs`, never `delay`;
   - `queueName`, never ambiguous `queue`;
   - `attempts`, never `retries` when the value includes the first execution;
   - `removeOnComplete`, `removeOnFail`;
   - `priority`, where larger numeric values mean more important work.
8. Public IDs are strings. Do not expose numeric assumptions from a provider.

## 3. Behavioral Rules

1. The package documents **at-least-once** processing, never exactly-once processing.
2. A handler may run more than once. Examples must demonstrate idempotency.
3. Adapter capability gaps must throw `QueueCapabilityError`; they must never silently drop requested behavior.
4. Core validation occurs before adapter invocation.
5. Adapter errors must be wrapped or mapped to a stable core error type while preserving `cause`.
6. All resource-creating APIs must expose cleanup through `close()` or an equivalent handle.
7. Time values passed across public package boundaries use milliseconds.
8. Retry attempts include the initial attempt. Therefore:
   - `attempts: 1` means no retry;
   - `attempts: 3` means up to three total executions.
9. Core must not claim delivery guarantees that an adapter cannot provide.

## 4. Code Rules

1. TypeScript must compile with `strict: true`.
2. Avoid mutable public DTOs; use `Readonly` where practical.
3. Avoid static global state. It makes test isolation and multi-tenant applications difficult.
4. Constructors should receive dependencies; factory functions should perform configuration and default resolution.
5. Prefer small modules with one responsibility.
6. Do not create a god class called `Queue` that contains client, worker, scheduler, persistence, event, and dashboard behavior.
7. Do not add feature flags without a defined configuration contract and test coverage.
8. Do not use `setInterval` or background timers in the core. Scheduling belongs to adapters.
9. Do not create implicit network connections during module import.
10. Do not log directly from library code by default. Accept an optional logger interface if diagnostics are needed.

## 5. Documentation Rules

1. JSDoc is required for all public exports.
2. README-level examples must be runnable and type-checkable.
3. Document whether an operation:
   - persists data;
   - waits for execution;
   - has network side effects;
   - requires a capability;
   - can throw.
4. New public functionality must update `TRD.md` and `Architecture.md`.
5. Any behavior change affecting installation or publishing must update release documentation.
6. Examples must not imply that adding a job executes it synchronously.

## 6. Testing Rules

1. A public behavior change requires tests.
2. `queue-core` unit tests use fakes, not Redis or BullMQ.
3. Adapter integration tests live outside `queue-core`.
4. Each claimed adapter capability needs a contract test.
5. Test error handling, validation, defaults, cleanup, and lifecycle behavior.
6. Use deterministic clock and ID dependencies where time or identifiers matter.
7. Never rely on test execution order.
8. Verify package output with `pnpm pack` before publishing.

## 7. Security and Reliability Rules

1. Do not include credentials, `.npmrc` tokens, Redis URLs, or secrets in source control.
2. Do not serialize functions or secrets into job payloads.
3. Do not log full job payloads by default because payloads may contain personal or confidential data.
4. Mask or omit sensitive fields in error messages and diagnostics.
5. Enforce reasonable input limits for queue name, job name, payload size, attempts, priority, and delay.
6. Use idempotency guidance in every external-side-effect example.
7. Never use automatic retry for permanent validation errors without an explicit policy.
8. Retention defaults must be conservative and documented to avoid unbounded storage use.

## 8. Release Rules

1. Every published release has a SemVer version and changelog entry.
2. Use Changesets for version management.
3. `prepublishOnly` must run type checking, tests, build, package inspection, and package correctness checks.
4. Publish only the `dist/`, LICENSE, README, and required metadata files.
5. `src/`, tests, local fixtures, secrets, and `.env` files must not accidentally be shipped.
6. Publish first to a prerelease tag (`next`) for significant API changes.
7. Tag releases in Git and create a GitHub release after npm publication succeeds.
8. Do not delete or overwrite published npm versions.

## 9. Decision Rule

When deciding whether code belongs in core or an adapter, ask:

> Can a RabbitMQ, SQS, in-memory, and BullMQ implementation all support this behavior without leaking provider-specific concepts?

- **Yes:** it may belong in `queue-core`.
- **No:** it belongs in an adapter or optional integration package.
