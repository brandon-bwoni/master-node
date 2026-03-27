import argon2 from "argon2";

import * as User from "../models/user.model.js";

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

const users = [
  { id: 1, username: "alice", email: "alice@example.com" },
  { id: 2, username: "bob", email: "bob@example.com" },
];

// Create a new user
export async function createUser(ctx) {
  try {
    const { username, email, password } = ctx.body;

    if (!username || !email || !password) {
      ctx.status = 400;
      return ctx.json({ message: "Username, email and password are required" });
    }

    if (username.length < 2 || username.length > 40) {
      ctx.status = 400;
      return ctx.json({
        message: "Username must be between 2 and 40 characters",
      });
    }

    if (password.length < 8) {
      ctx.status = 400;
      return ctx.json({ message: "Password must be at least 8 characters" });
    }

    if (!validateEmail(email)) {
      ctx.status = 400;
      return ctx.json({ message: "Invalid email address" });
    }

    const hashedPassword = await argon2.hash(password, { timeCost: 2 });
    const newUser = {
      id: users.length + 1,
      username: username,
      password_hash: hashedPassword,
      email: email,
    };

    const user = await User.createUser(
      newUser.username,
      newUser.email,
      newUser.password_hash,
    );
    ctx.status = 201;
    ctx.json({ message: "User successfully registered" });
  } catch (err) {
    ctx.status = 500;
    ctx.json({ message: "User registration failed", error: err.message });
  }
}

// Get all users
export const getUsers = async (ctx) => {
  const users = await User.findUsers();
  try {
    if (!users || users.length === 0) {
      ctx.status = 404;
      return ctx.json({ message: "No users found" });
    }

    ctx.status = 200;
    ctx.json({
      message: "Users retrieved successfully",
      count: users.length,
      data: users,
    });
  } catch (err) {
    ctx.status = 500;
    ctx.json({ message: "Internal server error", error: err });
  }
};

// Get user by ID
export const getUserById = async (ctx) => {
  try {
    const id = parseInt(ctx.params.id);

    if (isNaN(id)) {
      ctx.status = 400;
      return ctx.json({ message: "Invalid user ID" });
    }

    const user = await User.findUserById(id);

    if (!user) {
      ctx.status = 404;
      return ctx.json({ message: `User with id ${id} not found` });
    }

    ctx.status = 200;
    ctx.json({
      message: "User retrieved successfully",
      data: user,
    });
  } catch (err) {
    ctx.status = 500;
    ctx.json({ messsage: "Internal server error", error: err });
  }
};

// Login user
