import {
  getProfile,
  loginUser,
  logoutUser,
  refreshToken,
} from "../controllers/auth.controller.js";

import {
  login,
  logout,
  logoutAll,
  refresh,
} from "../controllers/auth.hybrid.controller.js";
import { sessionAuth } from "../middleware/index.js";

// export function authenticateUserRoutes(app) {
//   app.post("/api/auth/login", loginUser);
//   app.post("/api/auth/logout", logoutUser);
//   app.post("/api/auth/refresh", refreshToken);
//   app.get("/api/auth/me", getProfile);
// }

// export function authenticateUserRoutes(app) {
//   app.post("/api/auth/login", async (ctx) => {
//     try {
//       const { email, password } = ctx.body;
//       const user = await login(ctx, email, password);
//       ctx.json({ message: "Login successful", user });
//     } catch (err) {
//       ctx.status = err.status || 500;
//       ctx.json({ error: err.message });
//     }
//   });
//   app.post("/api/auth/logout", logout);
//   app.post("/api/auth/logout-all", sessionAuth, logoutAll);
// }

export function authenticateUserRoutes(app) {
  app.post("/api/auth/login", async (ctx) => {
    const start = Date.now();

    // console.log(`[login] start, pool queue depth: ${pool.queueDepth}`);

    try {
      const result = await login(ctx);
      console.log(`[login] done in ${Date.now() - start}ms`);
      ctx.json(result);
    } catch (err) {
      console.error(
        `[login] error after ${Date.now() - start}ms:`,
        err.message,
      );
      throw err;
    }
  });
  app.post("/api/auth/logout", logout);
  app.post("/api/auth/refresh", refresh);
  app.post("/api/auth/logout-all", sessionAuth, logoutAll);
}
