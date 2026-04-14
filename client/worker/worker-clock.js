/* ── Shared auth helpers ──────────────────────────────────────────────────── */
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
    throw new Error("Session expired. Please log in again.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/csv")) return res.text();

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return text;
  }

  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

async function requireWorkerAuth() {
  const token = getToken();
  if (!token) { window.location.replace("/"); return null; }

  try {
    const data = await apiFetch("/api/auth/me");
    if (!data?.user) { window.location.replace("/"); return null; }
    if (data.user.role === "admin") {
      window.location.replace("/admin/");
      return null;
    }
    return data.user;
  } catch {
    window.location.replace("/");
    return null;
  }
}

/* ── State ───────────────────────────────────────────────────────────────── */
const LOCATION_REQUIRED = (() => {
  if (window.TIME_CLOCK_REQUIRE_LOCATION === false) return false;
  if (window.TIME_CLOCK_REQUIRE_LOCATION === "false") return false;
  return true;
})();

const MAX_LOCATION_AGE_MS = 2 * 60 * 1000; // 2 min

let currentUser = null;
let currentStatus = "not_clocked_in";
let lastLocation = null;
let locationPermission = "unknown";
let locationMap = null;
let locationMarker = null;
let clockIntervalId = null;
let actionInProgress = false;

/* ── DOM references ─────────────────────────────────────────────────────── */
const workerNameEl   = document.getElementById("workerName");
const liveClockEl    = document.getElementById("liveClock");
const statusLabelEl  = document.getElementById("statusLabel");
const workplaceLineEl = document.getElementById("workplaceLine");
const actionFeedbackEl = document.getElementById("actionFeedback");

const clockInBtnEl   = document.getElementById("clockInBtn");
const breakBtnEl     = document.getElementById("breakBtn");
const endBreakBtnEl  = document.getElementById("endBreakBtn");
const clockOutBtnEl  = document.getElementById("clockOutBtn");

const locStatusEl    = document.getElementById("locStatus");
const locHintEl      = document.getElementById("locHint");
const locRefreshBtnEl = document.getElementById("locRefreshBtn");
const locationMapEl  = document.getElementById("locationMap");
const mapPlaceholderEl = document.getElementById("mapPlaceholder");

const logoutBtnEl    = document.getElementById("logoutBtn");
const historyBodyEl  = document.getElementById("historyBody");
const refreshHistoryBtnEl = document.getElementById("refreshHistoryBtn");

/* ── Utilities ───────────────────────────────────────────────────────────── */
function fmt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleString();
}

function fmtHours(hours) {
  if (typeof hours !== "number" || !isFinite(hours)) return "—";
  return hours.toFixed(2) + " hrs";
}

function isValidLoc(loc) {
  return (
    loc &&
    typeof loc.latitude === "number" && isFinite(loc.latitude) &&
    typeof loc.longitude === "number" && isFinite(loc.longitude)
  );
}

function isFreshLoc(loc) {
  if (!isValidLoc(loc)) return false;
  const age = Date.now() - Date.parse(loc.capturedAt || "");
  return !isNaN(age) && age <= MAX_LOCATION_AGE_MS;
}

function setFeedback(message, tone = "info") {
  if (!actionFeedbackEl) return;
  actionFeedbackEl.textContent = message || "";
  actionFeedbackEl.className = `action-feedback${message ? "" : " hidden"} ${tone}`;
}

/* ── Live clock ──────────────────────────────────────────────────────────── */
function startLiveClock() {
  const tick = () => { if (liveClockEl) liveClockEl.textContent = new Date().toLocaleTimeString(); };
  tick();
  clockIntervalId = setInterval(tick, 1000);
}

