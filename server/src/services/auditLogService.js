import { listAuditLogEntries } from "../models/auditLogModel.js";

export function parseAuditLogFilters(query = {}) {
  return {
    userId: typeof query.userId === "string" && query.userId.trim() ? query.userId.trim() : null,
    action: typeof query.action === "string" && query.action.trim() ? query.action.trim() : null,
    limit: query.limit,
  };
}

export async function getAuditLogs(filters = {}) {
  return listAuditLogEntries(filters);
}
