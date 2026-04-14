/* ── Admin Workplaces ────────────────────────────────────────────────────── */

function locationLabel(wp) {
  const parts = [wp.city, wp.state, wp.country].filter((x) => typeof x === "string" && x.trim());
  if (parts.length) return parts.join(", ");
  if (wp.address) return wp.address;
  return "—";
}

/* ── Workplaces list ─────────────────────────────────────────────────────── */
async function loadCrmWorkplaces() {
  const bodyEl = document.getElementById("workplacesBody");
  const msgEl  = document.getElementById("workplacesMsg");
  setMsg(msgEl, "Loading hotels...", "info");

  try {
    const data = await apiFetch("/api/crm/workplaces");
    const workplaces = data?.workplaces || [];

    if (!workplaces.length) {
      setMsg(msgEl, "No hotels found in CRM. Check CRM_DATABASE_URL configuration.", "error");
      if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">No hotels available.</td></tr>`;
      return;
    }

    setMsg(msgEl, "", "info");
    renderWorkplaces(workplaces, bodyEl);
    return workplaces;
  } catch (err) {
    setMsg(msgEl, `CRM unavailable: ${err.message}`, "error");
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">Hotels unavailable right now.</td></tr>`;
    return [];
  }
}

function renderWorkplaces(workplaces, bodyEl) {
  if (!bodyEl) return;
  bodyEl.innerHTML = workplaces.map((wp) => `
    <tr>
      <td>${esc(wp.name)}</td>
      <td>${esc(locationLabel(wp))}</td>
      <td>${typeof wp.latitude === "number" ? wp.latitude.toFixed(5) : "—"}, ${typeof wp.longitude === "number" ? wp.longitude.toFixed(5) : "—"}</td>
      <td>${wp.geofenceRadiusMeters ?? "—"} m</td>
      <td>${esc(wp.timeZone || "—")}</td>
      <td><span class="${wp.active !== false ? "badge badge-active" : "badge badge-inactive"}">${wp.active !== false ? "Active" : "Inactive"}</span></td>
      <td>—</td>
    </tr>`).join("");
}

/* ── Worker assignments ──────────────────────────────────────────────────── */
async function loadAssignments() {
  const assignBodyEl    = document.getElementById("assignmentsBody");
  const workerSelEl     = document.getElementById("assignWorker");
  const workplaceSelEl  = document.getElementById("assignWorkplace");
  const msgEl           = document.getElementById("assignMsg");

  try {
    const [workersData, workplacesData] = await Promise.all([
      apiFetch("/api/admin/workers"),
      apiFetch("/api/admin/assignable-workplaces"),
    ]);

    const workers    = workersData?.workers    || [];
    const workplaces = workplacesData?.workplaces || [];

    // Populate selects
    if (workerSelEl) {
      workerSelEl.innerHTML = workers.map((w) =>
        `<option value="${esc(w.id)}">${esc(w.name)} (${esc(w.staffId)})</option>`
      ).join("");
    }
    if (workplaceSelEl) {
      workplaceSelEl.innerHTML = [
        '<option value="">— Unassigned —</option>',
        ...workplaces.map((wp) => `<option value="${esc(wp.id)}">${esc(wp.name)}</option>`),
      ].join("");
    }

    // Render assignments table
    if (assignBodyEl) {
      if (!workers.length) {
        assignBodyEl.innerHTML = `<tr><td colspan="4" class="muted" style="padding:16px;text-align:center">No workers yet.</td></tr>`;
      } else {
        assignBodyEl.innerHTML = workers.map((w) => `
          <tr>
            <td>${esc(w.name)}</td>
            <td>${esc(w.email)}</td>
            <td>${esc(w.assignedWorkplace?.name || "Unassigned")}</td>
            <td><span class="${w.isActive !== false ? "badge badge-active" : "badge badge-inactive"}">${w.isActive !== false ? "Active" : "Inactive"}</span></td>
          </tr>`).join("");
      }
    }
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function saveAssignment() {
  const workerSelEl    = document.getElementById("assignWorker");
  const workplaceSelEl = document.getElementById("assignWorkplace");
  const msgEl          = document.getElementById("assignMsg");

  const workerId   = workerSelEl?.value;
  const workplaceId = workplaceSelEl?.value || null;

  if (!workerId) { setMsg(msgEl, "Select a worker first.", "error"); return; }

  setMsg(msgEl, "Saving...", "info");
  try {
    await apiFetch(`/api/admin/workers/${encodeURIComponent(workerId)}/workplace`, {
      method: "PATCH",
      body: JSON.stringify({ workplaceId }),
    });
    setMsg(msgEl, "Assignment saved.", "success");
    await loadAssignments();
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

function initWorkplacesTab() {
  document.getElementById("refreshWorkplacesBtn")?.addEventListener("click", loadCrmWorkplaces);
  document.getElementById("saveAssignmentBtn")?.addEventListener("click", saveAssignment);
  document.getElementById("refreshAssignmentsBtn")?.addEventListener("click", loadAssignments);

  loadCrmWorkplaces();
  loadAssignments();
}
