import { QueueProvider } from "../../contracts/QueueProvider.js";
import { EventBus } from "../../contracts/EventBus.js";
import { Job } from "../../domain/entities/Job.js";
import { JobCreatedEvent } from "../../domain/events/JobCreatedEvent.js";
import { CreateJobDto } from "../dto/CreateJobDto.js";

/**
 * Orchestrates job creation. Depends only on QueueProvider for the write
 * path — JobRepository is deliberately absent: injecting both would make
 * "add a job" two independent, non-transactional writes (save + enqueue),
 * risking a job that's persisted but never reservable, or reservable but
 * never recorded, if the process dies between calls. QueueProvider
 * adapters own persist+index as one atomic operation internally (a DB
 * transaction, a Lua script, etc.) — a guarantee only achievable inside
 * one adapter implementation, not across two independently-injected
 * application-layer ports.
 */
export class AddJobService<T = unknown> {
  constructor(
    private readonly queue: QueueProvider<T>,
    private readonly events: EventBus,
  ) {}

  /**
   * Assumes `dto` already passed parseCreateJobDto at the outer edge
   * (HTTP handler, CLI, ...) — this service trusts its direct caller
   * within the application boundary; re-validating shape here would
   * duplicate that check for no benefit.
   */
  async addJob(dto: CreateJobDto<T>): Promise<Job<T>> {
    const job = Job.create(dto.name, dto.payload, dto);

    // The guarantee this method provides: once enqueue resolves, the job
    // is durably persisted AND reservable. Nothing after this point is
    // allowed to make addJob() report failure — see the try/catch below.
    await this.queue.enqueue(dto.queue, job);

    // Publish failures must NOT fail job creation. The job already
    // exists and is reservable — that succeeded. Letting a publish
    // error propagate would make a caller retry "failed" creation and
    // enqueue the same logical job a second time — duplicate processing,
    // a strictly worse outcome than one missed notification.
    //
    // No logger is injected yet, so this is swallowed rather than
    // reported — a known simplification. In a real deployment this
    // catch should forward to observability infrastructure, not go
    // silent.
    try {
      await this.events.publish(new JobCreatedEvent(job.id));
    } catch {
      // intentionally isolated — see comment above
    }

    return job;
  }
}
