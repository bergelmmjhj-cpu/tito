import {
  buildDailyAttendanceCsv,
  buildHotelHoursSummaryCsv,
  buildPayrollCutoffCsv,
  createAdminPayrollPeriod,
  createAdminPayrollExportBatch,
  buildWorkerHoursSummaryCsv,
  buildTimesheetsCsv,
  getAdminPayrollPeriodDetail,
  getAdminPayrollExportBatchDetail,
  getAdminPayrollExportBatchCsv,
  getAdminPayrollSummary,
  getAdminTimesheetDetail,
  listAdminPayrollPeriods,
  listAdminPayrollExportBatches,
  listAdminTimesheets,
  lockAdminPayrollPeriod,
  parsePayrollPeriodPayload,
  parseTimesheetFilters,
  reopenAdminPayrollPeriod,
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

export async function exportDailyAttendanceCsvController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildDailyAttendanceCsv(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="daily-attendance-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[admin.reports.daily-attendance] failed", {
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

export async function exportPayrollCutoffCsvController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildPayrollCutoffCsv(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-cutoff-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[admin.reports.payroll-cutoff] failed", {
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

export async function exportWorkerHoursSummaryCsvController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildWorkerHoursSummaryCsv(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="worker-hours-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[admin.reports.worker-hours] failed", {
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

export async function exportHotelHoursSummaryCsvController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildHotelHoursSummaryCsv(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hotel-hours-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[admin.reports.hotel-hours] failed", {
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

export async function listPayrollPeriodsController(req, res) {
  try {
    const rawLimit = Number(req.query?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 12;
    const periods = await listAdminPayrollPeriods(limit);
    res.json({ periods });
  } catch (error) {
    console.error("[admin.pay-periods.list] failed", {
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

export async function getPayrollPeriodDetailController(req, res) {
  try {
    const period = await getAdminPayrollPeriodDetail(req.params.periodId);
    res.json({ period });
  } catch (error) {
    console.error("[admin.pay-periods.detail] failed", {
      adminUserId: req.user?.id || null,
      periodId: req.params.periodId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function createPayrollPeriodController(req, res) {
  try {
    const payload = parsePayrollPeriodPayload(req.body || {});
    const period = await createAdminPayrollPeriod(payload, req.user);
    res.status(201).json({ period });
  } catch (error) {
    console.error("[admin.pay-periods.create] failed", {
      adminUserId: req.user?.id || null,
      body: req.body || {},
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function lockPayrollPeriodController(req, res) {
  try {
    const period = await lockAdminPayrollPeriod(req.params.periodId, req.user);
    res.json({ period });
  } catch (error) {
    console.error("[admin.pay-periods.lock] failed", {
      adminUserId: req.user?.id || null,
      periodId: req.params.periodId,
      message: error?.message || "unknown_error",
      name: error?.name || "Error",
      stack: error?.stack || "no_stack",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function reopenPayrollPeriodController(req, res) {
  try {
    const period = await reopenAdminPayrollPeriod(req.params.periodId, req.user);
    res.json({ period });
  } catch (error) {
    console.error("[admin.pay-periods.reopen] failed", {
      adminUserId: req.user?.id || null,
      periodId: req.params.periodId,
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
