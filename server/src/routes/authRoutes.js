import { Router } from "express";
import {
  googleAuthStartController,
  googleCallbackController as googleRedirectCallbackController,
  loginController,
  meController,
  registerController,
} from "../controllers/authController.js";
import {
  googleAuthUrlController,
  googleCallbackController as googleTokenCallbackController,
} from "../controllers/googleAuthController.js";
import { authReadRateLimit, loginRateLimit } from "../middleware/rateLimitMiddleware.js";

export function createAuthRouter() {
  const router = Router();

  router.post("/register", loginRateLimit, registerController);
  router.post("/login", loginRateLimit, loginController);
  router.get("/me", authReadRateLimit, meController);

  router.get("/google", authReadRateLimit, googleAuthStartController);
  router.get("/google/callback", authReadRateLimit, googleRedirectCallbackController);
  router.get("/google/url", googleAuthUrlController);
  router.post("/google/callback", loginRateLimit, googleTokenCallbackController);

  return router;
}
