import "dotenv/config";
import cluster from "cluster";
import os from "os";
import { Http2ServerRequest } from "http2";

import { Argon2Pool } from "./workers/argon2-pool.js";
import App from "./lib/app.js";
import { redis } from "./store/session-store.js";
import { connectDB } from "./config/db.js";
import { registerUserRoutes } from "./routes/user.routes.js";

// Middlewares
import { logger, cors, cookieParse } from "./middleware/index.js";
import { authenticateUserRoutes } from "./routes/auth.routes.js";

export const argon2Pool = new Argon2Pool(os.cpus().length * 2);
const app = new App();

app.use(logger);
app.use(cookieParse);
app.use(cors);

app.get("/", (ctx) => {
  ctx.json({
    message: "Welcome to my authentication app",
    version: "1.0.0",
    features: ["nodejs", "authentication", "jwt", "argon2"],
  });
});

// Registration route
registerUserRoutes(app);

// Authenticatin route
authenticateUserRoutes(app);

async function start() {
  // 1. Verify Redis is reachable before accepting traffic
  await redis.ping();
  await connectDB();
  console.log("[startup] Redis connected");

  // 2. Workers are spawned here — after Redis confirmed, before HTTP traffic
  await argon2Pool.init();
  console.log("[startup] Argon2 pool ready");

  // 3. Register routes — pool is guaranteed ready when handlers run
  // Registration route
  registerUserRoutes(app);

  // Authenticatin route
  authenticateUserRoutes(app);

  // 4. Start accepting connections last
  const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`[startup] Listening on :${process.env.PORT || 3000}`);
  });

  // 5. Graceful shutdown — drain workers before process exits
  const shutdown = async (signal) => {
    console.log(`[shutdown] ${signal} received`);
    server.close(async () => {
      await argon2Pool.destroy();
      await redis.quit();
      console.log("[shutdown] Clean exit");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("[startup] Fatal:", err);
  process.exit(1);
});
