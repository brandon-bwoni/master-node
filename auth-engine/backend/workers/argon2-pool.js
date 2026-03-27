// argon2-pool.js
import { Worker } from "worker_threads";
import { cpus } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = resolve(__dirname, "./argon2-worker.js");

class Argon2Pool {
  constructor(size = cpus().length) {
    this._size = size;
    this._workers = new Array(size).fill(null); // null = not yet spawned
    this._idle = [];
    this._queue = [];
    this._pending = new Map();
    this._taskId = 0;
    this._initialised = false;
  }

  /**
   * Explicitly initialise the pool — call this once after your server
   * has fully started. Not called automatically.
   *
   * await argon2Pool.init() in your server startup, not at import time.
   */
  async init() {
    if (this._initialised) return;
    this._initialised = true;

    // Spawn all workers and wait until every one is ready
    await Promise.all(
      Array.from({ length: this._size }, (_, i) => this._spawn(i)),
    );

    console.log(`[argon2-pool] ${this._size} workers ready`);
  }

  /**
   * Spawn a single worker at index i.
   * Returns a Promise that resolves when the worker signals it is ready.
   */
  _spawn(index) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_PATH);

      // Worker sends { ready: true } once its imports are complete
      worker.once("message", (msg) => {
        if (msg.ready) {
          this._workers[index] = worker;
          this._idle.push(index);
          resolve();
        }
      });

      worker.on("message", ({ result, error, taskId }) => {
        const task = this._pending.get(taskId);
        if (!task) return;
        this._pending.delete(taskId);

        if (error) task.reject(new Error(error));
        else task.resolve(result);

        // Worker finished — dispatch next queued task or mark idle
        if (this._queue.length > 0) {
          this._dispatch(worker, index, this._queue.shift());
        } else {
          this._idle.push(index);
        }
      });

      worker.on("error", (err) => {
        console.error(`[argon2-pool] Worker ${index} error:`, err.message);
        this._workers[index] = null;
        // Respawn after a short delay — avoid tight respawn loops on persistent errors
        setTimeout(() => this._spawn(index), 500);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(
            `[argon2-pool] Worker ${index} exited (code ${code}), respawning`,
          );
          this._workers[index] = null;
          setTimeout(() => this._spawn(index), 500);
        }
      });
    });
  }

  _dispatch(worker, index, task) {
    const taskId = ++this._taskId;
    this._pending.set(taskId, task);
    worker.postMessage({ ...task.workerData, taskId });
  }

  /**
   * Submit a job to the pool.
   * Throws immediately if the pool has not been initialised.
   * Rejects with 429 if the queue is full.
   */
  _submit(workerData) {
    if (!this._initialised) {
      // Hard fail — misconfiguration, not a recoverable error
      return Promise.reject(
        Object.assign(
          new Error(
            "Argon2 pool not initialised — call argon2Pool.init() on startup",
          ),
          { status: 500 },
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const task = { resolve, reject, workerData };

      if (this._idle.length > 0) {
        const index = this._idle.pop();
        const worker = this._workers[index];
        this._dispatch(worker, index, task);
      } else if (this._queue.length >= 50) {
        // Reject fast rather than queue indefinitely
        reject(
          Object.assign(new Error("Auth service overloaded"), { status: 429 }),
        );
      } else {
        this._queue.push(task);
      }
    });
  }

  verify(hash, password) {
    return this._submit({ op: "verify", hash, password });
  }

  hash(password, options) {
    return this._submit({ op: "hash", password, options });
  }

  async destroy() {
    for (const worker of this._workers) {
      if (worker) await worker.terminate();
    }
    this._workers.fill(null);
    this._idle.length = 0;
    this._initialised = false;
  }
}

// Export the class, NOT an instance
// Instantiation and init() happen in server startup — not at import time
export { Argon2Pool };