/* ── Render status ───────────────────────────────────────────────────────── */
function renderStatus(status, geofence) {
  currentStatus = status || "not_clocked_in";

  const labels = {
    clocked_in:     "Clocked In",
    on_break:       "On Break",
    clocked_out:    "Clocked Out",
    not_clocked_in: "Not Clocked In",
  };
  const classes = {
    clocked_in:     "status-label clocked-in",
    on_break:       "status-label on-break",
    clocked_out:    "status-label clocked-out",
    not_clocked_in: "status-label",
  };

  if (statusLabelEl) {
    statusLabelEl.textContent = labels[currentStatus] || "Unknown";
    statusLabelEl.className = classes[currentStatus] || "status-label";
  }

  // Show/hide action buttons
  const canClockIn = currentStatus === "not_clocked_in" || currentStatus === "clocked_out";
  const hasLocation = LOCATION_REQUIRED ? isFreshLoc(lastLocation) : true;

  if (clockInBtnEl)  { clockInBtnEl.classList.toggle("hidden", !canClockIn); clockInBtnEl.disabled = actionInProgress || !hasLocation; }
  if (breakBtnEl)    { breakBtnEl.classList.toggle("hidden", currentStatus !== "clocked_in"); breakBtnEl.disabled = actionInProgress; }
  if (endBreakBtnEl) { endBreakBtnEl.classList.toggle("hidden", currentStatus !== "on_break"); endBreakBtnEl.disabled = actionInProgress; }
  if (clockOutBtnEl) { clockOutBtnEl.classList.toggle("hidden", currentStatus !== "clocked_in" && currentStatus !== "on_break"); clockOutBtnEl.disabled = actionInProgress || currentStatus === "on_break"; }

  // Workplace info
  if (workplaceLineEl && geofence) {
    const wp = geofence.resolvedWorkplaceName || geofence.workplaceName;
    if (wp) {
      const within = geofence.withinGeofence;
      const icon = within === true ? "✓" : within === false ? "⚠" : "•";
      workplaceLineEl.innerHTML = `${icon} <strong>${wp}</strong>`;
    } else {
      workplaceLineEl.textContent = "No workplace detected";
    }
  }
}

/* ── Location ────────────────────────────────────────────────────────────── */
function renderLocStatus(status, loc) {
  const messages = {
    requesting: "Finding your location...",
    granted:    isFreshLoc(loc) ? "Location ready" : "Location stale — tap Refresh",
    denied:     "Location access denied — enable it in your phone settings",
    blocked:    "Location blocked — check browser settings",
    timeout:    "Location timed out — move outside and retry",
    unavailable:"Location unavailable on this device",
  };

  const message = messages[status] || "Location unavailable";
  const isOk = status === "granted" && isFreshLoc(loc);

  if (locStatusEl) {
    locStatusEl.textContent = message;
    locStatusEl.className = `location-status ${isOk ? "ok" : status === "denied" || status === "blocked" || status === "timeout" ? "bad" : ""}`;
  }

  if (locHintEl) {
    if (LOCATION_REQUIRED && !isOk) {
      locHintEl.textContent = "Clock In requires a fresh location. Tap Refresh Location.";
      locHintEl.className = "location-hint error";
    } else {
      locHintEl.textContent = isOk ? "Location captured. You can clock in." : "";
      locHintEl.className = "location-hint";
    }
  }
}

function updateMap(loc) {
  if (!loc || typeof window.L === "undefined") return;
  if (!locationMapEl) return;

  locationMapEl.classList.remove("hidden");
  if (mapPlaceholderEl) mapPlaceholderEl.classList.add("hidden");

  if (!locationMap) {
    locationMap = window.L.map(locationMapEl).setView([loc.latitude, loc.longitude], 16);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(locationMap);
  }

  const latLng = [loc.latitude, loc.longitude];
  if (!locationMarker) {
    locationMarker = window.L.marker(latLng).addTo(locationMap);
  } else {
    locationMarker.setLatLng(latLng);
  }
  locationMap.setView(latLng, 16);
  setTimeout(() => locationMap && locationMap.invalidateSize(), 100);
}

async function captureLocation(force = false) {
  if (!navigator.geolocation) {
    locationPermission = "unsupported";
    renderLocStatus("unavailable", null);
    renderStatus(currentStatus);
    return null;
  }

  renderLocStatus("requesting", lastLocation);

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: force ? 0 : 30000,
      });
    });

    lastLocation = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      capturedAt: new Date().toISOString(),
    };
    locationPermission = "granted";
    renderLocStatus("granted", lastLocation);
    updateMap(lastLocation);
    renderStatus(currentStatus);
    return lastLocation;
  } catch (err) {
    const code = err?.code;
    locationPermission = code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
    renderLocStatus(locationPermission, lastLocation);
    renderStatus(currentStatus);
    return lastLocation || null;
  }
}

async function ensureClockInLocation() {
  const fresh = await captureLocation(true);
  if (LOCATION_REQUIRED && !isFreshLoc(fresh)) {
    throw new Error("Clock In requires a fresh location. Tap Refresh Location and try again.");
  }
  return fresh;
}

