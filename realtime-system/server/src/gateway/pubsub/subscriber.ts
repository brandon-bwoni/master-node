import { getPublisher } from "../config/redis.js";
import {
  getConnectionsInChannel,
  joinChannel,
} from "../registry/channel.registry.js";
import { enqueue, safeSend } from "../backpressure/queue.js";
import { logger } from "../../shared/logger.js";
import { isInboundMessage } from "../../types/message.js";
import { WS_CLOSE } from "../utils/constants.js";
import { getConnection } from "../registry/connection.registry.js";
import { publish } from "./publisher.js";

export function handleMessage(connectionId: string, raw: string) {
  // Parse — JSON.parse throws on any malformed input
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn({ connectionId }, "Malformed JSON - closing connection");
    getConnection(connectionId)?.socket.close(
      WS_CLOSE.INVALID_MSG,
      "invalid json",
    );
    return;
  }

  // Shape guard — validates type + ts fields exist before narrowing
  if (!isInboundMessage(parsed)) {
    logger.warn({ connectionId, parsed }, "Message failed shape guard");
    getConnection(connectionId)?.socket.close(
      WS_CLOSE.INVALID_MSG,
      "invalid message",
    );
    return;
  }

  // Dispatch — exhaustive switch over the discriminated union
  switch (parsed.type) {
    case "subscribe": {
      if (!parsed.roomId) {
        logger.warn({ connectionId }, "subscribe missing roomId");
        return;
      }
      joinChannel(connectionId, parsed.roomId);
      break;
    }

    case "chat": {
      if (!parsed.roomId || !parsed.text) {
        logger.warn({ connectionId }, "chat missing roomId or text");
        return;
      }
      enqueue(() => publish(parsed.roomId, JSON.stringify(parsed)));
      break;
    }

    case "unsubscribe": {
      if (!parsed.roomId) {
        logger.warn({ connectionId }, "unsubscribe missing roomId");
        return;
      }
      // unsubscribe handler goes here
      break;
    }

    case "ping": {
      const conn = getConnection(connectionId);
      conn?.socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      break;
    }

    case "replay_request": {
      if (!parsed.roomId || !parsed.fromId) {
        logger.warn(
          { connectionId },
          "replay_request missing roomId or fromId",
        );
        return;
      }
      // replay handler goes here
      break;
    }

    default: {
      const _exhaustive: never = parsed;
      logger.warn(
        { connectionId, type: (_exhaustive as { type: string }).type },
        "Unhandled message type",
      );
    }
  }
}

export async function startSubscriber() {
  const pub = await getPublisher();
  await pub.pSubscribe("*", (message: string, channel: string) => {
    const connections = getConnectionsInChannel(channel);
    for (const conn of connections) {
      safeSend(conn, message);
    }
  });
}
