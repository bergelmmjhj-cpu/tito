const loginViewEl = document.getElementById("loginView");
const appViewEl = document.getElementById("appView");
const loginFormViewEl = document.getElementById("loginFormView");
const signupFormViewEl = document.getElementById("signupFormView");
const showLoginBtnEl = document.getElementById("showLoginBtn");
const showSignupBtnEl = document.getElementById("showSignupBtn");

const identifierEl = document.getElementById("identifier");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
const adminLoginBtnEl = document.getElementById("adminLoginBtn");
const googleLoginBtnEl = document.getElementById("googleLoginBtn");
const loginErrorEl = document.getElementById("loginError");

const signupFirstNameEl = document.getElementById("signupFirstName");
const signupLastNameEl = document.getElementById("signupLastName");
const signupEmailEl = document.getElementById("signupEmail");
const signupPhoneEl = document.getElementById("signupPhone");
const signupPasswordEl = document.getElementById("signupPassword");
const signupConfirmPasswordEl = document.getElementById("signupConfirmPassword");
const signupBtnEl = document.getElementById("signupBtn");
const signupErrorEl = document.getElementById("signupError");

const workerNameEl = document.getElementById("workerName");
const liveClockEl = document.getElementById("liveClock");
const statusBadgeEl = document.getElementById("statusBadge");
const assignedWorkplaceInfoEl = document.getElementById("assignedWorkplaceInfo");
const geofenceInfoEl = document.getElementById("geofenceInfo");
const actionErrorEl = document.getElementById("actionError");
const notesEl = document.getElementById("notes");
const clockInBtnEl = document.getElementById("clockInBtn");
const startBreakBtnEl = document.getElementById("startBreakBtn");
const endBreakBtnEl = document.getElementById("endBreakBtn");
const clockOutBtnEl = document.getElementById("clockOutBtn");
const locationActionHintEl = document.getElementById("locationActionHint");
const historyBodyEl = document.getElementById("historyBody");
const refreshHistoryBtnEl = document.getElementById("refreshHistoryBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const locationPanelEl = document.getElementById("locationPanel");
const refreshLocationBtnEl = document.getElementById("refreshLocationBtn");
const locationStatusBadgeEl = document.getElementById("locationStatusBadge");
const locationMessageEl = document.getElementById("locationMessage");
const locationCoordinatesEl = document.getElementById("locationCoordinates");
const locationHelpPanelEl = document.getElementById("locationHelpPanel");
const locationDebugEl = document.getElementById("locationDebug");
const lastLocationDetailsEl = document.getElementById("lastLocationDetails");
const locationMapEl = document.getElementById("locationMap");
const mapPlaceholderEl = document.getElementById("mapPlaceholder");
const mapStatusTextEl = document.getElementById("mapStatusText");
const mapCoordinatesTextEl = document.getElementById("mapCoordinatesText");

const showTimeClockBtnEl = document.getElementById("showTimeClockBtn");
const showWorkplacesBtnEl = document.getElementById("showWorkplacesBtn");
const showUsersBtnEl = document.getElementById("showUsersBtn");
const showTimesheetsBtnEl = document.getElementById("showTimesheetsBtn");
const timeClockSectionEl = document.getElementById("timeClockSection");
const historySectionEl = document.getElementById("historySection");
const workplacesSectionEl = document.getElementById("workplacesSection");
const usersSectionEl = document.getElementById("usersSection");
const timesheetsSectionEl = document.getElementById("timesheetsSection");
const refreshWorkplacesBtnEl = document.getElementById("refreshWorkplacesBtn");
const workplaceFormEl = document.getElementById("workplaceForm");
const workplaceIdEl = document.getElementById("workplaceId");
const wpNameEl = document.getElementById("wpName");
const wpAddressEl = document.getElementById("wpAddress");
const wpCityEl = document.getElementById("wpCity");
const wpStateEl = document.getElementById("wpState");
const wpPostalCodeEl = document.getElementById("wpPostalCode");
const wpCountryEl = document.getElementById("wpCountry");
const wpContactNameEl = document.getElementById("wpContactName");
const wpContactPhoneEl = document.getElementById("wpContactPhone");
const wpContactEmailEl = document.getElementById("wpContactEmail");
const wpLatitudeEl = document.getElementById("wpLatitude");
const wpLongitudeEl = document.getElementById("wpLongitude");
const wpRadiusEl = document.getElementById("wpRadius");
const wpActiveEl = document.getElementById("wpActive");
const saveWorkplaceBtnEl = document.getElementById("saveWorkplaceBtn");
const resetWorkplaceBtnEl = document.getElementById("resetWorkplaceBtn");
const workplaceErrorEl = document.getElementById("workplaceError");
const workplacesBodyEl = document.getElementById("workplacesBody");
const assignWorkerSelectEl = document.getElementById("assignWorkerSelect");
const assignWorkplaceSelectEl = document.getElementById("assignWorkplaceSelect");
const saveAssignmentBtnEl = document.getElementById("saveAssignmentBtn");
const assignmentErrorEl = document.getElementById("assignmentError");
const workerAssignmentsBodyEl = document.getElementById("workerAssignmentsBody");
const adminUserFormEl = document.getElementById("adminUserForm");
const adminUserFirstNameEl = document.getElementById("adminUserFirstName");
const adminUserLastNameEl = document.getElementById("adminUserLastName");
const adminUserEmailEl = document.getElementById("adminUserEmail");
const adminUserStaffIdEl = document.getElementById("adminUserStaffId");
const adminUserPasswordEl = document.getElementById("adminUserPassword");
const adminUserConfirmPasswordEl = document.getElementById("adminUserConfirmPassword");
const adminUserRoleEl = document.getElementById("adminUserRole");
const adminUsersBodyEl = document.getElementById("adminUsersBody");
const adminUserErrorEl = document.getElementById("adminUserError");
const adminUserMessageEl = document.getElementById("adminUserMessage");
const refreshUsersBtnEl = document.getElementById("refreshUsersBtn");

const TOKEN_KEY = "timeclock_token";
const GEO_REQUEST_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
const MAX_CLOCK_IN_LOCATION_AGE_MS = 2 * 60 * 1000;

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let currentStatus = "not_clocked_in";
let liveClockIntervalId = null;
let lastCapturedLocation = null;
let currentUser = null;
let locationMap = null;
let locationMarker = null;
let locationPermissionState = "unknown";
let geolocationPermissionStatus = null;
let lastLocationIssue = "";
let lastLocationCheckAt = null;

const API_BASE_URL = (() => {
  const configured = window.TIME_CLOCK_API_BASE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.replace(/\/$/, "");
  }
  return window.location.protocol === "file:" ? "http://localhost:3000" : "";
})();

const LOCATION_REQUIRED = (() => {
  if (window.TIME_CLOCK_REQUIRE_LOCATION === false) return false;
  if (window.TIME_CLOCK_REQUIRE_LOCATION === "false") return false;
  if (window.TIME_CLOCK_ALLOW_MISSING_LOCATION === true) return false;
  if (window.TIME_CLOCK_ALLOW_MISSING_LOCATION === "true") return false;
  return true;
})();

