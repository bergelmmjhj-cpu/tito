export function nowIso() {
  return new Date().toISOString();
}

function getResolvedRuntimeTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getDefaultBusinessTimeZone() {
  const configured = String(process.env.BUSINESS_DEFAULT_TIME_ZONE || "").trim();
  if (isValidTimeZone(configured)) return configured;

  const runtime = getResolvedRuntimeTimeZone();
  return isValidTimeZone(runtime) ? runtime : "UTC";
}

export function resolveBusinessTimeZone(value) {
  return isValidTimeZone(value) ? value.trim() : getDefaultBusinessTimeZone();
}

export function formatBusinessDate(value, timeZone) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveBusinessTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function minutesBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}
