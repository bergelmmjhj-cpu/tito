import { Router } from "express";
import {
  actionController,
  historyController,
  shiftHistoryController,
  statusController,
} from "../controllers/timeController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export function createTimeRoutes() {
  const router = Router();

  router.use(authMiddleware);
  router.get("/status", statusController);
  router.post("/actions", actionController);
  router.get("/history", historyController);
  router.get("/shifts", shiftHistoryController);

  return router;
}
