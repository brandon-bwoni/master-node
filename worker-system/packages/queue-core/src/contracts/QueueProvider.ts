import { Job } from "../domain/entities/Job.js";
import { JobId } from "../domain/value-objects/JobId.js";

export interface ReserveOptions {
  /** Max jobs to claim in one call. >1 requires the adapter to support genuine batch reservation (one round trip claiming N) —
   * trades a small latency increase for far fewer round trips under load. */
  count: number;
  /**
   * Milliseconds to block/poll waiting for at least one job if none are
   * immediately available. 0 = return immediately (lowest latency per
   * call, more empty round-trips under low load). Larger values reduce
   * broker load/cost at the cost of added latency on the trailing edge
   * of a quiet period, and added shutdown latency for a Worker draining
   * a call currently blocked on this.
   */
  blockMs?: number;
}

/**
 * Port for broker-specific job persistence and claiming. Adapters (Redis,
 * Postgres, in-memory, ...) implement this; domain and application code
 * depend only on this contract, never on a concrete broker.
 *
 * DESIGN RULE: adapters are dumb, durable primitives.
 * They persist whatever state a Job entity is
 * currently in. They do NOT decide retry counts, backoff timing, or DLQ
 * eligibility — that logic lives entirely in Job's own transition methods
 * (markFailed/markDelayed/markDead) and the use-case that orchestrates
 * them. Every method below receives a Job that has already had the
 * relevant transition applied; the adapter's job is to persist that
 * state, never to compute or infer it.
 */
export interface QueueProvider<T = unknown> {
  /**
   * Persist a new job. job.getStatus() is WAITING or DELAYED (set by
   * Job.create()) — never ACTIVE/COMPLETED/FAILED/DEAD. That combination
   * is already unreachable via Job's own transition methods, so this
   * isn't something enqueue() needs to separately guard against.
   */
  enqueue(queue: string, job: Job<T>): Promise<void>;

  /**
   * Atomically claim up to opts.count jobs and transition them to ACTIVE
   * as a single operation — both in the returned Job objects (i.e.
   * job.markActive() has already been called on each) and in persisted
   * storage. "Atomic" specifically means: no two concurrent callers,
   * same process or different processes, may ever receive the same job.
   * This is the one invariant every adapter MUST get right — violating
   * it means duplicate processing under any multi-worker deployment.
   */
  reserve(queue: string, opts: ReserveOptions): Promise<Job<T>[]>;

  /** Persist a job's COMPLETED state. Caller has already called job.markCompleted(). */
  ack(queue: string, job: Job<T>): Promise<void>;

  /**
   * Persist a job's DELAYED (retry-scheduled) state. Caller has already
   * called job.markFailed(reason) then job.markDelayed(readyAt). This
   * method's only responsibility is making the job unreservable until
   * job.getReadyAt(), then eligible again.
   */
  nack(queue: string, job: Job<T>): Promise<void>;

  /**
   * Persist a job's DEAD (permanently exhausted) state, in storage
   * distinct from the main queue — DLQ inspection is the primary
   * diagnostic tool for this whole system, so "distinct and queryable"
   * isn't optional.
   */
  deadLetter(queue: string, job: Job<T>): Promise<void>;

  /** Fetch a job by id, or null if unknown. Needed for producer-side status lookups. */
  getJob(queue: string, jobId: JobId): Promise<Job<T> | null>;
}
