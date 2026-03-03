import http from "http";
import Context from "./context.js";
import Router from "./router.js";
import { parseQuery, parseBody, getPathname } from "./request.js";

class Application {
  constructor() {
    this.router = new Router();
    this.middleware = [];
    this.errorHandler = this.defaultErrorHandler.bind(this);

    // Performance stats
    this.stats = {
      requests: 0,
      errors: 0,
    };
  }

  /**
   * Register global middleware
   * Middleware signature: async (ctx, next) => {}
   */
  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  /**
   * Register route handlers
   */
  get(path, ...handlers) {
    this.router.get(path, this.composeHandlers(handlers));
    return this;
  }

  post(path, ...handlers) {
    this.router.post(path, this.composeHandlers(handlers));
    return this;
  }

  put(path, ...handlers) {
    this.router.put(path, this.composeHandlers(handlers));
    return this;
  }

  delete(path, ...handlers) {
    this.router.delete(path, this.composeHandlers(handlers));
    return this;
  }

  patch(path, ...handlers) {
    this.router.patch(path, this.composeHandlers(handlers));
    return this;
  }

  all(path, ...handlers) {
    this.router.all(path, this.composeHandlers(handlers));
    return this;
  }

  /**
   * Compose multiple route handlers into one
   */
  composeHandlers(handlers) {
    if (handlers.length === 1) return handlers[0];

    return async (ctx) => {
      for (const handler of handlers) {
        await handler(ctx);
        // Check if response was sent
        if (ctx.res.writableEnded) break;
      }
    };
  }

  /**
   * Set custom error handler
   */
  onError(handler) {
    this.errorHandler = handler;
    return this;
  }

  /**
   * Default error handler
   */
  defaultErrorHandler(error, ctx) {
    console.error("Error:", error);

    if (!ctx.res.headersSent) {
      ctx.setStatus(error.status || 500);
      ctx.json({
        error: error.message || "Internal Server Error",
        status: error.status || 500,
      });
    }
  }

  /**
   * Main request handler
   */
  async handleRequest(req, res) {
    this.stats.requests++;

    // Create context
    const ctx = new Context(req, res, this);

    try {
      // Parse request
      ctx.path = getPathname(req.url);
      ctx.query = parseQuery(req.url);

      // Find route
      const match = this.router.find(req.method, ctx.path);

      if (!match) {
        ctx.setStatus(404);
        ctx.json({ error: "Not Found", path: ctx.path });
        return;
      }

      // Set params from router
      ctx.params = match.params;

      // Parse body for POST/PUT/PATCH
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        ctx.body = await parseBody(req);
      }

      // Execute middleware pipeline
      await this.executeMiddleware(ctx, match.handler);

      // Ensure response is sent
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      this.stats.errors++;
      this.errorHandler(error, ctx);
    }
  }

  /**
   * Execute middleware chain with route handler
   */
  async executeMiddleware(ctx, routeHandler) {
    const middleware = [...this.middleware];
    let index = 0;

    const next = async () => {
      if (index < middleware.length) {
        const fn = middleware[index++];
        await fn(ctx, next);
      } else {
        // Execute route handler after all middleware
        await routeHandler(ctx);
      }
    };

    await next();
  }

  /**
   * Start HTTP server
   */
  listen(port, callback) {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(port, () => {
      console.log(`🚀 Velocity server listening on port ${port}`);
      if (callback) callback();
    });

    return server;
  }
}

export default Application;
