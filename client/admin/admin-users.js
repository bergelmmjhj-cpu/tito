/* ── Staff / Users management ────────────────────────────────────────────── */

async function loadUsers() {
  const bodyEl = document.getElementById("usersBody");
  const msgEl  = document.getElementById("usersMsg");
  setMsg(msgEl, "Loading...", "info");

  try {
    const data = await apiFetch("/api/admin/users");
    renderUsers(data?.users || [], bodyEl);
    setMsg(msgEl, "", "info");
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

function renderUsers(users, bodyEl) {
  if (!bodyEl) return;
  if (!users.length) {
    bodyEl.innerHTML = `<tr><td colspan="7" class="muted" style="padding:20px;text-align:center">No staff accounts yet.</td></tr>`;
    return;
  }

  bodyEl.innerHTML = users.map((u) => {
    const roleLabel   = u.role === "admin" ? "Admin" : "Worker";
    const statusLabel = u.isActive !== false ? "Active" : "Inactive";
    const badgeClass  = u.isActive !== false ? "badge badge-active" : "badge badge-inactive";
    const roleBadge   = u.role === "admin" ? "badge badge-approved" : "badge";

    const disableLabel   = u.isActive !== false ? "Disable Account" : "Enable Account";
    const promoteLabel   = u.role === "admin" ? "Make Worker" : "Make Admin";

    return `<tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.staffId)}</td>
      <td><span class="${roleBadge}">${roleLabel}</span></td>
      <td>${fmt(u.createdAt)}</td>
      <td><span class="${badgeClass}">${statusLabel}</span></td>
      <td style="white-space:nowrap">
        <button class="btn-sm" data-act="toggle-active" data-id="${esc(u.id)}" data-active="${u.isActive !== false}">${disableLabel}</button>
        <button class="btn-sm" style="margin-left:6px" data-act="toggle-role" data-id="${esc(u.id)}" data-role="${esc(u.role)}">${promoteLabel}</button>
      </td>
    </tr>`;
  }).join("");
}

async function createUser(event) {
  event.preventDefault();
  const form = event.target;
  const msgEl = document.getElementById("createUserMsg");
  setMsg(msgEl, "Creating account...", "info");

  const payload = {
    firstName:       form.querySelector('[name="firstName"]').value.trim(),
    lastName:        form.querySelector('[name="lastName"]').value.trim(),
    email:           form.querySelector('[name="email"]').value.trim(),
    staffId:         form.querySelector('[name="staffId"]').value.trim(),
    password:        form.querySelector('[name="password"]').value,
    confirmPassword: form.querySelector('[name="confirmPassword"]').value,
    role:            form.querySelector('[name="role"]').value,
  };

  try {
    await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
    setMsg(msgEl, `Account created for ${payload.firstName} ${payload.lastName}.`, "success");
    form.reset();
    await loadUsers();
  } catch (err) {
    setMsg(msgEl, err.message, "error");
  }
}

async function toggleUserActive(userId, currentlyActive) {
  try {
    await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !currentlyActive }),
    });
    await loadUsers();
  } catch (err) {
    const msgEl = document.getElementById("usersMsg");
    setMsg(msgEl, err.message, "error");
  }
}

async function toggleUserRole(userId, currentRole) {
  const newRole = currentRole === "admin" ? "worker" : "admin";
  const confirm = window.confirm(
    `Change role to ${newRole === "admin" ? "Admin" : "Worker"}?`
  );
  if (!confirm) return;

  try {
    await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    await loadUsers();
  } catch (err) {
    const msgEl = document.getElementById("usersMsg");
    setMsg(msgEl, err.message, "error");
  }
}

function initUsersTab() {
  const form   = document.getElementById("createUserForm");
  const bodyEl = document.getElementById("usersBody");

  if (form) form.addEventListener("submit", createUser);

  if (bodyEl) {
    bodyEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const { act, id, active, role } = btn.dataset;
      if (act === "toggle-active") toggleUserActive(id, active === "true");
      if (act === "toggle-role")   toggleUserRole(id, role);
    });
  }

  document.getElementById("refreshUsersBtn")?.addEventListener("click", loadUsers);
  loadUsers();
}
