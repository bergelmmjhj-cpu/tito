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
  createPayrollPeriodController,
  createPayrollExportBatchController,
  downloadPayrollExportBatchCsvController,
  exportTimesheetsCsvController,
  getPayrollPeriodDetailController,
  getPayrollExportBatchDetailController,
  getTimesheetDetailController,
  listPayrollPeriodsController,
  listTimesheetsController,
  listPayrollExportBatchesController,
  lockPayrollPeriodController,
  payrollSummaryController,
  reopenPayrollPeriodController,
  reopenPayrollExportBatchController,
  reissuePayrollExportBatchController,
  resolveTimesheetController,
} from "../controllers/adminTimesheetController.js";
import {
  createAdminUserController,
  listAdminUsersController,
  setAdminUserRoleController,
  setAdminUserStatusController,
} from "../controllers/adminUserController.js";
import { adminLoginRateLimit } from "../middleware/rateLimitMiddleware.js";
import { dashboardController } from "../controllers/adminDashboardController.js";

export function createAdminRoutes() {
  const router = Router();

  // Dedicated admin login endpoint.
  router.post("/login", adminLoginRateLimit, adminLoginController);

  router.use(authMiddleware);

  // Frontend auth/role probe for admin route checks.
  router.get("/access", adminAccessController);

  router.use(requireRole("admin"));

  router.get("/me", adminMeController);

  router.get("/dashboard", dashboardController);

  router.get("/workers", listWorkersController);
  router.patch("/workers/:workerUserId/workplace", assignWorkerWorkplaceController);
  router.get("/assignable-workplaces", listAssignableWorkplacesController);

  router.get("/users", listAdminUsersController);
  router.post("/users", createAdminUserController);
  router.patch("/users/:userId/status", setAdminUserStatusController);
  router.patch("/users/:userId/role", setAdminUserRoleController);

  router.get("/pay-periods", listPayrollPeriodsController);
  router.post("/pay-periods", createPayrollPeriodController);
  router.get("/pay-periods/:periodId", getPayrollPeriodDetailController);
  router.post("/pay-periods/:periodId/lock", lockPayrollPeriodController);
  router.post("/pay-periods/:periodId/reopen", reopenPayrollPeriodController);

  router.get("/payroll-exports", listPayrollExportBatchesController);
  router.post("/payroll-exports", createPayrollExportBatchController);
  router.get("/payroll-exports/:batchId", getPayrollExportBatchDetailController);
  router.get("/payroll-exports/:batchId/csv", downloadPayrollExportBatchCsvController);
  router.post("/payroll-exports/:batchId/reopen", reopenPayrollExportBatchController);
  router.post("/payroll-exports/:batchId/reissue", reissuePayrollExportBatchController);

  // Timesheets — export must be registered before the :shiftId param route
  router.get("/timesheets/export/csv", exportTimesheetsCsvController);
  router.get("/timesheets/summary/payroll", payrollSummaryController);
  router.get("/timesheets", listTimesheetsController);
  router.patch("/timesheets/:shiftId/resolve", resolveTimesheetController);
  router.get("/timesheets/:shiftId", getTimesheetDetailController);

  return router;
}
