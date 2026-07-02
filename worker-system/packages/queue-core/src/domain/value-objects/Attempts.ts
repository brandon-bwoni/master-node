export class InvalidAttemptsError extends Error {
  constructor(reason: string) {
    super(`Invalid Attempts: ${reason}`);
    this.name = "InvalidAttemptsError";
  }
}

/**
 * Upper bound on max attempts. Protects against a caller-supplied value
 * (e.g. Number.MAX_SAFE_INTEGER) that would disable retry exhaustion
 * entirely — a permanently-failing job would retry forever, never reach
 * the DLQ, and occupy a worker slot on every failure cycle indefinitely.
 * Flagged as a policy assumption, not a hard type constraint — adjust if
 * a legitimate use case needs a higher ceiling.
 */
const MAX_ALLOWED_ATTEMPTS = 1000;

/**
 * Tracks attempts consumed vs. attempts allowed for a single job. Immutable:
 * every mutation returns a new instance, so a Job entity holding an Attempts
 * can never have it change out from under a reference elsewhere.
 */
export class Attempts {
  readonly made: number;
  readonly max: number;

  constructor(made: number, max: number) {
    if (!Number.isInteger(max) || max < 1) {
      // Number.isInteger(NaN) is false, so this also rejects NaN — a bare
      // `max < 1` check does NOT, since NaN < 1 evaluates to false.
      throw new InvalidAttemptsError(`max must be an integer >= 1, got ${max}`);
    }
    if (max > MAX_ALLOWED_ATTEMPTS) {
      throw new InvalidAttemptsError(
        `max exceeds allowed ceiling of ${MAX_ALLOWED_ATTEMPTS}, got ${max}`,
      );
    }
    if (!Number.isInteger(made) || made < 0) {
      throw new InvalidAttemptsError(
        `made must be an integer >= 0, got ${made}`,
      );
    }
    if (made > max) {
      throw new InvalidAttemptsError(
        `made (${made}) cannot exceed max (${max})`,
      );
    }
    this.made = made;
    this.max = max;
    Object.freeze(this);
  }

  static initial(max: number): Attempts {
    return new Attempts(0, max);
  }

  canRetry(): boolean {
    return this.made < this.max;
  }

  isExhausted(): boolean {
    return !this.canRetry();
  }

  /**
   * Records that one more attempt was consumed. Throws if already
   * exhausted rather than silently allowing made > max — that state
   * means a job was processed after it should already have been
   * dead-lettered, which is a bug to surface, not paper over.
   */
  increment(): Attempts {
    if (this.isExhausted()) {
      throw new InvalidAttemptsError(
        `cannot increment: already exhausted (${this.made}/${this.max})`,
      );
    }
    return new Attempts(this.made + 1, this.max);
  }

  equals(other: Attempts): boolean {
    return (
      other instanceof Attempts &&
      this.made === other.made &&
      this.max === other.max
    );
  }
}
