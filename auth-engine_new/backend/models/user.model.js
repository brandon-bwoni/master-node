import pool from "../config/db.js";

export const createUser = async (username, email, password) => {
  const query =
    "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *";
  const { rows } = await pool.query(query, [username, email, password]);
  return rows[0];
};

export const findUsers = async () => {
  const query = "SELECT id, username, email, created_at FROM users";
  const { rows } = await pool.query(query);
  return rows;
};

export const findUserById = async (id) => {
  const query =
    "SELECT id, username, email, created_at FROM users WHERE id = $1";
  const { rows } = await pool.query(query, [id]);
  return rows[0];
};

export const findUserByEmail = async (email) => {
  const query =
    "SELECT username, email, password_hash FROM users WHERE email = $1";
  const { rows } = await pool.query(query, [email]);
  return rows[0];
};
