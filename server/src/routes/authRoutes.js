import { Router } from "express";
import { loginController, meController, registerController } from "../controllers/authController.js";
import { authReadRateLimit, loginRateLimit } from "../middleware/rateLimitMiddleware.js";

export function createAuthRouter() {
  const router = Router();

  router.post("/register", loginRateLimit, registerController);
  router.post("/login", loginRateLimit, loginController);
  router.get("/me", authReadRateLimit, meController);

  return router;
}
