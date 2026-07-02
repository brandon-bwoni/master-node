import {
  createUser,
  getUsers,
  getUserById,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/index.js";

export function registerUserRoutes(app) {
  app.post("/api/register", createUser);
  app.get("/api/users", authenticate, getUsers);
  app.get("/api/users/:id", authenticate, getUserById);
}
