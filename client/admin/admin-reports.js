/* ── Admin Reports ───────────────────────────────────────────────────────── */

function getReportDateRange() {
  return {
    dateFrom: document.getElementById("rptDateFrom")?.value || "",
    dateTo:   document.getElementById("rptDateTo")?.value   || "",
  };
}

async function downloadDailyAttendance() {
  const msgEl = document.getElementById("rptMsg");
  setMsg(msgEl, "Generating daily attendance report...", "info");
  const { dateFrom, dateTo } = getReportDateRange();
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo)   p.set("dateTo",   dateTo);
  const today = new Date().toISOString().slice(0, 10);
  if (!dateFrom && !dateTo) { p.set("dateFrom", today); p.set("dateTo", today); }
  try {
    const csv = await apiFetch(`/api/admin/reports/daily-attendance.csv?${p}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `attendance-${today}.csv`);
    setMsg(msgEl, "Daily attendance report downloaded.", "success");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function downloadPayrollExport() {
  const msgEl = document.getElementById("rptMsg");
  setMsg(msgEl, "Generating payroll cutoff export...", "info");
  const { dateFrom, dateTo } = getReportDateRange();
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo)   p.set("dateTo", dateTo);
  try {
    const csv = await apiFetch(`/api/admin/reports/payroll-cutoff.csv?${p}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `payroll-cutoff-${new Date().toISOString().slice(0,10)}.csv`);
    setMsg(msgEl, "Payroll cutoff report downloaded.", "success");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function downloadWorkerHours() {
  const msgEl = document.getElementById("rptMsg");
  setMsg(msgEl, "Generating worker hours summary...", "info");
  const { dateFrom, dateTo } = getReportDateRange();
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo)   p.set("dateTo",   dateTo);
  try {
    const csv = await apiFetch(`/api/admin/reports/worker-hours.csv?${p}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `worker-hours-${new Date().toISOString().slice(0,10)}.csv`);
    setMsg(msgEl, "Worker hours report downloaded.", "success");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function downloadHotelHours() {
  const msgEl = document.getElementById("rptMsg");
  setMsg(msgEl, "Generating hotel hours summary...", "info");
  const { dateFrom, dateTo } = getReportDateRange();
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo)   p.set("dateTo",   dateTo);
  try {
    const csv = await apiFetch(`/api/admin/reports/hotel-hours.csv?${p}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `hotel-hours-${new Date().toISOString().slice(0,10)}.csv`);
    setMsg(msgEl, "Hotel hours report downloaded.", "success");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

function initReportsTab() {
  document.getElementById("rptDailyBtn")?.addEventListener("click",   downloadDailyAttendance);
  document.getElementById("rptPayrollBtn")?.addEventListener("click", downloadPayrollExport);
  document.getElementById("rptWorkerBtn")?.addEventListener("click",  downloadWorkerHours);
  document.getElementById("rptHotelBtn")?.addEventListener("click",   downloadHotelHours);
}
