/**
 * Base contract for all domain events. Concrete events extend this with a
 * narrowed literal `name` (e.g. `readonly name: "job.failed"`) and their
 * own payload fields — this interface intentionally carries nothing
 * queue-specific (no jobId), since not every event need be job-scoped.
 */
export interface DomainEvent {
  readonly name: string;

  /**
   * Epoch milliseconds — not `Date`. Two concrete reasons:
   *
   * 1. `Date` is a mutable object; `readonly` only stops reassigning the
   *    reference, not calling `.setTime()`/`.setHours()` on the object it
   *    points to. Events fan out to multiple EventBus subscribers — if one
   *    handler mutates the timestamp, every other handler holding the same
   *    reference sees the corruption. Object.freeze on the event itself
   *    wouldn't fix this either; freeze is shallow.
   * 2. `Date` doesn't round-trip through JSON. `JSON.stringify` emits an
   *    ISO string; `JSON.parse` does NOT revive it back to a `Date`. Every
   *    adapter publishing/persisting/replaying this event (pub/sub, an
   *    outbox table, an event log) would have to remember a manual
   *    reconstruction step, or the type silently degrades to `string` with
   *    no compiler warning.
   *
   * Also matches the epoch-ms convention already used by Job's own
   * timestamps (createdAt/processedAt/finishedAt) — one representation
   * for "when" across the whole domain, not two.
   */
  readonly occurredAt: number;
}