function setError(el, message) {
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function setInfo(el, message) {
  el.textContent = message || "";
}

function logLocationDiagnostic(event, details = {}) {
  console.info("[geo]", event, details);
}

function formatHours(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function consumeAuthErrorFromUrl() {
  const url = new URL(window.location.href);
  const authError = url.searchParams.get("authError");
  if (!authError) return;

  setAuthMode("login");
  setError(loginErrorEl, authError);
  url.searchParams.delete("authError");

  const next = `${url.pathname}${url.search}${url.hash}` || "/";
  window.history.replaceState({}, document.title, next);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function toStatusLabel(status) {
  if (status === "clocked_in") return "Clocked in";
  if (status === "on_break") return "On break";
  if (status === "clocked_out") return "Clocked out";
  return "Not clocked in";
}

function toActionLabel(actionType) {
  if (actionType === "clock_in") return "Clock In";
  if (actionType === "break_start") return "Start Break";
  if (actionType === "break_end") return "End Break";
  if (actionType === "clock_out") return "Clock Out";
  return actionType || "—";
}

function formatCoordinates(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "—";
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function formatDurationMinutes(minutes) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function isValidLocation(location) {
  return Boolean(
    location &&
      typeof location.latitude === "number" &&
      Number.isFinite(location.latitude) &&
      typeof location.longitude === "number" &&
      Number.isFinite(location.longitude)
  );
}

function getLocationAgeMs(location) {
  if (!location?.capturedAt) return null;
  const capturedAt = Date.parse(location.capturedAt);
  if (Number.isNaN(capturedAt)) return null;
  return Date.now() - capturedAt;
}

function isFreshLocation(location) {
  const ageMs = getLocationAgeMs(location);
  return isValidLocation(location) && ageMs !== null && ageMs <= MAX_CLOCK_IN_LOCATION_AGE_MS;
}

function describePermissionState(state) {
  if (state === "granted") return "granted";
  if (state === "prompt") return "prompt";
  if (state === "denied") return "denied";
  if (state === "unsupported") return "unsupported";
  return "checking";
}

function updateLastLocationDetails(location, label = "Last captured location") {
  if (!isValidLocation(location)) {
    lastLocationDetailsEl.textContent = "No location captured yet.";
    return;
  }

  const ageMs = getLocationAgeMs(location);
  const freshnessLabel = ageMs !== null && ageMs <= MAX_CLOCK_IN_LOCATION_AGE_MS ? "Fresh" : "Stale";
  const coordinates = formatCoordinates(location.latitude, location.longitude);
  lastLocationDetailsEl.textContent = `${label}: ${coordinates} | Accuracy ${
    typeof location.accuracy === "number" ? `${location.accuracy.toFixed(1)}m` : "n/a"
  } | Captured ${formatDateTime(location.capturedAt)} | ${freshnessLabel}`;
}

function getLocationUserMessage(status, location) {
  if (status === "requesting") {
    return "Requesting location permission and a fresh phone GPS fix now.";
  }

  if (status === "granted") {
    return isFreshLocation(location)
      ? "Fresh location captured. You can clock in."
      : "Location permission is granted, but the saved fix is stale. Tap Retry / Refresh Location before clocking in.";
  }

  if (status === "denied") {
    return "Location permission was denied on this request. Allow it and try again.";
  }

  if (status === "blocked") {
    return "Location is blocked in browser or phone settings for this site.";
  }

  if (status === "timeout") {
    return "Location timed out. Move to a clearer signal, then retry.";
  }

  return "Location is unavailable on this device or browser right now.";
}

function renderLocationDebug() {
  const parts = [`Permission: ${describePermissionState(locationPermissionState)}`];
  if (lastLocationIssue) parts.push(`Last issue: ${lastLocationIssue}`);
  if (lastLocationCheckAt) parts.push(`Last check: ${formatDateTime(lastLocationCheckAt)}`);
  locationDebugEl.textContent = parts.join(" | ");
}

function renderLocationActionHint() {
  if (!LOCATION_REQUIRED) {
    locationActionHintEl.textContent = "Location is optional in this browser configuration.";
    return;
  }

  if (currentStatus !== "not_clocked_in" && currentStatus !== "clocked_out") {
    locationActionHintEl.textContent = "A fresh location is enforced before Clock In to protect attendance integrity.";
    return;
  }

  if (locationPermissionState === "denied") {
    locationActionHintEl.textContent = "Clock In is disabled because location is blocked for this site. Fix phone/browser settings, reopen the page, then tap Retry / Refresh Location.";
    return;
  }

  if (!isValidLocation(lastCapturedLocation)) {
    locationActionHintEl.textContent = "Clock In is disabled until this page captures a fresh location.";
    return;
  }

  if (!isFreshLocation(lastCapturedLocation)) {
    locationActionHintEl.textContent = "Clock In is disabled because the saved location is stale. Tap Retry / Refresh Location for a fresh fix.";
    return;
  }

  locationActionHintEl.textContent = "Fresh location ready. Clock In is available.";
}

function ensureMap() {
  if (locationMap || typeof window.L === "undefined") return locationMap;

  locationMap = window.L.map(locationMapEl, {
    zoomControl: true,
    attributionControl: true,
  }).setView([0, 0], 2);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(locationMap);

  return locationMap;
}

function showMapPlaceholder(message, statusText) {
  locationMapEl.classList.add("hidden");
  mapPlaceholderEl.classList.remove("hidden");
  mapPlaceholderEl.textContent = message;
  mapStatusTextEl.textContent = statusText;
  mapCoordinatesTextEl.textContent = "Map coordinates: —";
}

function updateMapPreview(location, label = "Captured location") {
  if (!isValidLocation(location)) {
    showMapPlaceholder("Location not captured yet.", "Waiting for location");
    return;
  }

  const map = ensureMap();
  if (!map) {
    showMapPlaceholder("Map unavailable in this browser session.", "Map unavailable");
    return;
  }

  locationMapEl.classList.remove("hidden");
  mapPlaceholderEl.classList.add("hidden");
  mapStatusTextEl.textContent = label;
  mapCoordinatesTextEl.textContent = `Map coordinates: ${formatCoordinates(
    location.latitude,
    location.longitude
  )}`;

  const latLng = [location.latitude, location.longitude];
  if (!locationMarker) {
    locationMarker = window.L.marker(latLng).addTo(map);
  } else {
    locationMarker.setLatLng(latLng);
  }

  locationMarker.bindPopup(label).openPopup();
  map.setView(latLng, 15);
  setTimeout(() => map.invalidateSize(), 0);
}

function parseNumberInput(value) {
  const clean = String(value || "").trim();
  if (!clean) return Number.NaN;
  return Number(clean);
}

function toWorkplacePayload() {
  return {
    name: wpNameEl.value.trim(),
    address: wpAddressEl.value.trim(),
    city: wpCityEl.value.trim(),
    state: wpStateEl.value.trim(),
    postalCode: wpPostalCodeEl.value.trim(),
    country: wpCountryEl.value.trim(),
    contactName: wpContactNameEl.value.trim() || undefined,
    contactPhone: wpContactPhoneEl.value.trim() || undefined,
    contactEmail: wpContactEmailEl.value.trim() || undefined,
    latitude: parseNumberInput(wpLatitudeEl.value),
    longitude: parseNumberInput(wpLongitudeEl.value),
    geofenceRadiusMeters: parseNumberInput(wpRadiusEl.value),
    active: wpActiveEl.checked,
  };
}

function resetWorkplaceForm() {
  workplaceIdEl.value = "";
  workplaceFormEl.reset();
  wpActiveEl.checked = true;
  saveWorkplaceBtnEl.textContent = "Save Workplace";
}

function renderLocationState(status, location = lastCapturedLocation) {
  const badgeLabel = {
    requesting: "Requesting permission",
    granted: "Location granted",
    denied: "Permission denied",
    blocked: "Location blocked",
    timeout: "Location timed out",
    unavailable: "Location unavailable",
  }[status] || "Location unavailable";

  locationPanelEl.dataset.state = status;
  locationStatusBadgeEl.textContent = badgeLabel;
  locationMessageEl.textContent = getLocationUserMessage(status, location);
  locationHelpPanelEl.classList.toggle("hidden", !(status === "denied" || status === "blocked"));

  if (status === "requesting") {
    locationCoordinatesEl.textContent = isValidLocation(lastCapturedLocation)
      ? `Last known coordinates: ${formatCoordinates(lastCapturedLocation.latitude, lastCapturedLocation.longitude)}`
      : "Coordinates: waiting for browser geolocation...";
    if (isValidLocation(lastCapturedLocation)) {
      updateLastLocationDetails(lastCapturedLocation, "Last known location");
      updateMapPreview(lastCapturedLocation, "Last known location");
    } else {
      lastLocationDetailsEl.textContent = "Waiting for a fresh location fix.";
      showMapPlaceholder("Waiting for a fresh phone location...", badgeLabel);
    }
    renderLocationDebug();
    renderLocationActionHint();
    return;
  }

  if (status === "granted" && isValidLocation(location)) {
    const coordinates = formatCoordinates(location.latitude, location.longitude);
    locationCoordinatesEl.textContent = `Coordinates: ${coordinates}`;
    updateLastLocationDetails(location);
    updateMapPreview(location, isFreshLocation(location) ? "Fresh captured location" : "Last captured location");
    renderLocationDebug();
    renderLocationActionHint();
    return;
  }

  if (isValidLocation(lastCapturedLocation)) {
    locationCoordinatesEl.textContent = `Last known coordinates: ${formatCoordinates(
      lastCapturedLocation.latitude,
      lastCapturedLocation.longitude
    )}`;
    updateLastLocationDetails(lastCapturedLocation, "Last known location");
    updateMapPreview(lastCapturedLocation, "Last known location");
  } else {
    locationCoordinatesEl.textContent = "Coordinates: unavailable.";
    lastLocationDetailsEl.textContent = "No location captured yet.";
    showMapPlaceholder("Location not captured yet.", badgeLabel);
  }

  renderLocationDebug();
  renderLocationActionHint();
}

function renderStatus(status) {
  currentStatus = status || "not_clocked_in";
  statusBadgeEl.textContent = toStatusLabel(currentStatus);
  const canClockInByStatus = currentStatus === "not_clocked_in" || currentStatus === "clocked_out";
  clockInBtnEl.disabled = !canClockInByStatus || (LOCATION_REQUIRED && !isFreshLocation(lastCapturedLocation));
  startBreakBtnEl.disabled = currentStatus !== "clocked_in";
  endBreakBtnEl.disabled = currentStatus !== "on_break";
  clockOutBtnEl.disabled = currentStatus !== "clocked_in";
  renderLocationActionHint();
}

function renderAssignedWorkplaceInfo(assignment) {
  if (!assignment || !assignment.assignedWorkplaceId) {
    assignedWorkplaceInfoEl.textContent = "Assigned workplace: none";
    return;
  }

  assignedWorkplaceInfoEl.textContent = `Assigned workplace: ${
    assignment.assignedWorkplaceName || assignment.assignedWorkplaceId
  }${
    typeof assignment.geofenceRadiusMeters === "number"
      ? ` (radius ${assignment.geofenceRadiusMeters}m)`
      : ""
  }`;
}

function renderGeofenceInfo(geofenceEvaluation) {
  if (!geofenceEvaluation) {
    geofenceInfoEl.textContent = "Distance check: not evaluated yet";
    return;
  }

  if (!geofenceEvaluation.assignmentRequired) {
    geofenceInfoEl.textContent = "Distance check: no assigned workplace";
    return;
  }

  const workplaceName = geofenceEvaluation.workplaceName || "assigned workplace";
  const distanceText =
    typeof geofenceEvaluation.distanceMeters === "number"
      ? `${geofenceEvaluation.distanceMeters.toFixed(2)}m`
      : "n/a";
  const radiusText =
    typeof geofenceEvaluation.radiusMeters === "number"
      ? `${geofenceEvaluation.radiusMeters}m`
      : "n/a";
  const withinText =
    typeof geofenceEvaluation.withinGeofence === "boolean"
      ? geofenceEvaluation.withinGeofence
        ? "inside"
        : "outside"
      : "not calculated";

  geofenceInfoEl.textContent = `Distance check (${workplaceName}): ${distanceText} vs radius ${radiusText} (${withinText})`;
}

function renderHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    historyBodyEl.innerHTML = `<tr><td colspan="9" class="muted">No attendance history yet.</td></tr>`;
    return;
  }

  historyBodyEl.innerHTML = history
    .map((item) => {
      return `
        <tr>
          <td>${item.date || "—"}</td>
          <td>${statusBadgeHtml(item.status)}</td>
          <td>${formatDateTime(item.timeIn)}</td>
          <td>${formatBreakList(item.breakStart)}</td>
          <td>${formatBreakList(item.breakEnd)}</td>
          <td>${formatDateTime(item.timeOut)}</td>
          <td>${item.rawDuration || formatDurationMinutes(item.totalMinutes)}</td>
          <td>${formatHours(item.actualHours)}</td>
          <td>${formatHours(item.payableHours)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderWorkplaces(workplaces) {
  if (!Array.isArray(workplaces) || workplaces.length === 0) {
    workplacesBodyEl.innerHTML = `<tr><td colspan="8" class="muted">No workplaces yet.</td></tr>`;
    return;
  }

  workplacesBodyEl.innerHTML = workplaces
    .map((item) => {
      const statusText = item.active === false ? "Inactive" : "Active";
      const toggleLabel = item.active === false ? "Activate" : "Deactivate";
      return `
        <tr>
          <td>${item.name}</td>
          <td>${item.city || "—"}</td>
          <td>${item.state || "—"}</td>
          <td>${item.country || "—"}</td>
          <td>${formatCoordinates(item.latitude, item.longitude)}</td>
          <td>${item.geofenceRadiusMeters} m</td>
          <td>${statusText}</td>
          <td>
            <button class="ghost tiny" data-action="edit" data-id="${item.id}">Edit</button>
            <button class="ghost tiny" data-action="toggle" data-id="${item.id}" data-active="${item.active !== false}">${toggleLabel}</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAssignSelectors(workers, workplaces) {
  assignWorkerSelectEl.innerHTML = workers
    .map((worker) => `<option value="${worker.id}">${worker.name} (${worker.staffId})</option>`)
    .join("");

  assignWorkplaceSelectEl.innerHTML = [
    '<option value="">Unassigned</option>',
    ...workplaces.map(
      (workplace) =>
        `<option value="${workplace.id}">${workplace.name} (${workplace.city || "—"})</option>`
    ),
  ].join("");
}

function renderWorkerAssignments(workers) {
  if (!Array.isArray(workers) || workers.length === 0) {
    workerAssignmentsBodyEl.innerHTML =
      '<tr><td colspan="4" class="muted">No workers available.</td></tr>';
    return;
  }

  workerAssignmentsBodyEl.innerHTML = workers
    .map((worker) => {
      const assigned = worker.assignedWorkplace?.name || "Unassigned";
      const status = worker.isActive === false ? "Inactive user" : "Active user";
      return `
        <tr>
          <td>${worker.name}</td>
          <td>${worker.email}</td>
          <td>${assigned}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAdminUsers(users) {
  if (!Array.isArray(users) || users.length === 0) {
    adminUsersBodyEl.innerHTML = '<tr><td colspan="7" class="muted">No users available.</td></tr>';
    return;
  }

  adminUsersBodyEl.innerHTML = users
    .map((user) => {
      const roleLabel = user.role === "admin" ? "Admin" : "Worker";
      const statusLabel = user.isActive === false ? "Inactive" : "Active";
      const toggleActionLabel = user.isActive === false ? "Activate" : "Deactivate";
      const roleActionLabel = user.role === "admin" ? "Set Worker" : "Promote Admin";

      return `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.staffId}</td>
          <td>${roleLabel}</td>
          <td>${formatDateTime(user.createdAt)}</td>
          <td>${statusLabel}</td>
          <td>
            <button class="ghost tiny" data-action="toggle-active" data-id="${user.id}" data-active="${user.isActive !== false}">${toggleActionLabel}</button>
            <button class="ghost tiny" data-action="toggle-role" data-id="${user.id}" data-role="${user.role}">${roleActionLabel}</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadAdminUsers() {
  if (currentUser?.role !== "admin") return;
  const data = await apiFetch("/api/admin/users");
  renderAdminUsers(data?.users || []);
}

// CRM Workplaces (shared from CRM database)
async function loadCrmWorkplaces() {
  try {
    const data = await apiFetch("/api/crm/workplaces");
    return data?.workplaces || [];
  } catch (error) {
    console.error("Failed to load CRM workplaces:", error.message);
    // Return empty array on error, UI will show message
    return [];
  }
}

async function loadWorkplacesForAdmin() {
  if (currentUser?.role !== "admin") return;

  setError(workplaceErrorEl, "");

  try {
    const crmWorkplaces = await loadCrmWorkplaces();

    if (crmWorkplaces.length === 0) {
      setError(workplaceErrorEl, "CRM database unavailable or no workplaces found. Check CRM_DATABASE_URL configuration.");
      workplacesBodyEl.innerHTML = `<tr><td colspan="8" class="muted">CRM workplaces unavailable. Please check server configuration.</td></tr>`;
      assignWorkplaceSelectEl.innerHTML = '<option value="">Unassigned</option>';
      return;
    }

    renderWorkplaces(crmWorkplaces);

    // Load workers for assignment
    const workersData = await apiFetch("/api/admin/workers");
    const workers = workersData?.workers || [];
    renderAssignSelectors(workers, crmWorkplaces);

    // Load current assignments
    const assignmentsData = await apiFetch("/api/admin/workers/assignments");
    const assignments = assignmentsData?.workers || [];
    renderWorkerAssignments(assignments);
  } catch (error) {
    setError(workplaceErrorEl, error.message);
  }
}

function showCrmUnavailableMessage() {
  workplaceErrorEl.classList.remove("hidden");
  workplaceErrorEl.textContent = "CRM database is unavailable. Please check that CRM_DATABASE_URL is configured on the server.";
  workplacesBodyEl.innerHTML = `<tr><td colspan="8" class="muted">CRM workplaces unavailable. Contact administrator.</td></tr>`;
  assignWorkplaceSelectEl.innerHTML = '<option value="">Unassigned</option>';

  // Disable form
  workplaceFormEl.style.opacity = "0.5";
  workplaceFormEl.style.pointerEvents = "none";
  saveWorkplaceBtnEl.disabled = true;
  resetWorkplaceBtnEl.disabled = true;
}

async function createManagedUser(event) {
  event.preventDefault();
  setError(adminUserErrorEl, "");
  setInfo(adminUserMessageEl, "");

  const payload = {
    firstName: adminUserFirstNameEl.value.trim(),
    lastName: adminUserLastNameEl.value.trim(),
    email: adminUserEmailEl.value.trim(),
    staffId: adminUserStaffIdEl.value.trim(),
    password: adminUserPasswordEl.value,
    confirmPassword: adminUserConfirmPasswordEl.value,
    role: adminUserRoleEl.value,
  };

  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    adminUserFormEl.reset();
    adminUserRoleEl.value = "worker";
    setInfo(adminUserMessageEl, "User created successfully.");
    await loadAdminUsers();
  } catch (error) {
    setError(adminUserErrorEl, error.message);
  }
}

async function handleAdminUsersTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  setError(adminUserErrorEl, "");
  setInfo(adminUserMessageEl, "");

  const userId = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "toggle-active") {
      const currentlyActive = button.dataset.active === "true";
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      setInfo(adminUserMessageEl, `User ${currentlyActive ? "deactivated" : "activated"} successfully.`);
      await loadAdminUsers();
      return;
    }

    if (action === "toggle-role") {
      const currentRole = button.dataset.role;
      const nextRole = currentRole === "admin" ? "worker" : "admin";
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      setInfo(adminUserMessageEl, `User role updated to ${nextRole}.`);
      await loadAdminUsers();
    }
  } catch (error) {
    setError(adminUserErrorEl, error.message);
  }
}

function setAuthMode(mode) {
  const loginMode = mode === "login";
  loginFormViewEl.classList.toggle("hidden", !loginMode);
  signupFormViewEl.classList.toggle("hidden", loginMode);
  showLoginBtnEl.classList.toggle("active", loginMode);
  showSignupBtnEl.classList.toggle("active", !loginMode);
  setError(loginErrorEl, "");
  setError(signupErrorEl, "");
}

function showAdminSections(isAdmin) {
  showWorkplacesBtnEl.classList.toggle("hidden", !isAdmin);
  showUsersBtnEl.classList.toggle("hidden", !isAdmin);
  showTimesheetsBtnEl.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) {
    workplacesSectionEl.classList.add("hidden");
    usersSectionEl.classList.add("hidden");
    timesheetsSectionEl.classList.add("hidden");
    timeClockSectionEl.classList.remove("hidden");
    historySectionEl.classList.remove("hidden");
  }
}

function openScreen(name) {
  const isWorkplaces = name === "workplaces";
  const isUsers = name === "users";
  const isTimesheets = name === "timesheets";
  workplacesSectionEl.classList.toggle("hidden", !isWorkplaces);
  usersSectionEl.classList.toggle("hidden", !isUsers);
  timesheetsSectionEl.classList.toggle("hidden", !isTimesheets);
  timeClockSectionEl.classList.toggle("hidden", isWorkplaces || isUsers || isTimesheets);
  historySectionEl.classList.toggle("hidden", isWorkplaces || isUsers || isTimesheets);

  if (name === "time") {
    requestLocationForTimeClock("time_screen_open").catch(() => {
      // UI is updated by the location flow itself.
    });
  }
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof data === "string" ? data : data?.error || "Request failed";
    throw new Error(message);
  }
  return data;
}

function getLocationErrorMessage(error) {
  if (!error) return "Location unavailable.";
  if (error.code === 1) return "Permission denied";
  if (error.code === 2) return "Position unavailable";
  if (error.code === 3) return "Timed out";
  return error.message || "Location unavailable";
}

function captureLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const payload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date().toISOString(),
        };
        resolve(payload);
      },
      (error) => reject(error),
      GEO_REQUEST_OPTIONS
    );
  });
}

