/**
 * Exponential backoff with full jitter for WebSocket reconnect.
 * Full jitter reduces thundering herd when the proxy restarts.
 */
export class ExponentialBackoff {
  private attempt = 0;

  constructor(
    private readonly baseMs = 200,
    private readonly capMs = 30_000,
  ) {}

  next(): number {
    const ceiling = Math.min(this.capMs, this.baseMs * 2 ** this.attempt++);
    return Math.random() * ceiling;
  }

  reset(): void {
    this.attempt = 0;
  }
  get attempts(): number {
    return this.attempt;
  }
}

// Format unix ms timestamp to HH:MM
export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

// Get initials from username for avata rendering
export function initials(username: string): string {
  return username
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

// Generate a random hex color seededby userId fro consistent avatar colours
export function avatarColor(userId: string): string {
  const colours = [
    "#7F77DD",
    "#1D9E75",
    "#D85A30",
    "#D4537E",
    "#378ADD",
    "#639922",
    "#BA7517",
    "#E24B4A",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }

  return colours[Math.abs(hash) % colours.length] ?? "#7F77DD";
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
