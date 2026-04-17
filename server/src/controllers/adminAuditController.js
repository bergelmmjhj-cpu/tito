import { parseAuditLogFilters, getAuditLogs } from "../services/auditLogService.js";
import { toHttpError } from "../utils/errors.js";

export async function listAuditLogsController(req, res) {
  try {
    const filters = parseAuditLogFilters(req.query || {});
    const logs = await getAuditLogs(filters);
    res.json({ logs });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