async function updateLocationPermissionState() {
  if (!navigator.permissions?.query) {
    locationPermissionState = "unsupported";
    renderLocationDebug();
    return locationPermissionState;
  }

  try {
    if (!geolocationPermissionStatus) {
      geolocationPermissionStatus = await navigator.permissions.query({ name: "geolocation" });
      geolocationPermissionStatus.onchange = () => {
        locationPermissionState = geolocationPermissionStatus.state;
        lastLocationCheckAt = new Date().toISOString();
        logLocationDiagnostic("permission-change", { state: locationPermissionState });

        if (locationPermissionState === "denied") {
          lastLocationIssue = "Blocked in browser or phone settings";
          renderLocationState("blocked", lastCapturedLocation);
        } else if (isValidLocation(lastCapturedLocation)) {
          renderLocationState("granted", lastCapturedLocation);
        } else {
          renderLocationDebug();
          renderLocationActionHint();
        }
      };
    }

    locationPermissionState = geolocationPermissionStatus.state;
    lastLocationCheckAt = new Date().toISOString();
    logLocationDiagnostic("permission-state", { state: locationPermissionState });
  } catch (error) {
    locationPermissionState = "unsupported";
    logLocationDiagnostic("permission-state-unavailable", { message: error.message });
  }

  renderLocationDebug();
  return locationPermissionState;
}

