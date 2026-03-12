import argon2 from "argon2";

const users = [
  { id: 1, username: "alice", email: "alice@example.com" },
  { id: 2, username: "bob", email: "bob@example.com" },
];

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

export async function register(ctx) {
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

    const hashedPassword = await argon2.hash(password);
    console.log(hashedPassword);
    const newUser = {
      id: users.length + 1,
      username: username,
      password: hashedPassword,
      email: email,
    };

    ctx.status = 200;
    console.log("New user registered:", newUser);
    users.push(newUser);
    ctx.json({ message: "User successfully registered" });
  } catch (err) {
    ctx.status = 500;
    ctx.json({ message: "User registration failed", error: err.message });
  }
}
