import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  assignWorkerWorkplaceController,
  listAssignableWorkplacesController,
  listWorkersController,
} from "../controllers/adminWorkerController.js";

export function createAdminRoutes() {
  const router = Router();

  router.use(authMiddleware);
  router.use(requireRole("admin"));

  router.get("/workers", listWorkersController);
  router.patch("/workers/:workerUserId/workplace", assignWorkerWorkplaceController);
  router.get("/assignable-workplaces", listAssignableWorkplacesController);

  return router;
}
