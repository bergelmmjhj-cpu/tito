/* ── Admin Timesheets ─────────────────────────────────────────────────────── */

let tsFilters = {};
let tsPage    = 1;

function buildTsQs(filters, page) {
  const p = new URLSearchParams();
  if (filters.dateFrom)     p.set("dateFrom",     filters.dateFrom);
  if (filters.dateTo)       p.set("dateTo",       filters.dateTo);
  if (filters.search)       p.set("search",       filters.search);
  if (filters.workplaceId)  p.set("workplaceId",  filters.workplaceId);
  if (filters.status)       p.set("status",       filters.status);
  if (filters.payrollStatus)p.set("payrollStatus",filters.payrollStatus);
  if (page > 1)             p.set("page",         page);
  return p.toString();
}

function readTsFilters() {
  return {
    dateFrom:      document.getElementById("tsDateFrom")?.value     || "",
    dateTo:        document.getElementById("tsDateTo")?.value       || "",
    search:        document.getElementById("tsSearch")?.value.trim()|| "",
    workplaceId:   document.getElementById("tsWorkplace")?.value    || "",
    status:        document.getElementById("tsStatus")?.value       || "",
    payrollStatus: document.getElementById("tsPayroll")?.value      || "",
  };
}

function tsStatusBadge(status) {
  if (status === "open_shift")       return `<span class="badge badge-open">Open Shift</span>`;
  if (status === "missing_break_end")return `<span class="badge badge-review">Missing Break End</span>`;
  if (status === "completed")        return `<span class="badge badge-done">Completed</span>`;
  return `<span class="badge">${esc(status || "—")}</span>`;
}

function tsPayrollBadge(status) {
  if (status === "approved") return `<span class="badge badge-approved">Approved</span>`;
  if (status === "exported") return `<span class="badge badge-done">Exported</span>`;
  return `<span class="badge">${esc(status || "pending")}</span>`;
}

