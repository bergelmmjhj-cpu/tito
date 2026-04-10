export function nowIso() {
  return new Date().toISOString();
}

export function minutesBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}