/* ── Clock actions ───────────────────────────────────────────────────────── */
async function doAction(actionType) {
  if (actionInProgress) return;
  actionInProgress = true;
  setFeedback("", "info");

  const labels = { clock_in: "Clock In", break_start: "Break Started", break_end: "Break Ended", clock_out: "Clock Out" };
  const label = labels[actionType] || actionType;

  try {
    let location = lastLocation;

    if (actionType === "clock_in") {
      setFeedback("Getting your location...", "info");
      location = await ensureClockInLocation();
    } else if (LOCATION_REQUIRED) {
      if (!isFreshLoc(lastLocation)) {
        setFeedback("Getting your location...", "info");
        location = await captureLocation(false);
      }
    }

    setFeedback(`Saving ${label.toLowerCase()}...`, "info");

    const result = await apiFetch("/api/time/actions", {
      method: "POST",
      body: JSON.stringify({
        actionType,
        location: location || undefined,
      }),
    });

    setFeedback(`${label} recorded.`, "success");
    renderStatus(result?.status || currentStatus, result?.geofenceEvaluation);
    loadHistory();
    setTimeout(() => setFeedback("", "info"), 3000);
  } catch (err) {
    setFeedback(err.message || "Something went wrong. Try again.", "error");
    // Re-sync status
    loadCurrentStatus().catch(() => {});
  } finally {
    actionInProgress = false;
    renderStatus(currentStatus);
  }
}

/* ── Load data ───────────────────────────────────────────────────────────── */
async function loadCurrentStatus() {
  const data = await apiFetch("/api/time/status");
  currentUser = data?.user || currentUser;
  renderStatus(data?.status, data?.workplaceAssignment);
  return data;
}

/* ── History ─────────────────────────────────────────────────────────────── */
async function loadHistory() {
  try {
    const data = await apiFetch("/api/time/shifts");
    renderHistory(data?.shifts || []);
  } catch (err) {
    console.warn("[history] load failed:", err.message);
  }
}

function renderHistory(shifts) {
  if (!historyBodyEl) return;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    historyBodyEl.innerHTML = `<tr><td colspan="6" class="muted">No shifts yet.</td></tr>`;
    return;
  }

  historyBodyEl.innerHTML = shifts.map((s) => {
    const breaks = Array.isArray(s.breakStart) ? s.breakStart.length : 0;
    const breakText = breaks > 0 ? `${breaks} break${breaks > 1 ? "s" : ""}` : "—";
    return `<tr>
      <td>${s.date || "—"}</td>
      <td>${s.workplaceName || "—"}</td>
      <td>${fmt(s.timeIn)}</td>
      <td>${breakText}</td>
      <td>${fmt(s.timeOut)}</td>
      <td>${fmtHours(s.actualHours)}</td>
    </tr>`;
  }).join("");
}

/* ── Logout ──────────────────────────────────────────────────────────────── */
async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {}
  localStorage.removeItem(TOKEN_KEY);
  window.location.replace("/");
}

/* ── Event listeners ─────────────────────────────────────────────────────── */
if (clockInBtnEl)    clockInBtnEl.addEventListener("click",  () => doAction("clock_in").catch(() => {}));
if (breakBtnEl)      breakBtnEl.addEventListener("click",    () => doAction("break_start").catch(() => {}));
if (endBreakBtnEl)   endBreakBtnEl.addEventListener("click", () => doAction("break_end").catch(() => {}));
if (clockOutBtnEl)   clockOutBtnEl.addEventListener("click", () => doAction("clock_out").catch(() => {}));
if (logoutBtnEl)     logoutBtnEl.addEventListener("click",   logout);
if (locRefreshBtnEl) locRefreshBtnEl.addEventListener("click", () => captureLocation(true));
if (refreshHistoryBtnEl) refreshHistoryBtnEl.addEventListener("click", () => loadHistory());

/* ── Init ────────────────────────────────────────────────────────────────── */
(async function init() {
  const user = await requireWorkerAuth();
  if (!user) return;

  currentUser = user;
  if (workerNameEl) workerNameEl.textContent = user.name || "Worker";

  startLiveClock();

  try {
    await loadCurrentStatus();
  } catch (err) {
    setFeedback("Could not load your status. Please refresh.", "error");
  }

  // Load history in background
  loadHistory();

  // Request location immediately for clock-in readiness
  captureLocation(false).catch(() => {});
})();

window.addEventListener("beforeunload", () => {
  if (clockIntervalId) clearInterval(clockIntervalId);
});
