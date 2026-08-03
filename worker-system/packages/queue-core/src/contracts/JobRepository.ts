import { Job } from "../domain/entities/Job.js";
import { JobId } from "../domain/value-objects/JobId.js";

/**
 * Authoritative persistence port for Job entities. Queue-agnostic —
 * findById is keyed purely by JobId (globally unique, see JobId.generate),
 * not scoped to a queue name. This is the deliberate split from
 * QueueProvider: QueueProvider owns per-queue ordering/claiming mechanics
 * (which job is next, atomic reservation); JobRepository owns the job's
 * actual state, independent of which queue it's nominally in.
 *
 * save/update are kept distinct rather than a single upsert: for
 * relational adapters (Postgres) these are genuinely different
 * statements (INSERT vs UPDATE), and separating them lets an adapter
 * treat "update called on a row that was never saved" as the real bug
 * it is, instead of silently upserting over a missing precondition.
 */
export interface JobRepository<T = unknown> {
  /** Persist a brand-new job. Caller is creating this job for the first time — see Job.create(). */
  save(job: Job<T>): Promise<void>;

  findById(id: JobId): Promise<Job<T> | null>;

  /** Persist a state transition on an already-saved job (see Job's mark* methods). */
  update(job: Job<T>): Promise<void>;

  /** Remove a job record permanently — e.g. retention/pruning of old COMPLETED jobs. */
  delete(id: JobId): Promise<void>;
}
