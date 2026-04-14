import {
  createAdminPayrollExportBatch,
  buildTimesheetsCsv,
  getAdminPayrollExportBatchDetail,
  getAdminPayrollExportBatchCsv,
  getAdminPayrollSummary,
  getAdminTimesheetDetail,
  listAdminPayrollExportBatches,
  listAdminTimesheets,
  parseTimesheetFilters,
  reopenAdminPayrollExportBatch,
  reissueAdminPayrollExportBatch,
  resolveAdminTimesheet,
} from "../services/adminTimesheetService.js";
import { toHttpError } from "../utils/errors.js";

export async function listTimesheetsController(req, res) {
  try {
    console.info("[admin.timesheets] endpoint hit", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
    });
    const filters = parseTimesheetFilters(req.query);
    const result = await listAdminTimesheets(filters);
    console.info("[admin.timesheets] success", {
      adminUserId: req.user?.id || null,
      filters,
      rowCount: result?.timesheets?.length || 0,
    });
    res.json(result);
  } catch (error) {
    console.error("[admin.timesheets] failed", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function getTimesheetDetailController(req, res) {
  try {
    const detail = await getAdminTimesheetDetail(req.params.shiftId);
    console.info("[admin.timesheets.detail] success", {
      adminUserId: req.user?.id || null,
      shiftId: req.params.shiftId,
    });
    res.json({ timesheet: detail });
  } catch (error) {
    console.error("[admin.timesheets.detail] failed", {
      adminUserId: req.user?.id || null,
      shiftId: req.params.shiftId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function exportTimesheetsCsvController(req, res) {
  try {
    console.info("[admin.timesheets.csv] endpoint hit", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
    });
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildTimesheetsCsv(filters);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="timesheets-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[admin.timesheets.csv] failed", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function payrollSummaryController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const summary = await getAdminPayrollSummary(filters);
    res.json({ summary });
  } catch (error) {
    console.error("[admin.timesheets.payroll] failed", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function listPayrollExportBatchesController(req, res) {
  try {
    const rawLimit = Number(req.query?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;
    const batches = await listAdminPayrollExportBatches(limit);
    res.json({ batches });
  } catch (error) {
    console.error("[admin.payroll-exports.list] failed", {
      adminUserId: req.user?.id || null,
      query: req.query || {},
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function getPayrollExportBatchDetailController(req, res) {
  try {
    const batch = await getAdminPayrollExportBatchDetail(req.params.batchId);
    res.json({ batch });
  } catch (error) {
    console.error("[admin.payroll-exports.detail] failed", {
      adminUserId: req.user?.id || null,
      batchId: req.params.batchId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function createPayrollExportBatchController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.body?.filters || {});
    const batch = await createAdminPayrollExportBatch(filters, req.user);
    res.status(201).json({ batch });
  } catch (error) {
    console.error("[admin.payroll-exports.create] failed", {
      adminUserId: req.user?.id || null,
      body: {
        filters: req.body?.filters || {},
      },
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function reopenPayrollExportBatchController(req, res) {
  try {
    const batch = await reopenAdminPayrollExportBatch(req.params.batchId, req.body || {}, req.user);
    res.json({ batch });
  } catch (error) {
    console.error("[admin.payroll-exports.reopen] failed", {
      adminUserId: req.user?.id || null,
      batchId: req.params.batchId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function reissuePayrollExportBatchController(req, res) {
  try {
    const batch = await reissueAdminPayrollExportBatch(req.params.batchId, req.user);
    res.status(201).json({ batch });
  } catch (error) {
    console.error("[admin.payroll-exports.reissue] failed", {
      adminUserId: req.user?.id || null,
      batchId: req.params.batchId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function downloadPayrollExportBatchCsvController(req, res) {
  try {
    const batch = await getAdminPayrollExportBatchCsv(req.params.batchId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${batch.fileName}"`);
    res.send(batch.csvContent);
  } catch (error) {
    console.error("[admin.payroll-exports.csv] failed", {
      adminUserId: req.user?.id || null,
      batchId: req.params.batchId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function resolveTimesheetController(req, res) {
  try {
    console.info("[admin.timesheets.resolve] endpoint hit", {
      adminUserId: req.user?.id || null,
      shiftId: req.params.shiftId,
      body: {
        reviewStatus: req.body?.reviewStatus || null,
        payrollStatus: req.body?.payrollStatus || null,
        hasReviewNote: Boolean(req.body?.reviewNote),
        hasCloseOpenShiftAt: Boolean(req.body?.closeOpenShiftAt),
        hasCloseActiveBreakAt: Boolean(req.body?.closeActiveBreakAt),
        hasPayableHours:
          req.body?.payableHours !== undefined && req.body?.payableHours !== null && req.body?.payableHours !== "",
      },
    });

    const detail = await resolveAdminTimesheet(req.params.shiftId, req.body || {}, req.user);
    console.info("[admin.timesheets.resolve] success", {
      adminUserId: req.user?.id || null,
      shiftId: req.params.shiftId,
      reviewStatus: detail?.reviewStatus || null,
    });
    res.json({ timesheet: detail });
  } catch (error) {
    console.error("[admin.timesheets.resolve] failed", {
      adminUserId: req.user?.id || null,
      shiftId: req.params.shiftId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
