import type { DomainEvent } from "./DomainEvent.js";
import { JobId } from "../value-objects/JobId.js";

export class JobCompletedEvent implements DomainEvent {
  readonly name = "job.completed";
  readonly occurredAt: number;

  constructor(public readonly jobId: JobId) {
    this.occurredAt = Date.now();
    Object.freeze(this);
  }
}
