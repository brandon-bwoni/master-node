import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,

  //   DB Pooling
  min: 2,
  max: 20,

  // Timeouts
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 10_000,
});

pool.on("error", (err) => {
  console.error("Idle pool client error:", err);
});

export async function connectDB() {
  await pool.query("SELECT 1");
  console.log("Postgres connected");
}

export default pool;
