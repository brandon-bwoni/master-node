import { getPublisher } from "../config/redis.js";
import { logger } from "../../shared/logger.js";
import { REDIS_KEYS, STREAMS } from "../utils/constants.js";
import type { ChatMessage } from "../../shared/types/message.js";

export interface StreamEntry {
  roomId: string;
  userId: string;
  text: string;
  ts: number;
}

export async function appendToStream(roomId: string, message: ChatMessage) {
  const pub = await getPublisher();

  const entry: Record<string, string> = {
    roomId: message.roomId,
    userId: message.userId,
    text: message.text,
    ts: message.ts.toString(),
  };

  try {
    const streamId = await pub.xAdd(REDIS_KEYS.stream(roomId), "*", entry, {
      TRIM: {
        strategy: "MAXLEN",
        strategyModifier: "~", // approximate trim — much faster than exact
        threshold: STREAMS.MAX_LEN,
      },
    });

    logger.debug(
      { roomId, streamId, userId: message.userId },
      "Message appended to stream",
    );

    return streamId;
  } catch (err) {
    logger.error(
      { roomId, userId: message.userId, err: (err as Error).message },
      "Failed to append message to stream",
    );
    throw err;
  }
}
