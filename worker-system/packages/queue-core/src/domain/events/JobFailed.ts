import type { DomainEvent } from "./DomainEvent.js";
import { JobId } from "../value-objects/JobId.js";

export class JobFailedEvent implements DomainEvent {
  readonly name = "job.failed";
  readonly occurredAt: number;

  constructor(
    public readonly jobId: JobId,
    public readonly reason: string,
    /** Which attempt just failed — required: "attempt 1 of 5" and "final attempt, about to dead-letter" are different alerts. Sourced from Attempts, already validated upstream — not re-checked here. */
    public readonly attemptsMade: number,
    public readonly stack?: string,
  ) {
    this.occurredAt = Date.now();
    Object.freeze(this);
  }
}
