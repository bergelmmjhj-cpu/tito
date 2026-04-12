import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  assignWorkerWorkplaceController,
  listAssignableWorkplacesController,
  listWorkersController,
} from "../controllers/adminWorkerController.js";
import {
  exportTimesheetsCsvController,
  getTimesheetDetailController,
  listTimesheetsController,
} from "../controllers/adminTimesheetController.js";

export function createAdminRoutes() {
  const router = Router();

  router.use(authMiddleware);
  router.use(requireRole("admin"));

  router.get("/workers", listWorkersController);
  router.patch("/workers/:workerUserId/workplace", assignWorkerWorkplaceController);
  router.get("/assignable-workplaces", listAssignableWorkplacesController);

  // Timesheets — export must be registered before the :shiftId param route
  router.get("/timesheets/export/csv", exportTimesheetsCsvController);
  router.get("/timesheets", listTimesheetsController);
  router.get("/timesheets/:shiftId", getTimesheetDetailController);

  return router;
}
