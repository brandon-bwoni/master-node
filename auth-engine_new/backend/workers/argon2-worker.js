// argon2-worker.js
import { parentPort } from "worker_threads";
import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

// Signal to the pool that this worker is fully loaded and ready.
// Without this, the pool might dispatch a task before the worker's
// imports have finished, causing a race condition.
parentPort.postMessage({ ready: true });

parentPort.on("message", async ({ op, hash, password, options, taskId }) => {
  try {
    let result;

    if (op === "verify") {
      result = await argon2.verify(hash, password);
    } else if (op === "hash") {
      result = await argon2.hash(password, options ?? ARGON2_OPTIONS);
    } else {
      throw new Error(`Unknown op: ${op}`);
    }

    parentPort.postMessage({ result, taskId });
  } catch (err) {
    // Always respond — a worker that goes silent starves the pool
    parentPort.postMessage({ error: err.message, taskId });
  }
});