function resolveLocationFailureState(error) {
  if (!navigator.geolocation) return "unavailable";
  if (error?.code === 1) return locationPermissionState === "denied" ? "blocked" : "denied";
  if (error?.code === 3) return "timeout";
  return "unavailable";
}

function getLocationFailureUserMessage(status) {
  if (status === "blocked") {
    return "Location is blocked. Turn on phone Location Services, allow Safari or Chrome to use location for this site, reopen the page, then tap Retry / Refresh Location.";
  }

  if (status === "denied") {
    return "Location permission was denied. Allow it and tap Retry / Refresh Location to continue.";
  }

  if (status === "timeout") {
    return "Location request timed out. Move to a clearer signal and try Retry / Refresh Location again.";
  }

  return "Location is unavailable. Check GPS/network location on your phone, then retry.";
}

async function requestCurrentLocation({ reason, force = false, silent = false } = {}) {
  await updateLocationPermissionState();

  if (!force && isFreshLocation(lastCapturedLocation)) {
    renderLocationState("granted", lastCapturedLocation);
    return lastCapturedLocation;
  }

  if (locationPermissionState === "denied") {
    lastLocationIssue = "Blocked in browser or phone settings";
    renderLocationState("blocked", lastCapturedLocation);
    if (!silent && LOCATION_REQUIRED) {
      throw new Error(getLocationFailureUserMessage("blocked"));
    }
    return null;
  }

  renderLocationState("requesting", lastCapturedLocation);
  lastLocationCheckAt = new Date().toISOString();
  logLocationDiagnostic("request-start", {
    reason,
    permission: locationPermissionState,
    hadCachedLocation: isValidLocation(lastCapturedLocation),
  });

  try {
    const location = await captureLocation();
    lastCapturedLocation = location;
    locationPermissionState = "granted";
    lastLocationIssue = "";
    lastLocationCheckAt = location.capturedAt;
    logLocationDiagnostic("request-success", {
      reason,
      accuracy: location.accuracy,
      fresh: isFreshLocation(location),
    });
    renderLocationState("granted", location);
    return location;
  } catch (error) {
    const state = resolveLocationFailureState(error);
    lastLocationIssue = getLocationErrorMessage(error);
    lastLocationCheckAt = new Date().toISOString();
    logLocationDiagnostic("request-error", {
      reason,
      state,
      code: error?.code || null,
      message: getLocationErrorMessage(error),
    });
    renderLocationState(state, lastCapturedLocation);
    if (!silent && LOCATION_REQUIRED) {
      throw new Error(getLocationFailureUserMessage(state));
    }
    return null;
  }
}

