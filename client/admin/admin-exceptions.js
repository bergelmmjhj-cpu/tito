/* ── Shifts That Need Review (Exceptions) ────────────────────────────────── */

let exFilters = {};
let exPage    = 1;

const EXCEPTION_STATUSES = [
  { value: "open_shift",       label: "Missing Clock Out" },
  { value: "missing_break_end",label: "Missing Break End" },
  { value: "duplicate_shift",  label: "Duplicate Shift" },
  { value: "suspicious_short_shift", label: "Suspicious Short Shift" },
  { value: "over_16_hours",    label: "Over 16 Hours" },
  { value: "outside_geofence", label: "Outside Hotel Area" },
  { value: "no_location",      label: "No Location Recorded" },
  { value: "workplace_unresolved", label: "Hotel Undetected" },
];

function readExFilters() {
  return {
    dateFrom: document.getElementById("exDateFrom")?.value || "",
    dateTo:   document.getElementById("exDateTo")?.value   || "",
    search:   document.getElementById("exSearch")?.value.trim() || "",
    status:   document.getElementById("exStatus")?.value  || "",
  };
}

function exBuildQs(filters, page) {
  const p = new URLSearchParams();
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
  if (filters.dateTo)   p.set("dateTo",   filters.dateTo);
  if (filters.search)   p.set("search",   filters.search);
  if (filters.status)   p.set("status",   filters.status);
  // Always show shifts that need review
  if (!filters.status)  p.set("reviewPending", "true");
  if (page > 1)         p.set("page", page);
  return p.toString();
}

function exStatusLabel(ts) {
  if (ts.duplicateShift)                 return `<span class="badge badge-review">Duplicate Shift</span>`;
  if (ts.suspiciousShortShift)           return `<span class="badge badge-review">Suspicious Short Shift</span>`;
  if (ts.overlongShift)                  return `<span class="badge badge-review">Over 16 Hours</span>`;
  if (ts.status === "open_shift")        return `<span class="badge badge-open">Missing Clock Out</span>`;
  if (ts.status === "missing_break_end") return `<span class="badge badge-review">Missing Break End</span>`;
  if (ts.outsideGeofence)                return `<span class="badge badge-review">Outside Hotel Area</span>`;
  if (ts.unresolvedWorkplace)            return `<span class="badge badge-review">Hotel Not Detected</span>`;
  if (ts.noLocation)                     return `<span class="badge badge-review">No Location</span>`;
  if (ts.reviewPending)                  return `<span class="badge badge-review">Needs Review</span>`;
  return `<span class="badge">${esc(ts.status || "—")}</span>`;
}

