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

  if (rawMessage.includes("invalid input syntax") || rawMessage.includes("malformed")) {
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

  return new HttpError(500, "Server could not process this request. Please try again.");
}
