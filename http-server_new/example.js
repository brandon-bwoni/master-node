import Application from "./index.js";

/**
 * Example: Comprehensive demonstration of Velocity framework
 * Shows routing, middleware, request parsing, error handling, and more
 */

// Create application instance
const app = new Application();

// ============================================
// 1. GLOBAL MIDDLEWARE
// ============================================

// Logger middleware - runs for every request
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`--> ${ctx.method} ${ctx.url}`);

  await next(); // Continue to next middleware/handler

  const duration = Date.now() - start;
  console.log(`<-- ${ctx.method} ${ctx.url} [${ctx.status}] ${duration}ms`);
});

// Authentication middleware example
app.use(async (ctx, next) => {
  // Simulate auth check
  if (ctx.headers.authorization) {
    ctx.state.user = { id: 1, name: "John Doe" };
  }
  await next();
});

// CORS middleware example
app.use(async (ctx, next) => {
  ctx.setHeader("Access-Control-Allow-Origin", "*");
  ctx.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  await next();
});

// ============================================
// 2. BASIC ROUTES
// ============================================

// Simple GET route
app.get("/", (ctx) => {
  ctx.json({
    message: "Welcome to Velocity Framework!",
    framework: "Velocity",
    version: "1.0.0",
    features: [
      "Fast Radix Tree Routing",
      "Middleware Pipeline",
      "Request Context",
      "Async/Await Support",
      "Built-in Parsers",
    ],
  });
});

// HTML response
app.get("/page", (ctx) => {
  ctx.html(`
    <!DOCTYPE html>
    <html>
      <head><title>Velocity</title></head>
      <body>
        <h1>Welcome to Velocity Framework</h1>
        <p>A high-performance Node.js HTTP framework</p>
      </body>
    </html>
  `);
});

// Text response
app.get("/hello", (ctx) => {
  ctx.send("Hello, World!");
});

// ============================================
// 3. DYNAMIC ROUTING (URL Parameters)
// ============================================

// Single parameter
app.get("/users/:id", (ctx) => {
  ctx.json({
    message: "User details",
    userId: ctx.params.id,
    user: { id: ctx.params.id, name: "John Doe", email: "john@example.com" },
  });
});

// Multiple parameters
app.get("/users/:userId/posts/:postId", (ctx) => {
  ctx.json({
    userId: ctx.params.userId,
    postId: ctx.params.postId,
    post: {
      id: ctx.params.postId,
      title: "Sample Post",
      author: ctx.params.userId,
    },
  });
});

// ============================================
// 4. QUERY PARAMETERS
// ============================================

app.get("/search", (ctx) => {
  const { q, page = 1, limit = 10 } = ctx.query;

  ctx.json({
    query: q,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: 5,
    },
    results: [
      { id: 1, title: `Result for "${q}"` },
      { id: 2, title: `Another result for "${q}"` },
    ],
  });
});

// ============================================
// 5. POST/PUT REQUESTS (Body Parsing)
// ============================================

// Create resource
app.post("/users", (ctx) => {
  const userData = ctx.body;

  // Simulate database save
  const newUser = {
    id: Math.floor(Math.random() * 1000),
    ...userData,
    createdAt: new Date().toISOString(),
  };

  ctx.setStatus(201);
  ctx.json({
    message: "User created successfully",
    user: newUser,
  });
});

// Update resource
app.put("/users/:id", (ctx) => {
  ctx.json({
    message: "User updated",
    userId: ctx.params.id,
    updatedData: ctx.body,
  });
});

// Delete resource
app.delete("/users/:id", (ctx) => {
  ctx.setStatus(204);
  ctx.send("");
});

// ============================================
// 6. MIDDLEWARE CHAINING (Route-specific)
// ============================================

// Auth middleware for specific route
const requireAuth = async (ctx, next) => {
  if (!ctx.state.user) {
    ctx.setStatus(401);
    ctx.json({ error: "Unauthorized - Please provide authentication" });
    return;
  }
  await next();
};

// Validation middleware
const validateUser = async (ctx, next) => {
  if (!ctx.body || !ctx.body.name || !ctx.body.email) {
    ctx.setStatus(400);
    ctx.json({ error: "Missing required fields: name, email" });
    return;
  }
  await next();
};

// Protected route with multiple middleware
app.post("/protected", requireAuth, validateUser, (ctx) => {
  ctx.json({
    message: "Access granted!",
    user: ctx.state.user,
    data: ctx.body,
  });
});

// ============================================
// 7. ASYNC OPERATIONS
// ============================================

// Simulate database query
const fetchUserFromDB = async (id) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id, name: "Jane Smith", email: "jane@example.com" });
    }, 100);
  });
};

app.get("/async/users/:id", async (ctx) => {
  const user = await fetchUserFromDB(ctx.params.id);
  ctx.json(user);
});

// ============================================
// 8. ERROR HANDLING
// ============================================

// Route that throws error
app.get("/error", (ctx) => {
  throw new Error("Something went wrong!");
});

// Route with custom error
app.get("/forbidden", (ctx) => {
  const error = new Error("Access Forbidden");
  error.status = 403;
  throw error;
});

// ============================================
// 9. STATUS CODES & REDIRECTS
// ============================================

app.get("/redirect", (ctx) => {
  ctx.redirect("/");
});

app.get("/permanent-redirect", (ctx) => {
  ctx.redirect("/", 301);
});

app.get("/not-implemented", (ctx) => {
  ctx.setStatus(501);
  ctx.json({ error: "Not Implemented" });
});

// ============================================
// 10. WILDCARD & CATCH-ALL
// ============================================

app.all("/api/*", (ctx) => {
  ctx.json({
    message: "API endpoint",
    path: ctx.path,
    method: ctx.method,
  });
});

// ============================================
// 11. PERFORMANCE STATS
// ============================================

app.get("/stats", (ctx) => {
  ctx.json({
    totalRequests: ctx.app.stats.requests,
    errors: ctx.app.stats.errors,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ============================================
// CUSTOM ERROR HANDLER
// ============================================

app.onError((error, ctx) => {
  console.error("❌ Error:", error.message);

  if (!ctx.res.headersSent) {
    ctx.setStatus(error.status || 500);
    ctx.json({
      error: error.message,
      status: error.status || 500,
      path: ctx.path,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = 3000;

app.listen(PORT, () => {
  console.log("");
  console.log("📚 Velocity Framework Example");
  console.log("============================");
  console.log("");
  console.log("Try these routes:");
  console.log(`  http://localhost:${PORT}/                    - Home`);
  console.log(`  http://localhost:${PORT}/hello               - Text response`);
  console.log(`  http://localhost:${PORT}/page                - HTML page`);
  console.log(`  http://localhost:${PORT}/users/123           - URL params`);
  console.log(`  http://localhost:${PORT}/search?q=test&page=2 - Query params`);
  console.log(`  http://localhost:${PORT}/async/users/456     - Async handler`);
  console.log(
    `  http://localhost:${PORT}/stats               - Performance stats`,
  );
  console.log(
    `  http://localhost:${PORT}/error               - Error handling`,
  );
  console.log("");
  console.log("POST requests (use curl or Postman):");
  console.log(`  POST http://localhost:${PORT}/users`);
  console.log(`       Body: { "name": "Alice", "email": "alice@example.com" }`);
  console.log("");
});
