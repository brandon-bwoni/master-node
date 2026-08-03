import { JobCreatedEvent } from "./JobCreatedEvent.js";
import { JobCompletedEvent } from "./JobCompletedEvent.js";
import { JobFailedEvent } from "./JobFailedEvent.js";

/**
 * Maps each event-name literal to its concrete event class. This is what
 * lets EventBus.subscribe("job.failed", handler) infer handler's
 * parameter as JobFailedEvent with zero casts. Cost of that type safety:
 * one line added here per new event type (job.retrying, job.dead-lettered,
 * etc., when those files exist).
 */
export interface DomainEventMap {
  "job.created": JobCreatedEvent;
  "job.completed": JobCompletedEvent;
  "job.failed": JobFailedEvent;
}
