const users = [
  { id: 1, username: "alice", email: "alice@example.com" },
  { id: 2, username: "bob", email: "bob@example.com" },
];

export const getUsers = (ctx) => {
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
    ctx.json({ message: "Internal server error", error: err.message });
  }
};

export const getUserById = (ctx) => {};
