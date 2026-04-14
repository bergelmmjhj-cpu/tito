/* ── Shared admin auth + API helpers ─────────────────────────────────────── */
const TOKEN_KEY = "timeclock_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace("/");
    throw new Error("Session expired.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/csv")) return res.text();

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch {
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return text;
  }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

async function requireAdminAuth() {
  const token = getToken();
  if (!token) { window.location.replace("/"); return null; }
  try {
    const data = await apiFetch("/api/auth/me");
    if (!data?.user) { window.location.replace("/"); return null; }
    if (data.user.role !== "admin") { window.location.replace("/worker/"); return null; }
    return data.user;
  } catch {
    window.location.replace("/");
    return null;
  }
}

function triggerCsvDownload(text, fileName) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName || "export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function fmt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}

function fmtHours(v) {
  return (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "—";
}

function esc(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMsg(el, message, tone = "info") {
  if (!el) return;
  el.textContent = message || "";
  el.className = `msg ${tone}${message ? "" : " hidden"}`;
}

/* ── Dashboard Stats ─────────────────────────────────────────────────────── */
async function loadDashboard() {
  const msgEl = document.getElementById("dashboardMsg");
  setMsg(msgEl, "Loading...", "info");

  try {
    const data = await apiFetch("/api/admin/dashboard");
    const s = data?.stats || {};

    const setKpi = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? "—";
    };

    setKpi("kpiActiveStaff",     s.activeStaff      ?? "—");
    setKpi("kpiClockedIn",       s.clockedIn         ?? "—");
    setKpi("kpiOpenShifts",      s.openShifts        ?? "—");
    setKpi("kpiMissingClockOut", s.missingClockOuts  ?? "—");
    setKpi("kpiExceptions",      s.exceptionsToday   ?? "—");
    setKpi("kpiHotels",          s.activeWorkplaces  ?? "—");
    setKpi("kpiHoursToday",      s.hoursToday        ?? "—");
    setKpi("kpiHoursWeek",       s.hoursThisWeek     ?? "—");

    const tsEl = document.getElementById("dashboardTimestamp");
    if (tsEl && s.generatedAt) tsEl.textContent = `Updated ${fmt(s.generatedAt)}`;

    setMsg(msgEl, "", "info");
  } catch (err) {
    setMsg(msgEl, `Could not load dashboard stats: ${err.message}`, "error");
  }
}
