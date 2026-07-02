import { randomUUID } from "node:crypto";

/** Bounds key length for adapters using JobId as a Redis key segment or DB index column — unbounded input here is a memory/locality cost with no upside. */
const MAX_JOB_ID_LENGTH = 256;

export class InvalidJobIdError extends Error {
  constructor(reason: string) {
    super(`Invalid JobId: ${reason}`);
    this.name = "InvalidJobIdError";
  }
}

/**
 * Identity for a job. Also serves as the idempotency key when a caller
 * supplies one explicitly — normalization here isn't cosmetic: "abc" and
 * "abc " must resolve to the same id, or dedup silently breaks.
 */
export class JobId {
  readonly value: string;

  constructor(rawValue: string) {
    if (typeof rawValue !== "string") {
      throw new InvalidJobIdError(`must be a string, got ${typeof rawValue}`);
    }
    const value = rawValue.trim();
    if (value.length === 0) {
      throw new InvalidJobIdError("cannot be empty or whitespace-only");
    }
    if (value.length > MAX_JOB_ID_LENGTH) {
      throw new InvalidJobIdError(
        `exceeds maximum length of ${MAX_JOB_ID_LENGTH} (got ${value.length})`,
      );
    }
    this.value = value;
    Object.freeze(this);
  }

  /** No shared mutable state; safe across worker_threads/cluster without coordination. */
  static generate(): JobId {
    return new JobId(randomUUID());
  }

  equals(other: JobId): boolean {
    return other instanceof JobId && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
