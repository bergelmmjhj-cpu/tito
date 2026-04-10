import { Router } from "express";
import { loginController, meController } from "../controllers/authController.js";

export function createAuthRouter() {
  const router = Router();

  router.post("/login", loginController);
  router.get("/me", meController);

  return router;
}
