import dotenv from "dotenv";
dotenv.config();

import cluster from "cluster";
import os from "os";
import { env } from "./config/env.js";
import { logger } from "../shared/logger.js";

const MAX_RESTARTS = 5;
const RESTART_WINDOW = 60_000;

if (cluster.isPrimary) {
  const workerCount = env.CLUSTER_WORKERS || os.cpus().length;
  const failures = new Map<number, number[]>();

  logger.info({ workerCount, pid: process.pid }, "Primary started");

  // Fork initial workers
  for (let i = 0; i < workerCount; i++) {
    forkWorker(i);
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, "Worker died");

    const id = worker.id;
    const now = Date.now();
    const prev = (failures.get(id) ?? []).filter(
      (t) => now - t < RESTART_WINDOW,
    );
    prev.push(now);
    failures.set(id, prev);

    if (prev.length >= MAX_RESTARTS) {
      // Worker is crash-looping — stop restarting it
      logger.fatal(
        { workerId: id, crashes: prev.length, windowMs: RESTART_WINDOW },
        "Worker exceeded restart limit — not restarting. Fix the error and restart the process.",
      );
      // If ALL workers are dead, exit the primary too
      if (Object.keys(cluster.workers ?? {}).length === 0) {
        logger.fatal("All workers dead — exiting primary");
        process.exit(1);
      }
      return;
    }

    logger.info({ workerId: id, attempt: prev.length }, "Restarting worker");
    forkWorker(id);
  });
} else {
  // Worker process
  import("./server.js")
    .then(({ startServer }) => startServer())
    .catch((err: Error) => {
      // Log the actual error clearly before dying so the primary's log is readable
      logger.fatal(
        { err: err.message, stack: err.stack },
        "Worker startup failed",
      );
      process.exit(1);
    });
}

function forkWorker(index: number): void {
  const worker = cluster.fork({
    NODE_ID: `worker-${index}`,
    PORT: env.PORT,
  });
  logger.info(
    { pid: worker.process.pid, workerId: worker.id },
    "Worker forked",
  );
}
