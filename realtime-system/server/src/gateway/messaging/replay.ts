import { getPublisher } from "../config/redis.js";
import type { ChatMessage } from "../../types/message.js";
import { REDIS_KEYS, STREAMS } from "../utils/constants.js";
import { logger } from "../../shared/logger.js";

// TYPES
export interface ReplayOptions {
  roomId: string;
  fromId?: string;
  limit?: number;
}

export interface ReplayChunk {
  messages: ChatMessage[];
  lastId: string;
  hasMore: boolean;
}

type StreamEntry = { id: string; message: Record<string, string> };

// VALIDATIONS
const STREAM_ID_RE = /^(?:0|0-0|\d{13,}-\d+)$/;

function isValidStreamId(id: string): boolean {
  return STREAM_ID_RE.test(id);
}

// Convert a client-supplied lastSeenId to an exclusive start ID.
function toExclusiveId(id: string): string {
  if (id === "0" || id === "0-0") return "0-0";

  const [ms, seq] = id.split("-");
  const nextSeq = parseInt(seq ?? "0", 10) + 1;
  return `${ms}-${nextSeq}`;
}

/**
 * CORE REPLAY FUNCTIONALITY
 */
export async function replayChunk(
  options: ReplayOptions,
): Promise<ReplayChunk> {
  const { roomId, fromId = "0-0", limit } = options;

  if (!isValidStreamId(fromId)) {
    logger.warn({ roomId, fromId }, "Invalid stream ID fomart");
  }

  const safeFromId = isValidStreamId(fromId) ? fromId : "0-0";

  // Cap limit
  const safeLimit = Math.min(
    limit ?? STREAMS.REPLAY_DEFAULT_LIMIT,
    STREAMS.REPLAY_MAX_LIMIT,
  );

  const streamKey = REDIS_KEYS.stream(roomId);
  const exclusiveId = toExclusiveId(safeFromId);

  // Fetch one extra message to detedt hasMore
  const pub = await getPublisher();

  let raw: Awaited<ReturnType<typeof pub.xRange>>;

  try {
    raw = await pub.xRange(streamKey, exclusiveId, "+", {
      COUNT: safeLimit + 1,
    });
  } catch (err) {
    logger.error(
      { roomId, streamKey, err: (err as Error).message },
      "xRange failed during replay",
    );
    return { messages: [], lastId: safeFromId, hasMore: false };
  }

  // STREAM DOES NOT EXIT
  if (!raw || raw.length === 0) {
    logger.debug({ roomId, fromId: safeFromId }, "No messages to replay");
    return { messages: [], lastId: safeFromId, hasMore: false };
  }

  const hasMore = raw.length > safeLimit;
  const entries = hasMore ? raw.slice(0, safeLimit) : raw;
  const lastId = entries[entries.length - 1]?.id ?? safeFromId;
  const messages = entries.map(({ id, message }: StreamEntry) =>
    deserialise(id, message),
  );

  logger.debug(
    { roomId, fromId: safeFromId, count: messages.length, hasMore, lastId },
    "Replay chunk fetched",
  );

  return { messages, lastId, hasMore };
}

/**
 * PAGINATED REPLAY
 */
export async function replayAll(
  options: ReplayOptions,
  onChunk: (chunk: ReplayChunk, pageIndex: number) => Promise<void>,
): Promise<void> {
  const { roomId, limit = STREAMS.REPLAY_DEFAULT_LIMIT } = options;
  let cursor = options.fromId ?? "0-0";
  let pageIndex = 0;
  let total = 0;

  logger.info({ roomId, fromId: cursor }, "Starting full replay");

  do {
    const chunk = await replayChunk({ roomId, fromId: cursor, limit });

    if (chunk.messages.length > 0) {
      await onChunk(chunk, pageIndex);
      cursor = chunk.lastId;
      total += chunk.messages.length;
      pageIndex++;
    }

    if (!chunk.hasMore) break;

    // Yield to event loop between pages — prevents starving I/O on large replays
    await new Promise<void>((resolve) => setImmediate(resolve));
  } while (true);

  logger.info(
    { roomId, totalMessages: total, pages: pageIndex },
    "Replay complete",
  );
}

/**
 * LATEST MESSAGES
 */
export async function replayLatest(
  roomId: string,
  count = 50,
): Promise<ChatMessage[]> {
  const pub = await getPublisher();
  const streamKey = REDIS_KEYS.stream(roomId);

  try {
    const raw = await pub.xRevRange(streamKey, "+", "-", {
      COUNT: Math.min(count, STREAMS.REPLAY_MAX_LIMIT),
    });

    return raw
      .reverse() // xRevRange returns newest-first; we want chronological
      .map(({ id, message }: StreamEntry) => deserialise(id, message));
  } catch (err) {
    logger.error(
      { roomId, err: (err as Error).message },
      "xRevRange failed in replayLatest",
    );
    return [];
  }
}

/**
 * DESERIALIZATION
 * Convert a raw Redis Stream entry to a ChatMessage.
 */
function deserialise(
  streamId: string,
  fields: Record<string, string>,
): ChatMessage {
  return {
    type: "chat",
    streamId,
    roomId: fields["roomId"] ?? "",
    userId: fields["userId"] ?? "",
    text: fields["text"] ?? "",
    ts: parseInt(fields["ts"] ?? "0", 10),
  };
}