async function requestLocationForTimeClock(reason) {
  if (!LOCATION_REQUIRED || !currentUser || currentUser.role === "admin") {
    renderStatus(currentStatus);
    return null;
  }

  try {
    return await requestCurrentLocation({ reason, force: !isFreshLocation(lastCapturedLocation), silent: true });
  } finally {
    renderStatus(currentStatus);
  }
}

async function ensureClockInLocation() {
  if (isFreshLocation(lastCapturedLocation)) {
    renderLocationState("granted", lastCapturedLocation);
    return lastCapturedLocation;
  }

  try {
    return await requestCurrentLocation({ reason: "clock_in_first_attempt", force: true, silent: false });
  } catch (firstError) {
    logLocationDiagnostic("clock-in-retry", { message: firstError.message });
    return requestCurrentLocation({ reason: "clock_in_retry", force: true, silent: false });
  }
}

function setLoggedOutState() {
  authToken = "";
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  loginViewEl.classList.remove("hidden");
  appViewEl.classList.add("hidden");
  identifierEl.value = "";
  passwordEl.value = "";
  signupFirstNameEl.value = "";
  signupLastNameEl.value = "";
  signupEmailEl.value = "";
  signupPhoneEl.value = "";
  signupPasswordEl.value = "";
  signupConfirmPasswordEl.value = "";
  lastCapturedLocation = null;
  lastLocationIssue = "";
  lastLocationCheckAt = null;
  renderLocationState(locationPermissionState === "denied" ? "blocked" : "unavailable");
  renderGeofenceInfo(null);
  renderAssignedWorkplaceInfo(null);
  lastLocationDetailsEl.textContent = "No location captured yet.";
  setAuthMode("login");
}

function setLoggedInState() {
  loginViewEl.classList.add("hidden");
  appViewEl.classList.remove("hidden");
}

async function loadStatus() {
  const data = await apiFetch("/api/time/status");
  currentUser = data?.user || null;
  workerNameEl.textContent = data?.user?.name || "Worker";
  renderStatus(data?.status);
  renderAssignedWorkplaceInfo(data?.workplaceAssignment || null);
  showAdminSections(data?.user?.role === "admin");
}

async function loadHistory() {
  const data = await apiFetch("/api/time/shifts");
  renderHistory(data?.shifts || []);
}

async function loadWorkplaces() {
  if (currentUser?.role !== "admin") return;
  const data = await apiFetch("/api/workplaces?includeInactive=true");
  renderWorkplaces(data?.workplaces || []);
}

async function loadWorkerAssignments() {
  if (currentUser?.role !== "admin") return;

  const [workersData, workplacesData] = await Promise.all([
    apiFetch("/api/admin/workers"),
    apiFetch("/api/admin/assignable-workplaces"),
  ]);

  const workers = workersData?.workers || [];
  const workplaces = workplacesData?.workplaces || [];

  renderAssignSelectors(workers, workplaces);
  renderWorkerAssignments(workers);
}

