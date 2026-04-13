export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function toHttpError(error) {
  if (error instanceof HttpError) return error;

  const rawMessage = String(error?.message || "").toLowerCase();
  const errorCode = error?.code ? String(error.code) : "";

  // JSON / data format errors
  if (
    error instanceof SyntaxError ||
    rawMessage.includes("unexpected token") ||
    rawMessage.includes("json at position") ||
    rawMessage.includes("invalid input syntax") ||
    rawMessage.includes("malformed")
  ) {
    return new HttpError(400, "Invalid data format received. Refresh and try again.");
  }

  if (rawMessage.includes("null value") || rawMessage.includes("not-null constraint")) {
    return new HttpError(400, "A required value is missing for this attendance action.");
  }

  if (rawMessage.includes("foreign key") || rawMessage.includes("violates foreign key")) {
    return new HttpError(409, "Related records are missing. Please refresh and try again.");
  }

  if (rawMessage.includes("duplicate key")) {
    return new HttpError(409, "This action appears to have already been recorded.");
  }

  // Database connection / pool errors
  if (
    rawMessage.includes("econnrefused") ||
    rawMessage.includes("connection refused") ||
    rawMessage.includes("enotfound") ||
    rawMessage.includes("econnreset") ||
    rawMessage.includes("pool timeout") ||
    rawMessage.includes("connect timeout") ||
    rawMessage.includes("terminating connection") ||
    rawMessage.includes("ssl connection") ||
    rawMessage.includes("could not connect") ||
    rawMessage.includes("too many clients") ||
    errorCode === "ECONNREFUSED" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ETIMEDOUT"
  ) {
    return new HttpError(503, "Unable to reach the database. Please try again in a moment.");
  }

  // CRM unavailable
  if (rawMessage.includes("crm database is not available")) {
    return new HttpError(503, "CRM service is unavailable. Please try again.");
  }

  return new HttpError(500, "Server could not process this request. Please try again.");
}
