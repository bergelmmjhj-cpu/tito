import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  adminAccessController,
  adminLoginController,
  adminMeController,
} from "../controllers/adminAuthController.js";
import {
  assignWorkerWorkplaceController,
  listAssignableWorkplacesController,
  listWorkersController,
} from "../controllers/adminWorkerController.js";
import {
  exportTimesheetsCsvController,
  getTimesheetDetailController,
  listTimesheetsController,
  payrollSummaryController,
  resolveTimesheetController,
} from "../controllers/adminTimesheetController.js";
import {
  createAdminUserController,
  listAdminUsersController,
  setAdminUserRoleController,
  setAdminUserStatusController,
} from "../controllers/adminUserController.js";
import { adminLoginRateLimit } from "../middleware/rateLimitMiddleware.js";

export function createAdminRoutes() {
  const router = Router();

  // Dedicated admin login endpoint.
  router.post("/login", adminLoginRateLimit, adminLoginController);

  router.use(authMiddleware);

  // Frontend auth/role probe for admin route checks.
  router.get("/access", adminAccessController);

  router.use(requireRole("admin"));

  router.get("/me", adminMeController);

  router.get("/workers", listWorkersController);
  router.patch("/workers/:workerUserId/workplace", assignWorkerWorkplaceController);
  router.get("/assignable-workplaces", listAssignableWorkplacesController);

  router.get("/users", listAdminUsersController);
  router.post("/users", createAdminUserController);
  router.patch("/users/:userId/status", setAdminUserStatusController);
  router.patch("/users/:userId/role", setAdminUserRoleController);

  // Timesheets — export must be registered before the :shiftId param route
  router.get("/timesheets/export/csv", exportTimesheetsCsvController);
  router.get("/timesheets/summary/payroll", payrollSummaryController);
  router.get("/timesheets", listTimesheetsController);
  router.patch("/timesheets/:shiftId/resolve", resolveTimesheetController);
  router.get("/timesheets/:shiftId", getTimesheetDetailController);

  return router;
}
