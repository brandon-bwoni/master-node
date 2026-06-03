import type { ConnectionRecord } from "../registry/connection.registry.js";
import {
  unregisterConnection,
  leaveRoom,
} from "../registry/connection.registry.js";
import {
  leaveChannel,
  leaveAllChannels,
} from "../registry/channel.registry.js";
import { setOffline } from "../presence/presence.service.js";
import { logger } from "../../shared/logger.js";
import { BACKPRESSURE, WS_CLOSE } from "../utils/constants.js";

// TYPES
interface QueuedTask {
  fn: () => Promise<void>;
  enqueuedAt: number;
}

const taskQueue: QueuedTask[] = [];
let processing = false;
const MAX_TASK_QUEUE = 2_048;
const MAX_CONCURENCY = 8;
let activeTasks = 0;

export function enqueue(fn: () => Promise<void>): boolean {
  if (taskQueue.length >= MAX_TASK_QUEUE) {
    logger.warn({ queueDepth: taskQueue.length }, "Task queue at capacity");
    return false;
  }

  taskQueue.push({ fn, enqueuedAt: Date.now() });

  if (!processing) drainTaskQueue();

  return true;
}

// Draining task queue
function drainTaskQueue(): void {
  processing = true;

  const tick = (): void => {
    // Drain up to MAX_CONCUREENCY tasks in parallel
    while (taskQueue.length > 0 && activeTasks < MAX_CONCURENCY) {
      const task = taskQueue.shift()!;
      activeTasks++;

      const waitMs = Date.now() - task.enqueuedAt;
      if (waitMs > 5_000) {
        // Task waited too long, system is overloaded, log and skip
        logger.warn(
          { waitMs },
          "Task queue latency too high. skipping stale task",
        );
        activeTasks++;
        continue;
      }

      task
        .fn()
        .catch((err: Error) => {
          logger.error({ err: err.message }, "Enqueued task failed");
        })
        .finally(() => {
          activeTasks--;
          if (taskQueue.length > 0) tick();
          else processing = false;
        });
    }

    if (taskQueue.length === 0 && activeTasks === 0) {
      processing = false;
    }

    setImmediate(tick);
  };
}

/**
 * PER CONNECTION SEND QUEUE
 */
export function safeSend(conn: ConnectionRecord, message: string): void {
  // Dead socket
  if (conn.socket.readyState !== conn.socket.OPEN) {
    logger.warn(
      {
        connId: conn.id,
        userId: conn.user.id,
        readState: conn.socket.readyState,
      },
      "safeSend called on non-open socket. Cleaningup dead connection",
    );
    cleanupDeadConnection(conn);
    return;
  }

  // TCP buffer healthy
  if (
    conn.socket.bufferedAmount <= BACKPRESSURE.HIGH_WATER_BYTES &&
    !conn.draining &&
    conn.sendQueue.length === 0
  ) {
    conn.socket.send(message);
    return;
  }

  // Buffer backed up
  if (conn.sendQueue.length >= BACKPRESSURE.MAX_QUEUE_SIZE) {
    conn.slowCount++;

    logger.warn(
      {
        connId: conn.id,
        userId: conn.user.id,
        slowCount: conn.slowCount,
        queueDepth: conn.sendQueue.length,
      },
      "Send queue full. Drop oldest message",
    );

    conn.sendQueue.shift();

    if (conn.slowCount >= BACKPRESSURE.SLOW_CONSUMER_LIMIT) {
      logger.warn(
        { connId: conn.id, userId: conn.user.id },
        "Slow consumer limit exceeded. Closing connection...",
      );

      conn.socket.close(WS_CLOSE.POLICY, "consumer too slow");
      cleanupDeadConnection(conn);
      return;
    }
  }

  conn.sendQueue.push(message);

  if (!conn.draining) drainSendQueue(conn);
}

function drainSendQueue(conn: ConnectionRecord): void {
  conn.draining = true;

  const tick = (): void => {
    // Stop draining is socket died mid-drain
    if (conn.socket.readyState !== conn.socket.OPEN) {
      conn.draining = false;
      conn.sendQueue.length = 0;
      cleanupDeadConnection(conn);
      return;
    }

    if (conn.sendQueue.length === 0) {
      conn.draining = false;
      return;
    }

    // Wait for TCP buffer to drain before sending next batch
    if (conn.socket.bufferedAmount > BACKPRESSURE.HIGH_WATER_BYTES) {
      setTimeout(tick, BACKPRESSURE.DRAIN_INTERVAL_MS);
      return;
    }

    const message = conn.sendQueue.shift()!;
    conn.socket.send(message);

    setImmediate(tick);
  };
}

/**
 * DEAD CONNECTION CLEANUP
 */
function cleanupDeadConnection(conn: ConnectionRecord): void {
  // Terminate the raw socket if still connected in any state
  if (conn.socket.readyState !== conn.socket.CLOSED) {
    conn.socket.terminate();
  }

  (async () => {
    try {
      for (const roomId of conn.rooms) {
        leaveRoom(conn.id, roomId);
        await leaveChannel(conn.id, roomId);
        await setOffline(conn.user.id, roomId);
      }
      unregisterConnection(conn.id);

      logger.info(
        { connId: conn.id, userId: conn.user.id },
        "Dead connection cleaned up from send path",
      );
    } catch (err) {
      logger.error(
        { connId: conn.id, userId: conn.user.id, err: (err as Error).message },
        "Error cleaning up dead connection",
      );
    }
  })();
}

/**
 * METRICS
 */
export function getQueueStats() {
  return {
    taskQueueDepth: taskQueue.length,
    activeTasks,
    processing,
  };
}
