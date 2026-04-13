import {
  buildTimesheetsCsv,
  getAdminPayrollSummary,
  getAdminTimesheetDetail,
  listAdminTimesheets,
  parseTimesheetFilters,
} from "../services/adminTimesheetService.js";
import { toHttpError } from "../utils/errors.js";

export async function listTimesheetsController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const result = await listAdminTimesheets(filters);
    res.json(result);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function getTimesheetDetailController(req, res) {
  try {
    const detail = await getAdminTimesheetDetail(req.params.shiftId);
    res.json({ timesheet: detail });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function exportTimesheetsCsvController(req, res) {
  try {
    const filters = parseTimesheetFilters(req.query);
    const csv = await buildTimesheetsCsv(filters);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="timesheets-${date}.csv"`);
    res.send(csv);
  } catch (error) {
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
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
