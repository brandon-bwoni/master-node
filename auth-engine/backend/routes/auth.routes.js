import App from "../lib/app.js";
import { register } from "../controllers/auth.controller.js";

const app = new App();

app.post("/api/register", register);