async function doAction(actionType) {
  setError(actionErrorEl, "");
  const notes = notesEl.value.trim();
  const location =
    actionType === "clock_in"
      ? await ensureClockInLocation()
      : await requestCurrentLocation({ reason: actionType, force: true, silent: false });

  if (LOCATION_REQUIRED && !isFreshLocation(location)) {
    const message = "Clock In requires a fresh location. Tap Retry / Refresh Location and try again.";
    setError(actionErrorEl, message);
    throw new Error(message);
  }

  const actionResult = await apiFetch("/api/time/actions", {
    method: "POST",
    body: JSON.stringify({
      actionType,
      notes: notes || undefined,
      location: location || undefined,
    }),
  });

  renderGeofenceInfo(actionResult?.geofenceEvaluation || null);

  notesEl.value = "";
  await Promise.all([loadStatus(), loadHistory()]);
}

async function refreshLocation() {
  setError(actionErrorEl, "");
  try {
    await requestCurrentLocation({ reason: "manual_refresh", force: true, silent: false });
    renderStatus(currentStatus);
  } catch (error) {
    setError(actionErrorEl, error.message);
    renderStatus(currentStatus);
  }
}

async function refreshLocationSilently() {
  try {
    await requestLocationForTimeClock("silent_refresh");
  } catch {
    // Keep existing status UI and button gating when location is unavailable.
  } finally {
    renderStatus(currentStatus);
  }
}

async function login() {
  setError(loginErrorEl, "");
  const identifier = identifierEl.value.trim();
  const password = passwordEl.value;

  if (!identifier) return setError(loginErrorEl, "Staff ID or email is required.");
  if (!password) return setError(loginErrorEl, "Password is required.");

  const data = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });

  authToken = data.token;
  localStorage.setItem(TOKEN_KEY, authToken);
  setLoggedInState();
  openScreen("time");
  await Promise.all([loadStatus(), loadHistory()]);
  await requestLocationForTimeClock("worker_login");
}

async function loginAsAdmin() {
  setError(loginErrorEl, "");
  const identifier = identifierEl.value.trim();
  const password = passwordEl.value;

  if (!identifier) return setError(loginErrorEl, "Email or staff ID is required.");
  if (!password) return setError(loginErrorEl, "Password is required.");

  const data = await apiFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });

  authToken = data.token;
  localStorage.setItem(TOKEN_KEY, authToken);
  setLoggedInState();
  await Promise.all([loadStatus(), loadHistory()]);

  openScreen("users");
  await loadAdminUsers();
}

function startGoogleLogin() {
  setError(loginErrorEl, "");
  window.location.assign(`${API_BASE_URL}/api/auth/google`);
}

async function requireAdminAccessForScreen(errorEl) {
  const access = await apiFetch("/api/admin/access");
  if (!access?.authenticated) {
    throw new Error("Authentication required");
  }
  if (!access?.isAdmin) {
    throw new Error("Forbidden: admin access required");
  }
  if (errorEl) setError(errorEl, "");
}

async function signup() {
  setError(signupErrorEl, "");
  const payload = {
    firstName: signupFirstNameEl.value.trim(),
    lastName: signupLastNameEl.value.trim(),
    email: signupEmailEl.value.trim(),
    phone: signupPhoneEl.value.trim() || undefined,
    password: signupPasswordEl.value,
    confirmPassword: signupConfirmPasswordEl.value,
  };

  if (!payload.firstName || !payload.lastName || !payload.email) {
    setError(signupErrorEl, "First name, last name, and email are required.");
    return;
  }
  if (!payload.password) {
    setError(signupErrorEl, "Password is required.");
    return;
  }

  const data = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  authToken = data.token;
  localStorage.setItem(TOKEN_KEY, authToken);
  setLoggedInState();
  openScreen("time");
  await Promise.all([loadStatus(), loadHistory()]);
  await requestLocationForTimeClock("worker_signup");
}

async function handleWorkplaceFormSubmit(event) {
  event.preventDefault();
  setError(workplaceErrorEl, "Workplaces are managed in the CRM system. Edit them there and refresh this page.");
}

async function saveWorkerAssignment() {
  setError(assignmentErrorEl, "");
  const workerUserId = assignWorkerSelectEl.value;
  const workplaceId = assignWorkplaceSelectEl.value || null;

  if (!workerUserId) {
    setError(assignmentErrorEl, "Select a worker first.");
    return;
  }

  try {
    await apiFetch(`/api/admin/workers/${workerUserId}/workplace`, {
      method: "PATCH",
      body: JSON.stringify({ workplaceId }),
    });

    await Promise.all([loadWorkerAssignments(), loadStatus()]);
  } catch (error) {
    setError(assignmentErrorEl, error.message);
  }
}

function handleWorkplaceTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  setError(workplaceErrorEl, "CRM workplaces are read-only. Edit them in the CRM system.");
}

async function initFromSession() {
  if (!authToken) {
    setLoggedOutState();
    return;
  }

  try {
    await Promise.all([loadStatus(), loadHistory()]);
    setLoggedInState();
    if (currentUser?.role !== "admin") {
      openScreen("time");
      await requestLocationForTimeClock("session_restore");
    }
  } catch (error) {
    setLoggedOutState();
  }
}

function startLiveClock() {
  const render = () => {
    liveClockEl.textContent = new Date().toLocaleString();
    renderStatus(currentStatus);
  };
  render();
  liveClockIntervalId = setInterval(render, 1000);
}

showLoginBtnEl.addEventListener("click", () => setAuthMode("login"));
showSignupBtnEl.addEventListener("click", () => setAuthMode("signup"));

loginBtnEl.addEventListener("click", () => {
  login().catch((error) => setError(loginErrorEl, error.message));
});
adminLoginBtnEl.addEventListener("click", () => {
  loginAsAdmin().catch((error) => setError(loginErrorEl, error.message));
});
googleLoginBtnEl.addEventListener("click", startGoogleLogin);
signupBtnEl.addEventListener("click", () => {
  signup().catch((error) => setError(signupErrorEl, error.message));
});

logoutBtnEl.addEventListener("click", () => setLoggedOutState());

showTimeClockBtnEl.addEventListener("click", () => openScreen("time"));
showWorkplacesBtnEl.addEventListener("click", () => {
  openScreen("workplaces");
  requireAdminAccessForScreen(workplaceErrorEl)
    .then(() => loadWorkplacesForAdmin())
    .catch((error) => setError(workplaceErrorEl, error.message));
});
showUsersBtnEl.addEventListener("click", () => {
  openScreen("users");
  requireAdminAccessForScreen(adminUserErrorEl)
    .then(() => loadAdminUsers())
    .catch((error) => setError(adminUserErrorEl, error.message));
});
showTimesheetsBtnEl.addEventListener("click", () => {
  openScreen("timesheets");
  requireAdminAccessForScreen(timesheetErrorEl)
    .then(() => initTimesheetsScreen())
    .catch((error) => setError(timesheetErrorEl, error.message));
});

