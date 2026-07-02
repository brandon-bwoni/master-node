import { JobStatus } from "../types/JobStatus.js";
import { JobPriority, resolvePriority } from "../types/JobPriority.js";
import { JobId } from "../value-objects/JobId.js";
import { Attempts } from "../value-objects/Attempts.js";

export class InvalidJobTransitionError extends Error {
  constructor(from: JobStatus, action: string) {
    super(`Cannot ${action}: job is in status "${from}"`);
    this.name = "InvalidJobTransitionError";
  }
}

export interface JobFailureRecord {
  readonly message: string;
  readonly occurredAt: number;
}

export interface CreateJobOptions {
  jobId?: string;
  priority?: number;
  attempts?: number;
  delayMs?: number;
}

/**
 * Job is a mutable Entity identified by JobId — unlike JobId/Attempts/
 * JobPriority, which are immutable Value Objects compared by value. An
 * entity's identity persists across state changes; that IS what
 * "processing a job" means (same job, WAITING -> ACTIVE -> COMPLETED).
 * Transition methods therefore mutate private state in place rather than
 * returning new instances, and each one enforces the only legal prior
 * status(es) — the core fix over the given snippet, which exposed no way
 * to legally change status at all.
 *
 * State machine (matches DomainEvent.ts's documented lifecycle):
 *   waiting/delayed --markActive()--> active --markCompleted()--> completed
 *                                        |
 *                                  markFailed()
 *                                        v
 *                                     failed --markDelayed()--> delayed
 *                                        |
 *                                   markDead()
 *                                        v
 *                                       dead
 */
export class Job<T = unknown> {
  private status: JobStatus;
  private attempts: Attempts;
  private processedAt?: number;
  private completedAt?: number;
  private failedAt?: number;
  private readyAt?: number;
  private errors: JobFailureRecord[] = [];

  constructor(
    readonly id: JobId,
    readonly name: string,
    readonly data: T,
    readonly priority: JobPriority,
    readonly createdAt: number,
    status: JobStatus,
    attempts: Attempts,
    readyAt?: number,
  ) {
    if (!name || name.trim().length === 0) {
      throw new Error("Job name must be a non-empty string");
    }
    this.status = status;
    this.attempts = attempts;
    this.readyAt = readyAt;
  }

  /**
   * Primary entry point for NEW jobs. Generates identity, resolves
   * priority/attempts defaults, and computes the correct initial status
   * (DELAYED if delayMs > 0, else WAITING) in one place — so no caller
   * can construct a fresh job in an inconsistent combination (e.g.
   * status WAITING with a future readyAt already set).
   */
  static create<T>(name: string, data: T, opts: CreateJobOptions = {}): Job<T> {
    const id = opts.jobId ? new JobId(opts.jobId) : JobId.generate();
    const priority = resolvePriority(opts.priority);
    const attempts = Attempts.initial(opts.attempts ?? 1);
    const delayMs = opts.delayMs ?? 0;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error(`delayMs must be >= 0, got ${opts.delayMs}`);
    }
    const now = Date.now();
    const readyAt = delayMs > 0 ? now + delayMs : undefined;
    const status = delayMs > 0 ? JobStatus.DELAYED : JobStatus.WAITING;
    return new Job(id, name, data, priority, now, status, attempts, readyAt);
  }

  getStatus(): JobStatus {
    return this.status;
  }

  getAttempts(): Attempts {
    return this.attempts;
  }

  getProcessedAt(): number | undefined {
    return this.processedAt;
  }

  getCompletedAt(): number | undefined {
    return this.completedAt;
  }

  getFailedAt(): number | undefined {
    return this.failedAt;
  }

  getReadyAt(): number | undefined {
    return this.readyAt;
  }

  /** Defensive copy — external code cannot corrupt failure history via the returned array. */
  getErrors(): readonly JobFailureRecord[] {
    return [...this.errors];
  }

  /** WAITING|DELAYED -> ACTIVE. Called when a worker reserves the job. */
  markActive(): void {
    if (
      this.status !== JobStatus.WAITING &&
      this.status !== JobStatus.DELAYED
    ) {
      throw new InvalidJobTransitionError(this.status, "markActive");
    }
    this.status = JobStatus.ACTIVE;
    this.processedAt = Date.now();
    this.readyAt = undefined;
  }

  /** ACTIVE -> COMPLETED. Terminal. */
  markCompleted(): void {
    if (this.status !== JobStatus.ACTIVE) {
      throw new InvalidJobTransitionError(this.status, "markCompleted");
    }
    this.status = JobStatus.COMPLETED;
    this.completedAt = Date.now();
  }

  /**
   * ACTIVE -> FAILED. Records the failure and consumes one attempt.
   * Deliberately does NOT decide retry-vs-dead-letter or compute a
   * backoff delay — that needs a Backoff policy, which has no domain
   * representation yet. Callers must check getAttempts().canRetry()
   * after this and explicitly call markDelayed() or markDead().
   */
  markFailed(errorMessage: string): void {
    if (this.status !== JobStatus.ACTIVE) {
      throw new InvalidJobTransitionError(this.status, "markFailed");
    }
    this.status = JobStatus.FAILED;
    this.failedAt = Date.now();
    this.attempts = this.attempts.increment();
    this.errors.push({ message: errorMessage, occurredAt: this.failedAt });
  }

  /** FAILED -> DELAYED. Caller supplies the absolute ready time (already-computed backoff). */
  markDelayed(readyAt: number): void {
    if (this.status !== JobStatus.FAILED) {
      throw new InvalidJobTransitionError(this.status, "markDelayed");
    }
    if (!this.attempts.canRetry()) {
      throw new Error(
        `Cannot schedule retry: attempts exhausted (${this.attempts.made}/${this.attempts.max})`,
      );
    }
    this.status = JobStatus.DELAYED;
    this.readyAt = readyAt;
  }

  /** FAILED -> DEAD. Terminal. */
  markDead(): void {
    if (this.status !== JobStatus.FAILED) {
      throw new InvalidJobTransitionError(this.status, "markDead");
    }
    this.status = JobStatus.DEAD;
  }
}
