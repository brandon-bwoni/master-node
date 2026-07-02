import cluster from "cluster";
import worker = require("cluster");
import os from "os";

const numCPUS = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running `);

  for (let i = 0; i < numCPUS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const { startServer } = await import("./server.js");
  await startServer();
}