clockInBtnEl.addEventListener("click", () => {
  doAction("clock_in").catch((error) => setError(actionErrorEl, error.message));
});
startBreakBtnEl.addEventListener("click", () => {
  doAction("break_start").catch((error) => setError(actionErrorEl, error.message));
});
endBreakBtnEl.addEventListener("click", () => {
  doAction("break_end").catch((error) => setError(actionErrorEl, error.message));
});
clockOutBtnEl.addEventListener("click", () => {
  doAction("clock_out").catch((error) => setError(actionErrorEl, error.message));
});

refreshHistoryBtnEl.addEventListener("click", () => {
  loadHistory().catch((error) => setError(actionErrorEl, error.message));
});
refreshLocationBtnEl.addEventListener("click", () => {
  refreshLocation();
});

refreshWorkplacesBtnEl.addEventListener("click", () => {
  loadWorkplacesForAdmin().catch((error) =>
    setError(workplaceErrorEl, error.message)
  );
});

refreshUsersBtnEl.addEventListener("click", () => {
  requireAdminAccessForScreen(adminUserErrorEl)
    .then(() => loadAdminUsers())
    .catch((error) => setError(adminUserErrorEl, error.message));
});

saveAssignmentBtnEl.addEventListener("click", () => {
  saveWorkerAssignment();
});

workplaceFormEl.addEventListener("submit", handleWorkplaceFormSubmit);
resetWorkplaceBtnEl.addEventListener("click", () => {
  resetWorkplaceForm();
  setError(workplaceErrorEl, "");
});
workplacesBodyEl.addEventListener("click", (event) => {
  handleWorkplaceTableClick(event);
});
adminUserFormEl.addEventListener("submit", createManagedUser);
adminUsersBodyEl.addEventListener("click", (event) => {
  handleAdminUsersTableClick(event);
});
historyBodyEl.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-latitude][data-longitude]");
  if (!row) return;

  const latitude = Number(row.dataset.latitude);
  const longitude = Number(row.dataset.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  updateMapPreview(
    { latitude, longitude },
    row.dataset.label || "History location preview"
  );
});

// ─── Admin Timesheets ────────────────────────────────────────────────────────

const tsDateFromEl = document.getElementById("tsDateFrom");
const tsDateToEl = document.getElementById("tsDateTo");
const tsSearchEl = document.getElementById("tsSearch");
const tsWorkplaceFilterEl = document.getElementById("tsWorkplaceFilter");
const tsStatusFilterEl = document.getElementById("tsStatusFilter");
const applyTimesheetFiltersBtnEl = document.getElementById("applyTimesheetFiltersBtn");
const clearTimesheetFiltersBtnEl = document.getElementById("clearTimesheetFiltersBtn");
const timesheetsBodyEl = document.getElementById("timesheetsBody");
const timesheetsPaginationEl = document.getElementById("timesheetsPagination");
const timesheetErrorEl = document.getElementById("timesheetError");
const exportTimesheetsCsvBtnEl = document.getElementById("exportTimesheetsCsvBtn");
const refreshTimesheetsBtnEl = document.getElementById("refreshTimesheetsBtn");
const timesheetDetailPanelEl = document.getElementById("timesheetDetailPanel");
const timesheetDetailContentEl = document.getElementById("timesheetDetailContent");
const closeTimesheetDetailBtnEl = document.getElementById("closeTimesheetDetailBtn");

let timesheetsCurrentPage = 1;
let timesheetsLastFilters = {};

function buildTimesheetQueryString(filters, page) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.workplaceId) params.set("workplaceId", filters.workplaceId);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(page || 1));
  params.set("limit", "50");
  return params.toString();
}

function readTimesheetFilters() {
  return {
    dateFrom: tsDateFromEl.value || "",
    dateTo: tsDateToEl.value || "",
    search: tsSearchEl.value.trim(),
    workplaceId: tsWorkplaceFilterEl.value || "",
    status: tsStatusFilterEl.value || "",
  };
}

function clearTimesheetFilters() {
  tsDateFromEl.value = "";
  tsDateToEl.value = "";
  tsSearchEl.value = "";
  tsWorkplaceFilterEl.value = "";
  tsStatusFilterEl.value = "";
}

function statusBadgeHtml(status) {
  if (status === "completed") return `<span class="status-badge-completed">Completed</span>`;
  if (status === "open_shift") return `<span class="status-badge-open">Open shift</span>`;
  if (status === "missing_break_end") return `<span class="status-badge-missing">Missing break end</span>`;
  return `<span class="status-badge-warn">${status || "—"}</span>`;
}

function formatBreakList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "—";
  return arr.map(formatDateTime).join("<br>");
}

function renderTimesheets(timesheets) {
  if (!Array.isArray(timesheets) || timesheets.length === 0) {
    timesheetsBodyEl.innerHTML = `<tr><td colspan="14" class="muted">No timesheets found.</td></tr>`;
    return;
  }

  timesheetsBodyEl.innerHTML = timesheets.map((ts) => {
    const noLocFlag = ts.noLocation ? ` <span class="status-badge-missing" title="No location">&#9888; No loc</span>` : "";
    const lowAccFlag = ts.lowAccuracy ? ` <span class="status-badge-warn" title="Low accuracy (&gt;50m)">&#9888; Low acc</span>` : "";
    const locationCell = ts.locationSummary
      ? `${ts.locationSummary}${noLocFlag}${lowAccFlag}`
      : `<span class="muted">—</span>${noLocFlag}`;

    return `
      <tr class="ts-row" data-shiftid="${ts.shiftId}">
        <td>${ts.workerName || "—"}</td>
        <td>${ts.workerStaffId || "—"}</td>
        <td>${ts.date || "—"}</td>
        <td>${statusBadgeHtml(ts.status)}</td>
        <td>${formatDateTime(ts.clockInAt)}</td>
        <td>${formatBreakList(ts.breakStartAt)}</td>
        <td>${formatBreakList(ts.breakEndAt)}</td>
        <td>${formatDateTime(ts.clockOutAt)}</td>
        <td>${ts.rawDuration || formatDurationMinutes(ts.totalMinutes)}</td>
        <td>${formatHours(ts.actualHours)}</td>
        <td>${formatHours(ts.payableHours)}</td>
        <td>${ts.workplaceName || "—"}</td>
        <td>${locationCell}</td>
        <td>${ts.clockInNotes || ts.clockOutNotes || "—"}</td>
      </tr>`;
  }).join("");
}

function renderTimesheetsPagination(pagination) {
  if (!pagination) {
    timesheetsPaginationEl.innerHTML = "";
    return;
  }

  const { total, page, limit, totalPages } = pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  timesheetsPaginationEl.innerHTML = `
    <button id="tsPrevBtn" class="ghost small" ${page <= 1 ? "disabled" : ""}>&#8592; Prev</button>
    <span>Showing ${start}&#8211;${end} of ${total}</span>
    <button id="tsNextBtn" class="ghost small" ${page >= totalPages ? "disabled" : ""}>Next &#8594;</button>
  `;

  document.getElementById("tsPrevBtn").addEventListener("click", () => {
    loadTimesheets(timesheetsLastFilters, page - 1);
  });
  document.getElementById("tsNextBtn").addEventListener("click", () => {
    loadTimesheets(timesheetsLastFilters, page + 1);
  });
}

