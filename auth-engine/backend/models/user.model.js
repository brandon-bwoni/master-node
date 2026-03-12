import pool from "../config/db.config.js";

export const createUser = async (username, email, password) => {
  const query =
    "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *";
};
