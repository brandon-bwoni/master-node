export const JobStatus = {
  WAITING: "waiting",
  DELAYED: "delayed",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  DEAD: "dead",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** For runtime validation (zod schemas, DB CHECK constraints, etc.) — derived, not hand-maintained, so it can't drift from the object above. */
export const ALL_JOB_STATUSES: readonly JobStatus[] = Object.values(JobStatus);

/** Type guard for the adapter boundary: narrows an untrusted string (e.g. a deserialized storage column) to JobStatus without a cast. */
export function isJobStatus(value: string): value is JobStatus {
  return (ALL_JOB_STATUSES as readonly string[]).includes(value);
}