async function loadExceptions(filters, page) {
  const bodyEl = document.getElementById("exBody");
  const msgEl  = document.getElementById("exMsg");
  exFilters = filters || {};
  exPage    = page    || 1;

  if (bodyEl) bodyEl.innerHTML = `<tr class="loading-row"><td colspan="8">Loading shifts that need review...</td></tr>`;
  setMsg(msgEl, "", "info");

  try {
    const qs = exBuildQs(exFilters, exPage);
    const data = await apiFetch(`/api/admin/timesheets${qs ? "?" + qs : ""}`);
    const all = data?.timesheets || [];

    // Client-side filter to things that genuinely need review
    const exceptions = all.filter((ts) =>
      ts.reviewPending ||
      ts.status === "open_shift" ||
      ts.status === "missing_break_end" ||
      ts.duplicateShift ||
      ts.suspiciousShortShift ||
      ts.overlongShift ||
      ts.outsideGeofence ||
      ts.unresolvedWorkplace ||
      ts.noLocation
    );

    renderExceptionRows(exceptions, bodyEl);
    renderExPagination(data?.pagination);

    const countEl = document.getElementById("exCount");
    if (countEl) countEl.textContent = `${exceptions.length} shifts need attention`;
  } catch (err) {
    setMsg(msgEl, err.message, "error");
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="8" class="muted" style="padding:20px;text-align:center">Failed to load.</td></tr>`;
  }
}

function renderExceptionRows(rows, bodyEl) {
  if (!bodyEl) return;
  if (!rows.length) {
    bodyEl.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--success)">✓ No shifts need review right now.</td></tr>`;
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
      <td>${exStatusLabel(ts)}</td>
      <td>
        <button class="btn-sm" data-act="open" data-id="${esc(ts.shiftId)}">Review</button>
      </td>
    </tr>`).join("");
}

function renderExPagination(pagination) {
  const pagEl = document.getElementById("exPagination");
  if (!pagEl || !pagination) { if (pagEl) pagEl.innerHTML = ""; return; }
  const { total, page, limit, totalPages } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);
  pagEl.innerHTML = `
    <div class="pagination">
      <button class="btn-ghost" id="exPrev" ${page <= 1 ? "disabled" : ""}>← Previous</button>
      <span>${from}–${to} of ${total}</span>
      <button class="btn-ghost" id="exNext" ${page >= totalPages ? "disabled" : ""}>Next →</button>
    </div>`;
  document.getElementById("exPrev")?.addEventListener("click", () => loadExceptions(exFilters, exPage - 1));
  document.getElementById("exNext")?.addEventListener("click", () => loadExceptions(exFilters, exPage + 1));
}

/* ── Exception detail panel ──────────────────────────────────────────────── */
async function openExDetail(shiftId) {
  const panelEl   = document.getElementById("exDetailPanel");
  const contentEl = document.getElementById("exDetailContent");
  const msgEl     = document.getElementById("exDetailMsg");

  if (!panelEl) return;
  panelEl.classList.remove("hidden");
  if (contentEl) contentEl.innerHTML = "<p class='muted'>Loading...</p>";
  setMsg(msgEl, "", "info");
  panelEl.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}`);
    renderExDetail(data.timesheet, contentEl);
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

function renderExDetail(ts, contentEl) {
  if (!ts || !contentEl) return;

  const closingFields = !ts.clockOutAt ? `
    <div style="margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="closeOpenShift" /> Close this open shift
      </label>
      <label>Close Shift At<input name="closeOpenShiftAt" type="datetime-local" /></label>
    </div>` : "";
  const breakField = ts.hasActiveBreak ? `
    <div style="margin-top:10px">
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="closeActiveBreak" /> End active break
      </label>
      <label>End Break At<input name="closeActiveBreakAt" type="datetime-local" /></label>
    </div>` : "";

  contentEl.innerHTML = `
    <div class="detail-grid">
      ${field("Worker",    esc(ts.workerName))}
      ${field("Date",      esc(ts.date || "—"))}
      ${field("Hotel",     esc(ts.workplaceName || "—"))}
      ${field("Clock In",  fmt(ts.clockInAt))}
      ${field("Clock Out", fmt(ts.clockOutAt))}
      ${field("Hours",     fmtHours(ts.actualHours))}
      ${field("Issue",     exStatusLabel(ts))}
      ${field("Location",  ts.locationSummary || "—")}
      ${field("Distance",  typeof ts.distanceMeters === "number" ? `${ts.distanceMeters.toFixed(0)} m` : "—")}
    </div>

    <form id="exResolveForm" data-shiftid="${esc(ts.shiftId)}" class="resolution-form" style="margin-top:16px">
      <div class="form-grid-2">
        <label>Action
          <select name="reviewStatus">
            <option value="reviewed">Approve Shift</option>
            <option value="follow_up_required">Reject (Needs Follow-up)</option>
          </select>
        </label>
        <label>Payroll
          <select name="payrollStatus">
            <option value="pending">Keep Pending</option>
            <option value="approved">Approve for Payroll</option>
          </select>
        </label>
      </div>
      <label>Fix Payable Hours (optional)
        <input name="payableHours" type="number" step="0.25" min="0" max="48" placeholder="Example: 7.50" />
      </label>
      ${closingFields}
      ${breakField}
      <label>Manager Note (required)
        <textarea name="reviewNote" required maxlength="1000" placeholder="Describe what you reviewed or changed."></textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="btn">Save Decision</button>
      </div>
    </form>`;

  contentEl.querySelector("#exResolveForm")?.addEventListener("submit", submitExResolution);
}

async function submitExResolution(event) {
  event.preventDefault();
  const form    = event.target;
  const shiftId = form.dataset.shiftid;
  const msgEl   = document.getElementById("exDetailMsg");
  setMsg(msgEl, "Saving...", "info");

  const fd = new FormData(form);
  const payload = {
    reviewStatus:  fd.get("reviewStatus") || undefined,
    payrollStatus: fd.get("payrollStatus") || undefined,
    reviewNote:    fd.get("reviewNote")    || undefined,
    payableHours:  fd.get("payableHours")  || undefined,
  };
  if (fd.get("closeOpenShift")   === "on") payload.closeOpenShiftAt   = fd.get("closeOpenShiftAt")  || null;
  if (fd.get("closeActiveBreak") === "on") payload.closeActiveBreakAt = fd.get("closeActiveBreakAt")|| null;

  try {
    await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setMsg(msgEl, "Exception resolved.", "success");
    document.getElementById("exDetailPanel")?.classList.add("hidden");
    loadExceptions(exFilters, exPage);
    loadDashboard();
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function initExceptionsTab() {
  document.getElementById("exApplyBtn")?.addEventListener("click", () => loadExceptions(readExFilters(), 1));
  document.getElementById("exClearBtn")?.addEventListener("click", () => {
    ["exDateFrom","exDateTo","exSearch","exStatus"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    loadExceptions({}, 1);
  });
  document.getElementById("exRefreshBtn")?.addEventListener("click", () => loadExceptions(exFilters, exPage));
  document.getElementById("closeExDetailBtn")?.addEventListener("click", () => {
    document.getElementById("exDetailPanel")?.classList.add("hidden");
  });

  document.getElementById("exBody")?.addEventListener("click", (e) => {
    const row = e.target.closest("tr.ts-row[data-shiftid]");
    const btn = e.target.closest("button[data-act='open']");
    const id  = row?.dataset.shiftid || btn?.dataset.id;
    if (id) openExDetail(id);
  });

  loadExceptions({}, 1);
}
