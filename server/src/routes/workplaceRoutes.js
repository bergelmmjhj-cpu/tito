import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  createWorkplaceController,
  getWorkplaceController,
  listWorkplacesController,
  setWorkplaceStatusController,
  updateWorkplaceController,
} from "../controllers/workplaceController.js";

export function createWorkplaceRoutes() {
  const router = Router();

  router.use(authMiddleware);
  router.use(requireRole("admin"));

  router.get("/", listWorkplacesController);
  router.get("/:workplaceId", getWorkplaceController);
  router.post("/", createWorkplaceController);
  router.put("/:workplaceId", updateWorkplaceController);
  router.patch("/:workplaceId/status", setWorkplaceStatusController);

  return router;
}