async function loadTimesheets(filters, page) {
  const bodyEl = document.getElementById("tsBody");
  const msgEl  = document.getElementById("tsMsg");
  tsFilters = filters || {};
  tsPage    = page    || 1;

  if (bodyEl) bodyEl.innerHTML = `<tr class="loading-row"><td colspan="10">Loading shifts...</td></tr>`;
  setMsg(msgEl, "", "info");

  try {
    const qs = buildTsQs(tsFilters, tsPage);
    const data = await apiFetch(`/api/admin/timesheets${qs ? "?" + qs : ""}`);
    renderTimesheetRows(data?.timesheets || [], bodyEl);
    renderTsPagination(data?.pagination);
  } catch (err) {
    setMsg(msgEl, err.message, "error");
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="10" class="muted" style="padding:20px;text-align:center">Failed to load.</td></tr>`;
  }
}

function renderTimesheetRows(rows, bodyEl) {
  if (!bodyEl) return;
  if (!rows.length) {
    bodyEl.innerHTML = `<tr><td colspan="10" class="muted" style="padding:20px;text-align:center">No shifts found.</td></tr>`;
    return;
  }
  bodyEl.innerHTML = rows.map((ts) => `
    <tr class="ts-row" data-shiftid="${esc(ts.shiftId)}" style="cursor:pointer">
      <td>${esc(ts.workerName)}</td>
      <td>${esc(ts.date || "—")}</td>
      <td>${esc(ts.workplaceName || "—")}</td>
      <td>${fmt(ts.clockInAt)}</td>
      <td>${fmt(ts.clockOutAt)}</td>
      <td>${fmtHours(ts.actualHours)}</td>
      <td>${tsStatusBadge(ts.status)}</td>
      <td>${tsPayrollBadge(ts.payrollStatus)}</td>
      <td>${ts.hasException || ts.reviewPending ? `<span class="text-danger">⚠ Review needed</span>` : "—"}</td>
      <td>${esc(ts.reviewNote || "—")}</td>
    </tr>`).join("");
}

function renderTsPagination(pagination) {
  const pagEl = document.getElementById("tsPagination");
  if (!pagEl || !pagination) { if (pagEl) pagEl.innerHTML = ""; return; }
  const { total, page, limit, totalPages } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);
  pagEl.innerHTML = `
    <div class="pagination">
      <button class="btn-ghost" id="tsPrev" ${page <= 1 ? "disabled" : ""}>← Previous</button>
      <span>Showing ${from}–${to} of ${total}</span>
      <button class="btn-ghost" id="tsNext" ${page >= totalPages ? "disabled" : ""}>Next →</button>
    </div>`;
  document.getElementById("tsPrev")?.addEventListener("click", () => loadTimesheets(tsFilters, tsPage - 1));
  document.getElementById("tsNext")?.addEventListener("click", () => loadTimesheets(tsFilters, tsPage + 1));
}

/* ── Timesheet Detail ────────────────────────────────────────────────────── */
async function openTimesheetDetail(shiftId) {
  const panelEl = document.getElementById("tsDetailPanel");
  const contentEl = document.getElementById("tsDetailContent");
  const msgEl  = document.getElementById("tsDetailMsg");

  if (!panelEl) return;
  panelEl.classList.remove("hidden");
  if (contentEl) contentEl.innerHTML = "<p class='muted'>Loading shift details...</p>";
  setMsg(msgEl, "", "info");
  panelEl.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}`);
    renderTimesheetDetail(data.timesheet, contentEl);
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

function field(label, value) {
  return `<div class="detail-item">
    <div class="label">${esc(label)}</div>
    <div class="value">${value ?? "—"}</div>
  </div>`;
}

function renderTimesheetDetail(ts, contentEl) {
  if (!ts || !contentEl) return;

  const geofenceText = ts.withinGeofence === true ? "✓ Within radius" : ts.withinGeofence === false ? "⚠ Outside radius" : "—";
  const distText = typeof ts.distanceMeters === "number" ? `${ts.distanceMeters.toFixed(0)} m` : "—";
  const closingFields = !ts.clockOutAt ? `
    <div style="margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px;color:var(--muted)">
        <input type="checkbox" name="closeOpenShift" /> Close this open shift
      </label>
      <label>Close Shift At<input name="closeOpenShiftAt" type="datetime-local" /></label>
    </div>` : "";

  const activeBreakField = ts.hasActiveBreak ? `
    <div style="margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px;color:var(--muted)">
        <input type="checkbox" name="closeActiveBreak" /> End active break
      </label>
      <label>End Break At<input name="closeActiveBreakAt" type="datetime-local" /></label>
    </div>` : "";

  contentEl.innerHTML = `
    <div class="detail-grid">
      ${field("Worker",       esc(ts.workerName))}
      ${field("Staff ID",     esc(ts.workerStaffId || "—"))}
      ${field("Date",         esc(ts.date || "—"))}
      ${field("Hotel",        esc(ts.workplaceName || "—"))}
      ${field("Clock In",     fmt(ts.clockInAt))}
      ${field("Clock Out",    fmt(ts.clockOutAt))}
      ${field("Hours",        fmtHours(ts.actualHours))}
      ${field("Payable Hrs",  fmtHours(ts.payableHours))}
      ${field("Status",       tsStatusBadge(ts.status))}
      ${field("Payroll",      tsPayrollBadge(ts.payrollStatus))}
      ${field("Geofence",     geofenceText)}
      ${field("Distance",     distText)}
      ${field("Location",     ts.locationSummary || "—")}
      ${field("Review Note",  esc(ts.reviewNote || "—"))}
    </div>

    <hr class="section-divider" />
    <h3 style="margin-bottom:12px">Resolution</h3>
    <form id="tsResolveForm" data-shiftid="${esc(ts.shiftId)}" class="resolution-form">
      <div class="form-grid-2">
        <label>Review Status
          <select name="reviewStatus">
            <option value="reviewed" ${ts.reviewStatus === "reviewed" ? "selected" : ""}>Reviewed — All clear</option>
            <option value="follow_up_required" ${ts.reviewStatus === "follow_up_required" ? "selected" : ""}>Follow-up required</option>
          </select>
        </label>
        <label>Payroll Status
          <select name="payrollStatus">
            <option value="pending"  ${ts.payrollStatus === "pending"  ? "selected" : ""}>Pending</option>
            <option value="approved" ${ts.payrollStatus === "approved" ? "selected" : ""}>Approved for payroll</option>
            ${ts.payrollStatus === "exported" ? '<option value="exported" selected disabled>Exported (locked)</option>' : ""}
          </select>
        </label>
      </div>
      <label>Override Payable Hours (leave empty to keep current)
        <input name="payableHours" type="number" step="0.25" min="0" max="48" placeholder="Current: ${fmtHours(ts.payableHours)}" />
      </label>
      ${closingFields}
      ${activeBreakField}
      <label>Manager Note (required)
        <textarea name="reviewNote" required maxlength="1000" placeholder="Explain what was reviewed or changed...">${esc(ts.reviewNote || "")}</textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn">Save Resolution</button>
      </div>
    </form>`;

  contentEl.querySelector("#tsResolveForm")?.addEventListener("submit", submitTsResolution);
}

async function submitTsResolution(event) {
  event.preventDefault();
  const form = event.target;
  const shiftId = form.dataset.shiftid;
  const msgEl = document.getElementById("tsDetailMsg");
  setMsg(msgEl, "Saving...", "info");

  const fd = new FormData(form);
  const payload = {
    reviewStatus:  fd.get("reviewStatus") || undefined,
    payrollStatus: (fd.get("payrollStatus") !== "exported") ? (fd.get("payrollStatus") || undefined) : undefined,
    reviewNote:    fd.get("reviewNote")    || undefined,
  };
  if (fd.get("closeOpenShift")  === "on") payload.closeOpenShiftAt  = fd.get("closeOpenShiftAt")  || null;
  if (fd.get("closeActiveBreak")=== "on") payload.closeActiveBreakAt= fd.get("closeActiveBreakAt")|| null;
  const ph = fd.get("payableHours");
  if (ph) payload.payableHours = Number(ph);

  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setMsg(msgEl, "Resolution saved.", "success");
    renderTimesheetDetail(data.timesheet, document.getElementById("tsDetailContent"));
    loadTimesheets(tsFilters, tsPage);
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

/* ── Payroll Export ──────────────────────────────────────────────────────── */
async function createPayrollExport() {
  const msgEl = document.getElementById("payrollMsg");
  setMsg(msgEl, "Creating payroll export...", "info");

  try {
    const data = await apiFetch("/api/admin/payroll-exports", {
      method: "POST",
      body: JSON.stringify({ filters: tsFilters }),
    });
    const batch = data?.batch;
    if (!batch?.id) throw new Error("Export created but no batch ID returned.");
    setMsg(msgEl, `Payroll export ${batch.id.slice(0, 8)} created.`, "success");
    if (batch.csvContent || batch.id) {
      const csv = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batch.id)}/csv`, { headers: { Accept: "text/csv" } });
      triggerCsvDownload(csv, batch.fileName || `payroll-${new Date().toISOString().slice(0,10)}.csv`);
    }
    loadPayrollExports();
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function loadPayrollExports() {
  const listEl = document.getElementById("payrollExportList");
  if (!listEl) return;
  try {
    const data = await apiFetch("/api/admin/payroll-exports?limit=8");
    const batches = data?.batches || [];
    if (!batches.length) { listEl.innerHTML = `<p class="muted">No payroll exports yet.</p>`; return; }
    listEl.innerHTML = batches.map((b) => `
      <div class="export-item">
        <div>
          <div class="export-title">Batch ${b.id ? b.id.slice(0,8) : "—"}</div>
          <div class="export-meta">${fmt(b.createdAt)} · ${b.shiftCount ?? 0} shifts · ${fmtHours(b.totalPayableHours)} hrs</div>
          <div class="export-meta">${esc(b.fileName || "—")} · Status: ${esc(b.status || "active")}</div>
        </div>
        <div class="export-actions">
          <button class="btn-sm" data-act="download-batch" data-id="${esc(b.id)}" data-file="${esc(b.fileName || 'payroll.csv')}">Download CSV</button>
        </div>
      </div>`).join("");
  } catch {}
}

/* ── CSV Export ──────────────────────────────────────────────────────────── */
async function exportCsv() {
  const msgEl = document.getElementById("tsMsg");
  try {
    const qs = buildTsQs(tsFilters, 1);
    const csv = await apiFetch(`/api/admin/timesheets/export/csv${qs ? "?" + qs : ""}`, { headers: { Accept: "text/csv" } });
    triggerCsvDownload(csv, `timesheets-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

/* ── Workplace filter population ─────────────────────────────────────────── */
async function populateTsWorkplaceFilter() {
  const sel = document.getElementById("tsWorkplace");
  if (!sel) return;
  try {
    const data = await apiFetch("/api/admin/assignable-workplaces");
    (data?.workplaces || []).forEach((wp) => {
      const opt = document.createElement("option");
      opt.value = wp.id;
      opt.textContent = wp.name;
      sel.appendChild(opt);
    });
  } catch {}
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function initTimesheetsTab() {
  document.getElementById("tsApplyBtn")?.addEventListener("click", () => loadTimesheets(readTsFilters(), 1));
  document.getElementById("tsClearBtn")?.addEventListener("click", () => {
    document.getElementById("tsDateFrom").value = "";
    document.getElementById("tsDateTo").value = "";
    document.getElementById("tsSearch").value = "";
    if (document.getElementById("tsWorkplace")) document.getElementById("tsWorkplace").value = "";
    if (document.getElementById("tsStatus"))    document.getElementById("tsStatus").value    = "";
    if (document.getElementById("tsPayroll"))   document.getElementById("tsPayroll").value   = "";
    loadTimesheets({}, 1);
  });
  document.getElementById("tsRefreshBtn")?.addEventListener("click", () => loadTimesheets(tsFilters, tsPage));
  document.getElementById("tsExportCsvBtn")?.addEventListener("click", exportCsv);
  document.getElementById("createPayrollExportBtn")?.addEventListener("click", createPayrollExport);

  document.getElementById("tsBody")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr.ts-row[data-shiftid]");
    if (row) openTimesheetDetail(row.dataset.shiftid);
  });

  document.getElementById("closeDetailBtn")?.addEventListener("click", () => {
    document.getElementById("tsDetailPanel")?.classList.add("hidden");
  });

  document.getElementById("payrollExportList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "download-batch") {
      apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(btn.dataset.id)}/csv`, { headers: { Accept: "text/csv" } })
        .then((csv) => triggerCsvDownload(csv, btn.dataset.file))
        .catch((err) => setMsg(document.getElementById("payrollMsg"), err.message, "error"));
    }
  });

  populateTsWorkplaceFilter();
  loadTimesheets({}, 1);
  loadPayrollExports();
}
