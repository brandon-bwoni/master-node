import Application from "./index.js";

const app = new Application();

// Minimal route for benchmarking
app.get("/", (ctx) => {
  ctx.json({ message: "Hello, World!" });
});

// Route with parameters
app.get("/users/:id", (ctx) => {
  ctx.json({
    id: ctx.params.id,
    name: "John Doe",
    email: "john@example.com",
  });
});

// Route with query parsing
app.get("/search", (ctx) => {
  ctx.json({
    query: ctx.query.q,
    results: [],
  });
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`📊 Benchmark server running on port ${PORT}`);
  console.log("");
  console.log("Run benchmarks with autocannon:");
  console.log("");
  console.log("  # Simple route");
  console.log(`  npx autocannon -c 100 -d 10 http://localhost:${PORT}/`);
  console.log("");
  console.log("  # With parameters");
  console.log(
    `  npx autocannon -c 100 -d 10 http://localhost:${PORT}/users/123`,
  );
  console.log("");
  console.log("  # With query strings");
  console.log(
    `  npx autocannon -c 100 -d 10 http://localhost:${PORT}/search?q=test`,
  );
  console.log("");
  console.log("Performance Tips:");
  console.log("  - Radix tree provides O(k) lookup vs O(n)");
  console.log("  - Single context object reduces memory allocation");
  console.log("  - Minimal middleware overhead");
  console.log("  - No external dependencies for core routing");
});
