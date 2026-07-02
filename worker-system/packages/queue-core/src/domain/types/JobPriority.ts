/**
 * Job priority — closed set, not an open numeric range.
 *
 * Deliberately NOT a TS `enum`: numeric enums are unclosed types — TS
 * allows assigning ANY number to an enum-typed variable with no error
 * (`const p: JobPriority = 999` compiles), which defeats the entire point
 * of restricting priority to a fixed vocabulary. A `const` object +
 * derived union rejects out-of-set values at compile time and carries no
 * runtime footprint beyond the plain object needed for the reverse guard.
 *
 * Values are spaced (1 / 5 / 10), not sequential (1 / 2 / 3): headroom to
 * insert a level later without renumbering existing ones. The set stays
 * closed to {1, 5, 10} until this file changes — spacing isn't an opening.
 *
 * Ordering convention: higher number = more urgent.
 */
export const JobPriority = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
} as const;

export type JobPriority = (typeof JobPriority)[keyof typeof JobPriority];

export const DEFAULT_JOB_PRIORITY: JobPriority = JobPriority.NORMAL;

export const ALL_JOB_PRIORITIES: readonly JobPriority[] =
  Object.values(JobPriority);

/** Narrows an untrusted number (DB column, ZSET score) without a cast. */
export function isJobPriority(value: number): value is JobPriority {
  return (ALL_JOB_PRIORITIES as readonly number[]).includes(value);
}

/**
 * Domain invariant, not an infra concern — true regardless of adapter.
 * Kept distinct from any future "adapter doesn't support priority"
 * error, which belongs in the application layer once QueueProvider exists.
 */
export class InvalidPriorityError extends Error {
  constructor(value: number) {
    super(
      `Invalid job priority: ${value}. Must be one of: ${ALL_JOB_PRIORITIES.join(", ")}`,
    );
    this.name = "InvalidPriorityError";
  }
}

/**
 * Single entry point for default + validation, so no caller can apply
 * one without the other.
 * @throws {InvalidPriorityError} if value is defined but not in the closed set
 */
export function resolvePriority(value: number | undefined): JobPriority {
  if (value === undefined) return DEFAULT_JOB_PRIORITY;
  if (!isJobPriority(value)) throw new InvalidPriorityError(value);
  return value;
}