async function loadTimesheets(filters, page) {
  setError(timesheetErrorEl, "");
  timesheetsLastFilters = filters;
  timesheetsCurrentPage = page || 1;

  const qs = buildTimesheetQueryString(filters, timesheetsCurrentPage);
  const data = await apiFetch(`/api/admin/timesheets?${qs}`);
  renderTimesheets(data?.timesheets || []);
  renderTimesheetsPagination(data?.pagination || null);
}

async function populateWorkplaceFilter() {
  try {
    const data = await apiFetch("/api/admin/assignable-workplaces");
    const workplaces = data?.workplaces || [];
    const dynamics = tsWorkplaceFilterEl.querySelectorAll("option[data-dynamic]");
    dynamics.forEach((o) => o.remove());
    workplaces.forEach((wp) => {
      const opt = document.createElement("option");
      opt.value = wp.id;
      opt.textContent = wp.name;
      opt.dataset.dynamic = "1";
      tsWorkplaceFilterEl.appendChild(opt);
    });
  } catch {
    // non-critical — filters still work without workplace list
  }
}

async function initTimesheetsScreen() {
  setError(timesheetErrorEl, "");
  clearTimesheetFilters();
  timesheetDetailPanelEl.classList.add("hidden");
  await populateWorkplaceFilter();
  await loadTimesheets({}, 1);
}

function renderTimesheetDetail(detail) {
  const field = (label, value) => `
    <div class="detail-item">
      <div class="label">${label}</div>
      <div class="value">${value == null || value === "" ? "—" : value}</div>
    </div>`;

  const geofenceStr = detail.withinGeofence != null
    ? (detail.withinGeofence ? "&#10003; Within" : "&#10007; Outside")
    : "n/a";

  const distanceStr = typeof detail.distanceMeters === "number"
    ? `${detail.distanceMeters.toFixed(2)} m`
    : "n/a";

  const accuracyStr = typeof detail.locationAccuracy === "number"
    ? `${detail.locationAccuracy.toFixed(1)} m`
    : "n/a";

  const summaryHtml = `
    <div class="detail-grid">
      ${field("Shift ID", detail.shiftId)}
      ${field("Worker", detail.workerName)}
      ${field("Staff ID", detail.workerStaffId)}
      ${field("Email", detail.workerEmail)}
      ${field("Date", detail.date)}
      ${field("Status", detail.status)}
      ${field("Clock In", formatDateTime(detail.clockInAt))}
      ${field("Clock Out", formatDateTime(detail.clockOutAt))}
      ${field("Raw Duration", detail.rawDuration || formatDurationMinutes(detail.totalMinutes))}
      ${field("Actual Hours", formatHours(detail.actualHours))}
      ${field("Payable Hours", formatHours(detail.payableHours))}
      ${field("Break Minutes", typeof detail.breakMinutes === "number" ? detail.breakMinutes : "—")}
      ${field("Workplace", detail.workplaceName)}
      ${field("Geofence", geofenceStr)}
      ${field("Distance", distanceStr)}
      ${field("Location", detail.locationSummary || "—")}
      ${field("Location Accuracy", accuracyStr)}
      ${field("Clock-In Notes", detail.clockInNotes || "—")}
      ${field("Clock-Out Notes", detail.clockOutNotes || "—")}
    </div>`;

  const actionsHtml = Array.isArray(detail.actions) && detail.actions.length > 0
    ? `<h3 style="margin:12px 0 6px">Action History</h3>
       <div class="table-wrap">
         <table class="detail-actions-table">
           <thead>
             <tr>
               <th>Action</th>
               <th>Timestamp</th>
               <th>Location</th>
               <th>Accuracy</th>
               <th>Captured At</th>
               <th>Workplace</th>
               <th>Distance</th>
               <th>Within</th>
               <th>Notes</th>
             </tr>
           </thead>
           <tbody>
             ${detail.actions.map((a) => {
               const loc = a.location;
               const locStr = loc && typeof loc.latitude === "number"
                 ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
                 : "—";
               const accStr = loc && typeof loc.accuracy === "number"
                 ? `${loc.accuracy.toFixed(1)} m`
                 : "—";
               const geo = a.geofence;
               const distStr = geo && typeof geo.distanceMeters === "number"
                 ? `${geo.distanceMeters.toFixed(2)} m`
                 : "—";
               const withinStr = geo && typeof geo.withinGeofence === "boolean"
                 ? (geo.withinGeofence ? "&#10003;" : "&#10007;")
                 : "—";
               return `<tr>
                 <td>${toActionLabel(a.actionType)}</td>
                 <td>${formatDateTime(a.timestamp)}</td>
                 <td>${locStr}</td>
                 <td>${accStr}</td>
                 <td>${formatDateTime(loc ? loc.capturedAt : null)}</td>
                 <td>${geo ? (geo.workplaceName || "—") : "—"}</td>
                 <td>${distStr}</td>
                 <td>${withinStr}</td>
                 <td>${a.notes || "—"}</td>
               </tr>`;
             }).join("")}
           </tbody>
         </table>
       </div>`
    : `<p class="muted">No action logs found for this shift.</p>`;

  timesheetDetailContentEl.innerHTML = summaryHtml + actionsHtml;
  timesheetDetailPanelEl.classList.remove("hidden");
  timesheetDetailPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadTimesheetDetail(shiftId) {
  setError(timesheetErrorEl, "");
  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}`);
    renderTimesheetDetail(data.timesheet);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
  }
}

applyTimesheetFiltersBtnEl.addEventListener("click", () => {
  const filters = readTimesheetFilters();
  loadTimesheets(filters, 1).catch((error) => setError(timesheetErrorEl, error.message));
});

clearTimesheetFiltersBtnEl.addEventListener("click", () => {
  clearTimesheetFilters();
  loadTimesheets({}, 1).catch((error) => setError(timesheetErrorEl, error.message));
});

refreshTimesheetsBtnEl.addEventListener("click", () => {
  const filters = readTimesheetFilters();
  loadTimesheets(filters, timesheetsCurrentPage).catch((error) => setError(timesheetErrorEl, error.message));
});

exportTimesheetsCsvBtnEl.addEventListener("click", () => {
  const filters = readTimesheetFilters();
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);
  if (filters.workplaceId) params.set("workplaceId", filters.workplaceId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();

  apiFetch(`/api/admin/timesheets/export/csv${qs ? "?" + qs : ""}`, { headers: { Accept: "text/csv" } })
    .then((text) => {
      if (typeof text !== "string") throw new Error("Unexpected response from CSV export");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `timesheets-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    })
    .catch((error) => setError(timesheetErrorEl, error.message));
});

timesheetsBodyEl.addEventListener("click", (event) => {
  const row = event.target.closest("tr.ts-row[data-shiftid]");
  if (!row) return;
  loadTimesheetDetail(row.dataset.shiftid);
});

closeTimesheetDetailBtnEl.addEventListener("click", () => {
  timesheetDetailPanelEl.classList.add("hidden");
});

// ─── End Admin Timesheets ─────────────────────────────────────────────────────

startLiveClock();
resetWorkplaceForm();
showMapPlaceholder("Location not captured yet.", "Waiting for location");
consumeAuthErrorFromUrl();
updateLocationPermissionState().catch(() => {
  locationPermissionState = "unsupported";
  renderLocationDebug();
});
initFromSession();

window.addEventListener("beforeunload", () => {
  if (liveClockIntervalId) clearInterval(liveClockIntervalId);
});
