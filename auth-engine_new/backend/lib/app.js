import http from "http";
import RouterTree from "./router.js";
import Context from "./context.js";
import { parseQuery, parseBody, getPathname } from "./request.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

class App {
  constructor() {
    this.router = new RouterTree();
    this.middleware = [];

    this.errorHandler = this._defaultErrorHandler.bind(this);

    // Peformance stats
    this._stats = {
      requests: 0,
      errors: 0,
    };
  }

  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  /**
   * Register route handlers
   */
  get(path, ...handlers) {
    this.router.get(path, this._compose(handlers));
    return this;
  }
  post(path, ...handlers) {
    this.router.post(path, this._compose(handlers));
    return this;
  }
  put(path, ...handlers) {
    this.router.put(path, this._compose(handlers));
    return this;
  }
  delete(path, ...handlers) {
    this.router.delete(path, this._compose(handlers));
    return this;
  }
  patch(path, ...handlers) {
    this.router.patch(path, this._compose(handlers));
    return this;
  }
  all(path, ...handlers) {
    this.router.all(path, this._compose(handlers));
    return this;
  }

  //  Set error handler
  onError(handler) {
    this.errorHandler =
      typeof handler === "function"
        ? handler.bind(handler)
        : (() => {
            throw new TypeError("onError requires a function");
          })();
    return this;
  }

  //   Default error handler
  async _defaultErrorHandler(error, ctx) {
    console.error("Unhandled error:", error);

    if (ctx.res.headersSent) {
      ctx.res.destroy();
      return;
    }

    ctx.setStatus(error.status || 500);
    ctx.json({
      error: error.message || "Internal Server Error",
      status: error.status || 500,
    });
  }

  //   Composition
  _compose(handlers) {
    if (handlers.length === 1) return handlers[0];

    return async (ctx) => {
      for (const handler of handlers) {
        await handler(ctx);
        if (ctx.res.writableEnded) break;
      }
    };
  }

  /**
   * Main request handler
   */
  async handleRequest(req, res) {
    this._stats.requests++;

    const ctx = new Context(req, res, this);

    ctx.path = getPathname(req.url);
    ctx.query = parseQuery(req.url);

    try {
      const match = this.router.find(req.method, ctx.path);

      if (!match) {
        ctx.setStatus(404);
        ctx.json({ error: "Not Found" });
        return;
      }

      ctx.params = match.params;
      await this._executeMiddleware(ctx, match.handler);

      if (!res.writableEnded) res.end();
    } catch (error) {
      this._stats.errors++;
      await this.errorHandler(error, ctx);
    }
  }

  /**
   * Execute middleware chain with route handler
   */
  async _executeMiddleware(ctx, routeHandler) {
    const middleware = this.middleware; // Fix: no [...spread] allocation per request
    const total = middleware.length;
    let index = 0;

    const next = async () => {
      if (index < total) {
        await middleware[index++](ctx, next);
      } else {
        if (BODY_METHODS.has(ctx.req.method)) {
          ctx.body = await parseBody(ctx.req);
        }
        await routeHandler(ctx);
      }
    };

    await next();
  }

  get stats() {
    return { ...this._stats };
  }

  listen(port, callback) {
    const server = http.createServer((req, res) =>
      this.handleRequest(req, res),
    );
    server.listen(port, callback);
    return server;
  }
}

export default App;
