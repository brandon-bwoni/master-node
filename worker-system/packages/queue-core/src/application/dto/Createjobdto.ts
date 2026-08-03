import { CreateJobOptions } from "../../domain/entities/Job.js";

/**
 * Application-boundary input for creating a job — the shape a use-case
 * (e.g. EnqueueJob) receives from outside (HTTP body, CLI, message
 * payload) before constructing a Job<T> via Job.create().
 *
 * Extends CreateJobOptions rather than redeclaring jobId/priority/
 * attempts/delayMs: those are already validated by Job.create() and its
 * constituent value objects (resolvePriority, Attempts, JobId), so this
 * DTO doesn't re-implement that validation — it only needs to carry the
 * values through, correctly typed, with no drift risk against Job's own
 * option shape.
 */
export interface CreateJobDto<T = unknown> extends CreateJobOptions {
  queue: string;
  name: string;
  payload: T;
}

export class InvalidCreateJobDtoError extends Error {
  constructor(reason: string) {
    super(`Invalid CreateJobDto: ${reason}`);
    this.name = "InvalidCreateJobDtoError";
  }
}

/**
 * Runtime shape guard for untrusted external input. Interfaces are
 * erased at compile time — without this, a malformed request body sails
 * through typed as CreateJobDto<T> with zero runtime protection and
 * fails later, deep in domain logic, with a confusing error at the
 * wrong layer.
 *
 * Deliberately SHAPE-ONLY: priority/attempts/delayMs are checked here
 * only for basic type, not range or closed-set membership — that's
 * resolvePriority/Attempts/Job.create's job. queue/name get real content
 * validation because nothing downstream currently owns that check (no
 * QueueName value object exists yet).
 */
export function parseCreateJobDto<T = unknown>(
  input: unknown,
): CreateJobDto<T> {
  if (typeof input !== "object" || input === null) {
    throw new InvalidCreateJobDtoError("must be an object");
  }
  const candidate = input as Record<string, unknown>;

  if (
    typeof candidate.queue !== "string" ||
    candidate.queue.trim().length === 0
  ) {
    throw new InvalidCreateJobDtoError("queue must be a non-empty string");
  }
  if (
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0
  ) {
    throw new InvalidCreateJobDtoError("name must be a non-empty string");
  }
  if (!("payload" in candidate)) {
    throw new InvalidCreateJobDtoError("payload is required");
  }
  if (candidate.jobId !== undefined && typeof candidate.jobId !== "string") {
    throw new InvalidCreateJobDtoError("jobId must be a string if provided");
  }
  if (
    candidate.priority !== undefined &&
    typeof candidate.priority !== "number"
  ) {
    throw new InvalidCreateJobDtoError("priority must be a number if provided");
  }
  if (
    candidate.attempts !== undefined &&
    typeof candidate.attempts !== "number"
  ) {
    throw new InvalidCreateJobDtoError("attempts must be a number if provided");
  }
  if (
    candidate.delayMs !== undefined &&
    typeof candidate.delayMs !== "number"
  ) {
    throw new InvalidCreateJobDtoError("delayMs must be a number if provided");
  }

  return candidate as unknown as CreateJobDto<T>;
}
