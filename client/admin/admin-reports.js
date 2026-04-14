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
    const csv = await apiFetch(`/api/admin/timesheets/export/csv?${p}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `attendance-${today}.csv`);
    setMsg(msgEl, "Daily attendance report downloaded.", "success");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function downloadPayrollExport() {
  const msgEl = document.getElementById("rptMsg");
  setMsg(msgEl, "Creating payroll export...", "info");
  const { dateFrom, dateTo } = getReportDateRange();
  const filters = {};
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo)   filters.dateTo   = dateTo;
  filters.payrollStatus = "approved";
  try {
    const data = await apiFetch("/api/admin/payroll-exports", {
      method: "POST",
      body: JSON.stringify({ filters }),
    });
    const batch = data?.batch;
    if (!batch?.id) throw new Error("Payroll export failed — no batch ID returned.");
    const csv = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batch.id)}/csv`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, batch.fileName || `payroll-${new Date().toISOString().slice(0,10)}.csv`);
    setMsg(msgEl, `Payroll export ${batch.id.slice(0,8)} created and downloaded.`, "success");
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
    const csv = await apiFetch(`/api/admin/timesheets/export/csv?${p}`, { headers: { Accept: "text/csv" } });
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
    const csv = await apiFetch(`/api/admin/timesheets/export/csv?${p}`, { headers: { Accept: "text/csv" } });
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
