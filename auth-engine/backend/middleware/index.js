import fs from "fs/promises";

// Logging middleware
export const logger = async (ctx, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  await fs.writeFile(
    "logs/logs.log",
    `[${timestamp}] --> ${ctx.method} ${ctx.url}\n`,
    { flag: "a" },
  );

  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    throw err;
  } finally {
    const duration = Date.now() - start;
    await fs.writeFile(
      "logs/logs.log",
      `[${timestamp}] <-- ${ctx.method} ${ctx.url} [${ctx.status}] ${duration}ms\n`,
      { flag: "a" },
    );
    console.log(`${ctx.method} ${ctx.url} [${ctx.status}] ${duration}ms`);
  }
};

//  CORS middleware
export const cors = async (ctx, next) => {
  // Set CORS headers on every response
  ctx.res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  ctx.res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  ctx.res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  ctx.res.setHeader("Access-Control-Allow-Credentials", "true");

  // ← Handle preflight OPTIONS request and return early
  if (ctx.req.method === "OPTIONS") {
    ctx.res.writeHead(204);
    ctx.res.end();
    return; //
  }

  await next();
};
