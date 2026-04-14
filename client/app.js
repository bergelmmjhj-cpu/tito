const loginViewEl = document.getElementById("loginView");
const appViewEl = document.getElementById("appView");
const loginFormViewEl = document.getElementById("loginFormView");
const signupFormViewEl = document.getElementById("signupFormView");
const showLoginBtnEl = document.getElementById("showLoginBtn");
const showSignupBtnEl = document.getElementById("showSignupBtn");

const identifierEl = document.getElementById("identifier");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
const googleLoginBtnEl = document.getElementById("googleLoginBtn");
const loginErrorEl = document.getElementById("loginError");
const loginHelpTextEl = document.getElementById("loginHelpText");
const authDividerEl = document.getElementById("authDivider");

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
const workerStatusTextEl = document.getElementById("workerStatusText");
const assignedWorkplaceInfoEl = document.getElementById("assignedWorkplaceInfo");
const geofenceInfoEl = document.getElementById("geofenceInfo");
const actionErrorEl = document.getElementById("actionError");
const actionFeedbackEl = document.getElementById("actionFeedback");
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
let actionInProgress = null;
let actionUiResetTimer = null;
let latestGeofenceEvaluation = null;
let authOptions = {
  unifiedLogin: true,
  providers: {
    google: {
      enabled: false,
    },
  },
};

const ACTION_BUTTONS = {
  clock_in: clockInBtnEl,
  break_start: startBreakBtnEl,
  break_end: endBreakBtnEl,
  clock_out: clockOutBtnEl,
};

const ACTION_LABELS = {
  clock_in: "Clock In",
  break_start: "Start Break",
  break_end: "End Break",
  clock_out: "Clock Out",
};

for (const [actionType, button] of Object.entries(ACTION_BUTTONS)) {
  if (!button) continue;
  button.dataset.actionType = actionType;
  button.dataset.defaultLabel = ACTION_LABELS[actionType];
}

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

function setInlineFeedback(el, message, tone = "info") {
  if (!el) return;
  el.textContent = message || "";
  el.className = `action-feedback ${tone}`;
  el.classList.toggle("hidden", !message);
}

function setActionFeedback(message, tone = "info") {
  setInlineFeedback(actionFeedbackEl, message, tone);
}

function resetActionButtonVisualState() {
  if (actionUiResetTimer) {
    clearTimeout(actionUiResetTimer);
    actionUiResetTimer = null;
  }

  for (const button of Object.values(ACTION_BUTTONS)) {
    if (!button) continue;
    button.classList.remove("is-loading", "is-success", "is-failure");
    if (button.dataset.defaultLabel) {
      button.textContent = button.dataset.defaultLabel;
    }
  }
}

function beginActionVisualState(actionType) {
  const button = ACTION_BUTTONS[actionType];
  if (!button) return;

  actionInProgress = actionType;
  resetActionButtonVisualState();
  button.classList.add("is-loading");
  button.textContent = `${button.dataset.defaultLabel || ACTION_LABELS[actionType]}...`;
  renderStatus(currentStatus);
}

function completeActionVisualState(actionType, isSuccess) {
  const button = ACTION_BUTTONS[actionType];
  actionInProgress = null;
  renderStatus(currentStatus);

  if (!button) return;

  button.classList.remove("is-loading");
  button.classList.add(isSuccess ? "is-success" : "is-failure");
  if (isSuccess) {
    button.textContent = `${button.dataset.defaultLabel || ACTION_LABELS[actionType]} Done`;
  }

  actionUiResetTimer = setTimeout(() => {
    resetActionButtonVisualState();
    renderStatus(currentStatus);
  }, isSuccess ? 1400 : 2200);
}

function logLocationDiagnostic(event, details = {}) {
  console.info("[geo]", event, details);
}

function formatHours(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function triggerCsvDownload(text, fileName) {
  if (typeof text !== "string") throw new Error("Unexpected response from CSV export");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName || `timesheets-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
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

function formatDateTimeInputValue(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function parseDateTimeLocalToIso(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (actionType === "admin_review") return "Manager Review";
  if (actionType === "admin_close_shift") return "Manager Closed Shift";
  if (actionType === "admin_end_break") return "Manager Ended Break";
  if (actionType === "admin_payable_adjustment") return "Manager Adjusted Payable Hours";
  if (actionType === "admin_payroll_approved") return "Payroll Approved";
  if (actionType === "admin_payroll_exported") return "Payroll Exported";
  if (actionType === "admin_payroll_reopened") return "Payroll Reopened";
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

  const setWorkerStatusText = () => {
    if (!workerStatusTextEl) return;
    if (latestGeofenceEvaluation?.reviewFlag === "outside_geofence") {
      workerStatusTextEl.textContent = "Outside assigned workplace area. Action was saved and flagged for admin review.";
      return;
    }
    if (latestGeofenceEvaluation?.workplaceResolution === "unresolved") {
      workerStatusTextEl.textContent = "No workplace assigned; contact admin.";
      return;
    }
    if (currentStatus === "on_break") {
      workerStatusTextEl.textContent = "You are on break. End break when you return to work.";
      return;
    }
    if (currentStatus === "clocked_in") {
      workerStatusTextEl.textContent = "You are currently clocked in.";
      return;
    }
    if (currentStatus === "clocked_out") {
      workerStatusTextEl.textContent = "Shift completed. Clock in when your next shift starts.";
      return;
    }

    const noAssigned = !currentUser?.assignedWorkplaceId;
    if (noAssigned) {
      workerStatusTextEl.textContent = "Ready to clock in. No workplace assigned; contact admin if needed.";
      return;
    }
    workerStatusTextEl.textContent = "Ready to clock in.";
  };

  const setVisibleActions = () => {
    const show = {
      clock_in: currentStatus === "not_clocked_in" || currentStatus === "clocked_out",
      break_start: currentStatus === "clocked_in",
      break_end: currentStatus === "on_break",
      clock_out: currentStatus === "clocked_in",
    };

    for (const [actionType, button] of Object.entries(ACTION_BUTTONS)) {
      if (!button) continue;
      button.classList.toggle("hidden", !show[actionType]);
      button.classList.toggle("primary-action", show[actionType]);
    }

    // When clocked in, keep Clock Out visible but de-emphasized.
    clockOutBtnEl.classList.toggle("primary-action", false);
    clockOutBtnEl.classList.toggle("ghost", currentStatus === "clocked_in");
  };

  if (actionInProgress) {
    clockInBtnEl.disabled = true;
    startBreakBtnEl.disabled = true;
    endBreakBtnEl.disabled = true;
    clockOutBtnEl.disabled = true;
    setVisibleActions();
    setWorkerStatusText();
    renderLocationActionHint();
    return;
  }

  const canClockInByStatus = currentStatus === "not_clocked_in" || currentStatus === "clocked_out";
  clockInBtnEl.disabled = !canClockInByStatus || (LOCATION_REQUIRED && !isFreshLocation(lastCapturedLocation));
  startBreakBtnEl.disabled = currentStatus !== "clocked_in";
  endBreakBtnEl.disabled = currentStatus !== "on_break";
  clockOutBtnEl.disabled = currentStatus !== "clocked_in";
  setVisibleActions();
  setWorkerStatusText();
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
  latestGeofenceEvaluation = geofenceEvaluation || null;

  if (!geofenceEvaluation) {
    geofenceInfoEl.textContent = "Distance check: not evaluated yet";
    return;
  }

  if (!geofenceEvaluation.assignmentRequired) {
    if (geofenceEvaluation.workplaceResolution === "nearest" && geofenceEvaluation.workplaceName) {
      geofenceInfoEl.textContent = `No assigned workplace. Linked to nearest workplace: ${geofenceEvaluation.workplaceName}.`;
      return;
    }

    geofenceInfoEl.textContent = "No assigned workplace linked yet.";
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

  const reviewNote = geofenceEvaluation.reviewFlag === "outside_geofence"
    ? " Review: outside assigned workplace area."
    : "";

  geofenceInfoEl.textContent = `Distance check (${workplaceName}): ${distanceText} vs radius ${radiusText} (${withinText}).${reviewNote}`;
}

function renderHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    historyBodyEl.innerHTML = `<tr><td colspan="6" class="muted">No attendance history yet.</td></tr>`;
    return;
  }

  historyBodyEl.innerHTML = history
    .map((item) => {
      const breakSummary = item.breakStart?.length
        ? `${item.breakStart.length} break${item.breakStart.length > 1 ? "s" : ""}`
        : "—";
      return `
        <tr>
          <td data-label="Business Date">${item.date || "—"}</td>
          <td data-label="Workplace">${item.workplaceName || "—"}</td>
          <td data-label="Clock In">${formatDateTime(item.timeIn)}</td>
          <td data-label="Break">${breakSummary}</td>
          <td data-label="Clock Out">${formatDateTime(item.timeOut)}</td>
          <td data-label="Total Hours">${formatHours(item.actualHours)}</td>
        </tr>
      `;
    })
    .join("");
}

function toWorkplaceLocationLabel(item) {
  const parts = [item.city, item.state, item.country].filter((x) => typeof x === "string" && x.trim());
  if (parts.length > 0) return parts.join(", ");
  if (item.address && String(item.address).trim()) return item.address;
  return "Location not provided";
}

function renderWorkplaces(workplaces, workers = []) {
  if (!Array.isArray(workplaces) || workplaces.length === 0) {
    workplacesBodyEl.innerHTML = `<tr><td colspan="7" class="muted">No workplaces yet.</td></tr>`;
    return;
  }

  const assignmentCounts = workers.reduce((map, worker) => {
    const workplaceId = worker?.assignedWorkplace?.id;
    if (!workplaceId) return map;
    map.set(workplaceId, (map.get(workplaceId) || 0) + 1);
    return map;
  }, new Map());

  workplacesBodyEl.innerHTML = workplaces
    .map((item) => {
      const statusText = item.active === false ? "Inactive" : "Active";
      const assignmentCount = assignmentCounts.get(item.id) || 0;
      return `
        <tr>
          <td>${item.name}</td>
          <td>${toWorkplaceLocationLabel(item)}</td>
          <td>${formatCoordinates(item.latitude, item.longitude)}</td>
          <td>${item.geofenceRadiusMeters} m</td>
          <td>${statusText}</td>
          <td>${assignmentCount}</td>
          <td>
            <button class="ghost tiny" data-action="view" data-id="${item.id}">View</button>
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
    // Load workers first so assignment table is always visible even if workplaces are unavailable.
    const workersData = await apiFetch("/api/admin/workers");
    const workers = workersData?.workers || [];

    const crmWorkplaces = await loadCrmWorkplaces();

    if (crmWorkplaces.length === 0) {
      setError(workplaceErrorEl, "CRM database unavailable or no workplaces found. Check CRM_DATABASE_URL configuration.");
      workplacesBodyEl.innerHTML = `<tr><td colspan="7" class="muted">CRM workplaces unavailable. Please check server configuration.</td></tr>`;
      assignWorkplaceSelectEl.innerHTML = '<option value="">Unassigned</option>';
      renderAssignSelectors(workers, []);
      renderWorkerAssignments(workers);
      return;
    }

    renderWorkplaces(crmWorkplaces, workers);
    renderAssignSelectors(workers, crmWorkplaces);
    renderWorkerAssignments(workers);
  } catch (error) {
    setError(workplaceErrorEl, error.message);
  }
}

function showCrmUnavailableMessage() {
  workplaceErrorEl.classList.remove("hidden");
  workplaceErrorEl.textContent = "CRM database is unavailable. Please check that CRM_DATABASE_URL is configured on the server.";
  workplacesBodyEl.innerHTML = `<tr><td colspan="7" class="muted">CRM workplaces unavailable. Contact administrator.</td></tr>`;
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
  console.info("[history] response", {
    userId: data?.user?.id || null,
    rowCount: Array.isArray(data?.shifts) ? data.shifts.length : 0,
    payload: data,
  });
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
  setActionFeedback("", "info");

  beginActionVisualState(actionType);

  const actionLabel = ACTION_LABELS[actionType] || "Action";
  setActionFeedback("Capturing fresh location...", "info");

  try {
    const notes = notesEl.value.trim();

    // For clock_in, always get a fresh GPS fix with a retry.
    // For break/clock-out actions, use the cached location if it's still fresh
    // (avoids unnecessary slow GPS re-requests on mobile Safari during breaks).
    const location =
      actionType === "clock_in"
        ? await ensureClockInLocation()
        : await requestCurrentLocation({ reason: actionType, force: !isFreshLocation(lastCapturedLocation), silent: false });

    if (LOCATION_REQUIRED && !isFreshLocation(location)) {
      const message = `${actionLabel} requires a fresh location. Tap Retry / Refresh Location and try again.`;
      setError(actionErrorEl, message);
      throw new Error(message);
    }

    setActionFeedback(`Submitting ${actionLabel.toLowerCase()}...`, "info");

    const actionResult = await apiFetch("/api/time/actions", {
      method: "POST",
      body: JSON.stringify({
        actionType,
        notes: notes || undefined,
        location: location || undefined,
      }),
    });

    // ── Action committed on the server ────────────────────────────────────────
    // Show success immediately. Status/history refreshes happen independently so
    // a transient network hiccup on the history endpoint does NOT make this look
    // like a failed action to the worker.
    notesEl.value = "";
    renderGeofenceInfo(actionResult?.geofenceEvaluation || null);
    setActionFeedback(`${actionLabel} recorded successfully.`, "success");
    completeActionVisualState(actionType, true);

    // Fire-and-forget: update button states and history list.
    loadStatus().catch((e) => console.warn("[doAction] Status refresh failed:", e.message));
    loadHistory().catch((e) => console.warn("[doAction] History refresh failed:", e.message));
  } catch (error) {
    setActionFeedback(error.message || "Action failed", "error");
    completeActionVisualState(actionType, false);

    // Refresh status silently so buttons reflect the real server state after a
    // failure (avoids stale button states if the server-side status drifted).
    loadStatus().catch((e) => console.warn("[doAction] Status refresh after failure:", e.message));

    throw error;
  }
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
  const status = await apiFetch("/api/time/status");
  const role = status?.user?.role || "worker";
  window.location.replace(role === "admin" ? "/admin/" : "/worker/");
}

function startGoogleLogin() {
  setError(loginErrorEl, "");

  if (!authOptions?.providers?.google?.enabled) {
    setError(loginErrorEl, "Google sign-in is not available right now.");
    return;
  }

  window.location.assign(`${API_BASE_URL}/api/auth/google`);
}

function applyAuthOptions(options) {
  authOptions = options || authOptions;
  const googleEnabled = Boolean(authOptions?.providers?.google?.enabled);

  googleLoginBtnEl.classList.toggle("hidden", !googleEnabled);
  authDividerEl.classList.toggle("hidden", !googleEnabled);

  if (loginHelpTextEl) {
    loginHelpTextEl.textContent = googleEnabled
      ? "Staff and admins use the same login with their Staff ID or email. Google sign-in is also available when your account is enabled for it."
      : "Staff and admins use the same login with their Staff ID or email.";
  }
}

async function loadAuthOptions() {
  try {
    const options = await apiFetch("/api/auth/options");
    applyAuthOptions(options);
  } catch (error) {
    console.warn("Failed to load auth options:", error.message);
    applyAuthOptions({
      unifiedLogin: true,
      providers: {
        google: {
          enabled: false,
        },
      },
    });
  }
}

async function logout() {
  const token = authToken;

  try {
    if (token) {
      await apiFetch("/api/auth/logout", { method: "POST" });
    }
  } catch (error) {
    console.warn("Logout request failed:", error.message);
  } finally {
    setLoggedOutState();
  }
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
  window.location.replace("/worker/");
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
    const status = await apiFetch("/api/time/status");
    const role = status?.user?.role || "worker";
    window.location.replace(role === "admin" ? "/admin/" : "/worker/");
  } catch (error) {
      setLoggedOutState();
    setError(loginErrorEl, `Session could not be restored: ${error.message}`);
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
googleLoginBtnEl.addEventListener("click", startGoogleLogin);
signupBtnEl.addEventListener("click", () => {
  signup().catch((error) => setError(signupErrorEl, error.message));
});

logoutBtnEl.addEventListener("click", () => {
  logout();
});

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
const tsPayPeriodFilterEl = document.getElementById("tsPayPeriodFilter");
const tsSearchEl = document.getElementById("tsSearch");
const tsWorkplaceFilterEl = document.getElementById("tsWorkplaceFilter");
const tsStatusFilterEl = document.getElementById("tsStatusFilter");
const tsPayrollFilterEl = document.getElementById("tsPayrollFilter");
const applyTimesheetFiltersBtnEl = document.getElementById("applyTimesheetFiltersBtn");
const clearTimesheetFiltersBtnEl = document.getElementById("clearTimesheetFiltersBtn");
const createPayrollExportBtnEl = document.getElementById("createPayrollExportBtn");
const createPayPeriodFormEl = document.getElementById("createPayPeriodForm");
const payPeriodActionMessageEl = document.getElementById("payPeriodActionMessage");
const payPeriodsListEl = document.getElementById("payPeriodsList");
const timesheetSummaryCardsEl = document.getElementById("timesheetSummaryCards");
const payrollExportsListEl = document.getElementById("payrollExportsList");
const payrollExportDetailPanelEl = document.getElementById("payrollExportDetailPanel");
const payrollExportActionMessageEl = document.getElementById("payrollExportActionMessage");
const payrollExportDetailContentEl = document.getElementById("payrollExportDetailContent");
const closePayrollExportDetailBtnEl = document.getElementById("closePayrollExportDetailBtn");
const timesheetsBodyEl = document.getElementById("timesheetsBody");
const timesheetsPaginationEl = document.getElementById("timesheetsPagination");
const timesheetErrorEl = document.getElementById("timesheetError");
const exportTimesheetsCsvBtnEl = document.getElementById("exportTimesheetsCsvBtn");
const refreshTimesheetsBtnEl = document.getElementById("refreshTimesheetsBtn");
const timesheetDetailPanelEl = document.getElementById("timesheetDetailPanel");
const timesheetActionMessageEl = document.getElementById("timesheetActionMessage");
const timesheetDetailContentEl = document.getElementById("timesheetDetailContent");
const closeTimesheetDetailBtnEl = document.getElementById("closeTimesheetDetailBtn");

let timesheetsCurrentPage = 1;
let timesheetsLastFilters = {};
let currentPayrollExportBatchId = "";

function buildTimesheetFilterQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.payPeriodId) params.set("payPeriodId", filters.payPeriodId);
  if (filters.search) params.set("search", filters.search);
  if (filters.workplaceId) params.set("workplaceId", filters.workplaceId);
  if (filters.status) params.set("status", filters.status);
  if (filters.payrollStatus) params.set("payrollStatus", filters.payrollStatus);
  return params.toString();
}

function buildTimesheetQueryString(filters, page) {
  const params = new URLSearchParams(buildTimesheetFilterQueryString(filters));
  params.set("page", String(page || 1));
  params.set("limit", "50");
  return params.toString();
}

function readTimesheetFilters() {
  return {
    dateFrom: tsDateFromEl.value || "",
    dateTo: tsDateToEl.value || "",
    payPeriodId: tsPayPeriodFilterEl.value || "",
    search: tsSearchEl.value.trim(),
    workplaceId: tsWorkplaceFilterEl.value || "",
    status: tsStatusFilterEl.value || "",
    payrollStatus: tsPayrollFilterEl.value || "",
  };
}

function clearTimesheetFilters() {
  tsDateFromEl.value = "";
  tsDateToEl.value = "";
  tsPayPeriodFilterEl.value = "";
  tsSearchEl.value = "";
  tsWorkplaceFilterEl.value = "";
  tsStatusFilterEl.value = "";
  tsPayrollFilterEl.value = "";
}

function statusBadgeHtml(status) {
  if (status === "completed") return `<span class="status-badge-completed">Completed</span>`;
  if (status === "open_shift") return `<span class="status-badge-open">Open shift</span>`;
  if (status === "missing_break_end") return `<span class="status-badge-missing">Missing break end</span>`;
  if (status === "outside_geofence") return `<span class="status-badge-missing">Outside workplace area</span>`;
  if (status === "workplace_unresolved") return `<span class="status-badge-warn">Workplace unresolved</span>`;
  return `<span class="status-badge-warn">${status || "—"}</span>`;
}

function toReviewStateLabel(reviewStatus, reviewPending) {
  if (reviewStatus === "reviewed") {
    return `<span class="status-badge-review">Reviewed</span>`;
  }

  if (reviewStatus === "follow_up_required") {
    return `<span class="status-badge-missing">Follow-up required</span>`;
  }

  if (reviewPending) {
    return `<span class="status-badge-warn">Pending review</span>`;
  }

  return "—";
}

function toPayrollStateLabel(payrollStatus) {
  if (payrollStatus === "approved") {
    return `<span class="status-badge-payroll-approved">Approved</span>`;
  }

  if (payrollStatus === "exported") {
    return `<span class="status-badge-payroll-exported">Exported</span>`;
  }

  return `<span class="status-badge-payroll-pending">Pending</span>`;
}

function buildTimesheetAttentionItems(ts) {
  const items = [
    ts.outsideGeofence ? "Outside workplace area" : null,
    ts.unresolvedWorkplace ? "Workplace unresolved" : null,
    ts.status === "missing_break_end" ? "Missing break end" : null,
    ts.status === "open_shift" ? "Open shift" : null,
    ts.noLocation ? "No location" : null,
    ts.readyForPayroll && ts.payrollStatus === "pending" ? "Ready for payroll" : null,
  ].filter(Boolean);

  const reviewLabel = toReviewStateLabel(ts.reviewStatus, ts.reviewPending);
  if (reviewLabel !== "—") {
    items.push(reviewLabel.replace(/<[^>]+>/g, ""));
  }

  return items;
}

function formatBreakList(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "—";
  return arr.map(formatDateTime).join("<br>");
}

function renderTimesheetSummary(summary) {
  if (!summary?.totals || !summary?.payroll) {
    timesheetSummaryCardsEl.innerHTML = "";
    return;
  }

  const cards = [
    {
      label: "Filtered Shifts",
      value: summary.totals.shiftCount,
      meta: `${summary.totals.completedShiftCount} completed`,
    },
    {
      label: "Ready For Payroll",
      value: summary.payroll.readyForPayrollCount,
      meta: `${summary.payroll.pendingCount} pending in this view`,
    },
    {
      label: "Approved Payroll",
      value: summary.payroll.approvedCount,
      meta: `${formatHours(summary.payroll.approvedPayableHours)} approved hours`,
    },
    {
      label: "Exported Payroll",
      value: summary.payroll.exportedCount,
      meta: `${formatHours(summary.payroll.exportedPayableHours)} exported hours`,
    },
  ];

  timesheetSummaryCardsEl.innerHTML = cards
    .map(
      (card) => `
        <div class="timesheet-summary-card">
          <div class="eyebrow">${card.label}</div>
          <div class="value">${card.value}</div>
          <div class="meta">${card.meta}</div>
        </div>`
    )
    .join("");
}

function toPayPeriodStatusLabel(status) {
  if (status === "locked") {
    return `<span class="status-badge-period-locked">Locked</span>`;
  }

  return `<span class="status-badge-period-open">Open</span>`;
}

function formatPayPeriodLabel(period) {
  if (!period) return "—";
  return period.label || `${period.startDate || "..."} to ${period.endDate || "..."}`;
}

function populatePayPeriodFilter(periods, selectedId = "") {
  const dynamicOptions = tsPayPeriodFilterEl.querySelectorAll("option[data-dynamic]");
  dynamicOptions.forEach((option) => option.remove());

  (periods || []).forEach((period) => {
    const option = document.createElement("option");
    option.value = period.id;
    option.textContent = `${formatPayPeriodLabel(period)}${period.status === "locked" ? " • Locked" : ""}`;
    option.dataset.dynamic = "1";
    tsPayPeriodFilterEl.appendChild(option);
  });

  tsPayPeriodFilterEl.value = selectedId && (periods || []).some((period) => period.id === selectedId)
    ? selectedId
    : "";
}

function renderPayPeriods(periods) {
  if (!Array.isArray(periods) || periods.length === 0) {
    payPeriodsListEl.innerHTML = '<p class="muted">No pay periods yet.</p>';
    populatePayPeriodFilter([], "");
    return;
  }

  const selectedPayPeriodId = tsPayPeriodFilterEl.value || "";
  populatePayPeriodFilter(periods, selectedPayPeriodId);

  payPeriodsListEl.innerHTML = periods
    .map((period) => {
      const counts = period.counts || {};
      const lifecycleMeta = period.status === "locked"
        ? `Locked ${formatDateTime(period.lockedAt)}${period.lockedByName ? ` by ${escapeHtml(period.lockedByName)}` : ""}`
        : period.reopenedAt
          ? `Reopened ${formatDateTime(period.reopenedAt)}${period.reopenedByName ? ` by ${escapeHtml(period.reopenedByName)}` : ""}`
          : `Created ${formatDateTime(period.createdAt)}${period.createdByName ? ` by ${escapeHtml(period.createdByName)}` : ""}`;

      return `
        <article class="pay-period-item">
          <div class="pay-period-copy">
            <div class="pay-period-title">${escapeHtml(formatPayPeriodLabel(period))}</div>
            <div class="pay-period-meta">${escapeHtml(period.startDate || "—")} to ${escapeHtml(period.endDate || "—")} • ${toPayPeriodStatusLabel(period.status)} • ${counts.shiftCount || 0} shifts • ${counts.exportedCount || 0} exported • ${counts.readyCount || 0} ready</div>
            <div class="pay-period-meta">${lifecycleMeta}</div>
          </div>
          <div class="pay-period-actions">
            <button class="ghost tiny" type="button" data-action="use-pay-period" data-periodid="${period.id}">Use in Filters</button>
            ${period.status === "locked"
              ? `<button class="ghost tiny" type="button" data-action="reopen-pay-period" data-periodid="${period.id}">Reopen</button>`
              : `<button class="ghost tiny" type="button" data-action="lock-pay-period" data-periodid="${period.id}">Lock</button>`}
          </div>
        </article>`;
    })
    .join("");
}

function toPayrollBatchStatusLabel(status) {
  if (status === "reopened") {
    return `<span class="status-badge-batch-reopened">Reopened</span>`;
  }

  if (status === "replaced") {
    return `<span class="status-badge-batch-replaced">Replaced</span>`;
  }

  return `<span class="status-badge-batch-active">Active</span>`;
}

function toPayrollBatchRelationText(batch) {
  if (batch?.replacedByBatchId) {
    return `Replaced by ${batch.replacedByBatchId.slice(0, 8)}`;
  }

  if (batch?.supersedesBatchId) {
    return `Reissue of ${batch.supersedesBatchId.slice(0, 8)}`;
  }

  if (batch?.status === "reopened") {
    return "Reopened for correction";
  }

  return "Stored export snapshot";
}

function formatBatchFilterSummary(filters) {
  if (!filters || typeof filters !== "object") return "All approved shifts in view";

  const parts = [];
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`Dates ${filters.dateFrom || "..."} to ${filters.dateTo || "..."}`);
  }
  if (filters.payPeriodId) parts.push("Pay period selected");
  if (filters.search) parts.push(`Search: ${filters.search}`);
  if (filters.workplaceId) parts.push(`Workplace filter applied`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.payrollStatus) parts.push(`Payroll: ${filters.payrollStatus}`);

  return parts.length ? parts.join(" • ") : "All approved shifts in view";
}

function renderPayrollExportBatches(batches) {
  if (!Array.isArray(batches) || batches.length === 0) {
    payrollExportsListEl.innerHTML = '<p class="muted">No payroll export batches yet.</p>';
    return;
  }

  payrollExportsListEl.innerHTML = batches
    .map((batch) => {
      const label = batch.id ? batch.id.slice(0, 8) : "batch";
      const createdBy = batch.createdByName || "Unknown admin";
      const shiftCount = typeof batch.shiftCount === "number" ? batch.shiftCount : 0;
      return `
        <article class="payroll-export-item">
          <div class="payroll-export-copy">
            <div class="payroll-export-title">Batch ${label}</div>
            <div class="payroll-export-meta">${formatDateTime(batch.createdAt)} • ${shiftCount} shifts • ${formatHours(batch.totalPayableHours)} payable hours • ${createdBy}${batch.payPeriodLabel ? ` • ${escapeHtml(batch.payPeriodLabel)}` : ""}</div>
            <div class="payroll-export-file">${batch.fileName || "Stored CSV snapshot"}</div>
            <div class="payroll-export-state">${toPayrollBatchStatusLabel(batch.status)} • ${toPayrollBatchRelationText(batch)}</div>
          </div>
          <div class="payroll-export-actions">
            <button class="ghost tiny" data-action="view-payroll-batch" data-batchid="${batch.id}">View</button>
            <button class="ghost tiny" data-action="download-payroll-batch" data-batchid="${batch.id}" data-filename="${escapeHtml(batch.fileName || "payroll-export.csv")}">Download CSV</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderPayrollExportDetail(batch) {
  if (!batch) {
    currentPayrollExportBatchId = "";
    payrollExportDetailContentEl.innerHTML = "";
    setInlineFeedback(payrollExportActionMessageEl, "", "info");
    payrollExportDetailPanelEl.classList.add("hidden");
    return;
  }

  currentPayrollExportBatchId = batch.id || "";
  const payPeriodLocked = batch.payPeriodStatus === "locked";

  const field = (label, value) => `
    <div class="detail-item">
      <div class="label">${label}</div>
      <div class="value">${value == null || value === "" ? "—" : value}</div>
    </div>`;

  const relatedBatchButton = (label, relatedBatch) => {
    if (!relatedBatch?.id) return "—";
    return `<button class="ghost tiny detail-link-button" type="button" data-action="view-related-payroll-batch" data-batchid="${relatedBatch.id}">${label} ${relatedBatch.id.slice(0, 8)}</button>`;
  };

  const summaryHtml = `
    <div class="detail-grid">
      ${field("Batch ID", batch.id)}
      ${field("Status", toPayrollBatchStatusLabel(batch.status))}
      ${field("Created At", formatDateTime(batch.createdAt))}
      ${field("Created By", batch.createdByName || "—")}
      ${field("Shift Count", batch.shiftCount)}
      ${field("Payable Hours", formatHours(batch.totalPayableHours))}
      ${field(
        "Pay Period",
        batch.payPeriodLabel
          ? `${escapeHtml(batch.payPeriodLabel)} (${escapeHtml(batch.payPeriodStartDate || "—")} to ${escapeHtml(batch.payPeriodEndDate || "—")}) • ${toPayPeriodStatusLabel(batch.payPeriodStatus || "open")}`
          : "—"
      )}
      ${field("File Name", batch.fileName || "—")}
      ${field("Filters", formatBatchFilterSummary(batch.filters))}
      ${field("Reopened At", formatDateTime(batch.reopenedAt))}
      ${field("Reopened By", batch.reopenedByName || "—")}
      ${field("Reopen Note", batch.reopenedNote || "—")}
      ${field("Supersedes", relatedBatchButton("Batch", batch.supersedesBatch))}
      ${field("Replaced By", relatedBatchButton("Batch", batch.replacedByBatch))}
    </div>`;

  const actionsHtml = payPeriodLocked
    ? `
      <section class="resolution-panel">
        <h3>Batch Actions</h3>
        <p class="detail-note">${escapeHtml(batch.payPeriodLabel || "This pay period")} is locked. Reopen the pay period before changing this payroll export batch.</p>
      </section>`
    : batch.status === "active"
    ? `
      <section class="resolution-panel">
        <h3>Batch Actions</h3>
        <p class="detail-note">Reopen this batch when payroll or operations need corrections before a replacement export is created.</p>
        <form id="payrollExportReopenForm" class="resolution-form" data-batchid="${batch.id}">
          <label class="full-width">
            Reopen Note
            <textarea name="note" maxlength="1000" required placeholder="Explain why this export batch is being reopened."></textarea>
          </label>
          <div class="actions">
            <button type="submit">Reopen Batch</button>
          </div>
        </form>
      </section>`
    : batch.status === "reopened"
      ? `
        <section class="resolution-panel">
          <h3>Batch Actions</h3>
          <p class="detail-note">After correcting the reopened shifts, create a replacement export. The replacement batch will be linked back to this batch automatically.</p>
          <div class="actions">
            <button type="button" data-action="reissue-payroll-batch" data-batchid="${batch.id}">Create Replacement Export</button>
          </div>
        </section>`
      : `
        <section class="resolution-panel">
          <h3>Batch Actions</h3>
          <p class="detail-note">This batch has already been replaced. Use the linked replacement batch to download the latest snapshot.</p>
        </section>`;

  const rowsHtml = Array.isArray(batch.rows) && batch.rows.length > 0
    ? `<h3 style="margin:12px 0 6px">Export Snapshot</h3>
       <div class="table-wrap">
         <table class="detail-actions-table">
           <thead>
             <tr>
               <th>Worker</th>
               <th>Business Date</th>
               <th>Workplace</th>
               <th>Payable Hours</th>
               <th>Status</th>
               <th>Payroll</th>
               <th>Shift</th>
             </tr>
           </thead>
           <tbody>
             ${batch.rows.map((row) => `
               <tr>
                 <td>${row.workerName || "—"}</td>
                 <td>${row.date || "—"}</td>
                 <td>${row.workplaceName || "—"}</td>
                 <td>${formatHours(row.payableHours)}</td>
                 <td>${statusBadgeHtml(row.status)}</td>
                 <td>${toPayrollStateLabel(row.payrollStatus)}</td>
                 <td><button class="ghost tiny detail-link-button" type="button" data-action="view-exported-shift" data-shiftid="${row.shiftId}">View Shift</button></td>
               </tr>`).join("")}
           </tbody>
         </table>
       </div>`
    : `<p class="muted">No snapshot rows stored for this batch.</p>`;

  payrollExportDetailContentEl.innerHTML = summaryHtml + actionsHtml + rowsHtml;
  payrollExportDetailPanelEl.classList.remove("hidden");
  payrollExportDetailPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadPayPeriods(preferredPayPeriodId = tsPayPeriodFilterEl.value || "") {
  try {
    const data = await apiFetch("/api/admin/pay-periods?limit=12");
    const periods = data?.periods || [];
    renderPayPeriods(periods);
    populatePayPeriodFilter(periods, preferredPayPeriodId);
  } catch {
    renderPayPeriods([]);
  }
}

async function createPayPeriod(form) {
  setError(timesheetErrorEl, "");
  setInlineFeedback(payPeriodActionMessageEl, "Creating pay period...", "info");

  const formData = new FormData(form);

  try {
    const data = await apiFetch("/api/admin/pay-periods", {
      method: "POST",
      body: JSON.stringify({
        label: String(formData.get("label") || "").trim() || undefined,
        startDate: String(formData.get("startDate") || "").trim() || undefined,
        endDate: String(formData.get("endDate") || "").trim() || undefined,
      }),
    });

    const period = data?.period;
    form.reset();
    await loadPayPeriods(period?.id || "");
    if (period?.id) {
      tsPayPeriodFilterEl.value = period.id;
    }
    setInlineFeedback(payPeriodActionMessageEl, `Pay period ${period?.label || "created"} created.`, "success");
    await loadTimesheets(readTimesheetFilters(), 1);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(payPeriodActionMessageEl, error.message, "error");
  }
}

async function updatePayPeriodStatus(periodId, action) {
  if (!periodId) return;

  const actionLabel = action === "reopen" ? "Reopening" : "Locking";
  setError(timesheetErrorEl, "");
  setInlineFeedback(payPeriodActionMessageEl, `${actionLabel} pay period...`, "info");

  try {
    const data = await apiFetch(`/api/admin/pay-periods/${encodeURIComponent(periodId)}/${action}`, {
      method: "POST",
    });

    const period = data?.period;
    await loadPayPeriods(period?.id || tsPayPeriodFilterEl.value || "");
    await loadTimesheets(readTimesheetFilters(), timesheetsCurrentPage);
    if (currentPayrollExportBatchId) {
      await loadPayrollExportBatchDetail(currentPayrollExportBatchId);
    }
    setInlineFeedback(
      payPeriodActionMessageEl,
      `Pay period ${period?.label || periodId.slice(0, 8)} ${action === "reopen" ? "reopened" : "locked"}.`,
      "success"
    );
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(payPeriodActionMessageEl, error.message, "error");
  }
}

async function loadPayrollExportBatches() {
  try {
    const data = await apiFetch("/api/admin/payroll-exports?limit=6");
    renderPayrollExportBatches(data?.batches || []);
  } catch {
    renderPayrollExportBatches([]);
  }
}

async function downloadPayrollExportBatch(batchId, fileName) {
  const text = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batchId)}/csv`, {
    headers: { Accept: "text/csv" },
  });
  triggerCsvDownload(text, fileName || `payroll-export-${batchId}.csv`);
}

async function loadPayrollExportBatchDetail(batchId) {
  setError(timesheetErrorEl, "");
  setInlineFeedback(payrollExportActionMessageEl, "", "info");

  try {
    const data = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batchId)}`);
    renderPayrollExportDetail(data?.batch || null);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
  }
}

async function submitPayrollExportReopen(form) {
  const batchId = form.dataset.batchid;
  if (!batchId) return;

  setError(timesheetErrorEl, "");
  setInlineFeedback(payrollExportActionMessageEl, "Reopening payroll export batch...", "info");

  const formData = new FormData(form);

  try {
    const data = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batchId)}/reopen`, {
      method: "POST",
      body: JSON.stringify({
        note: String(formData.get("note") || "").trim() || undefined,
      }),
    });

    await Promise.all([
      loadTimesheets(timesheetsLastFilters, timesheetsCurrentPage),
      loadPayrollExportBatches(),
      loadPayPeriods(tsPayPeriodFilterEl.value || ""),
    ]);
    renderPayrollExportDetail(data?.batch || null);
    setInlineFeedback(payrollExportActionMessageEl, `Payroll export ${batchId.slice(0, 8)} reopened.`, "success");
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(payrollExportActionMessageEl, error.message, "error");
  }
}

async function createReplacementPayrollExport(batchId) {
  if (!batchId) return;

  setError(timesheetErrorEl, "");
  setInlineFeedback(payrollExportActionMessageEl, "Creating replacement payroll export...", "info");

  try {
    const data = await apiFetch(`/api/admin/payroll-exports/${encodeURIComponent(batchId)}/reissue`, {
      method: "POST",
    });

    const batch = data?.batch;
    if (!batch?.id) {
      throw new Error("Replacement payroll export batch was created without an id");
    }

    await Promise.all([
      loadTimesheets(timesheetsLastFilters, timesheetsCurrentPage),
      loadPayrollExportBatches(),
      loadPayPeriods(batch.payPeriodId || tsPayPeriodFilterEl.value || ""),
    ]);
    renderPayrollExportDetail(batch);
    setInlineFeedback(payrollExportActionMessageEl, `Replacement payroll export ${batch.id.slice(0, 8)} created.`, "success");
    await downloadPayrollExportBatch(batch.id, batch.fileName);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(payrollExportActionMessageEl, error.message, "error");
  }
}

function renderTimesheets(timesheets) {
  if (!Array.isArray(timesheets) || timesheets.length === 0) {
    timesheetsBodyEl.innerHTML = `<tr><td colspan="10" class="muted">No timesheets found.</td></tr>`;
    return;
  }

  timesheetsBodyEl.innerHTML = timesheets.map((ts) => {
    const attention = buildTimesheetAttentionItems(ts);
    const noteText = ts.reviewNote || ts.clockInNotes || ts.clockOutNotes || "—";

    return `
      <tr class="ts-row" data-shiftid="${ts.shiftId}">
        <td>${ts.workerName || "—"}</td>
        <td>${ts.date || "—"}</td>
        <td>${ts.workplaceName || "—"}</td>
        <td>${formatDateTime(ts.clockInAt)}</td>
        <td>${formatDateTime(ts.clockOutAt)}</td>
        <td>${formatHours(ts.actualHours)}</td>
        <td>${statusBadgeHtml(ts.status)}</td>
        <td>${toPayrollStateLabel(ts.payrollStatus)}</td>
        <td>${attention.length ? attention.join(", ") : "—"}</td>
        <td>${noteText}</td>
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
  const summaryQs = buildTimesheetFilterQueryString(filters);
  const [data, summaryData] = await Promise.all([
    apiFetch(`/api/admin/timesheets?${qs}`),
    apiFetch(`/api/admin/timesheets/summary/payroll${summaryQs ? "?" + summaryQs : ""}`).catch(() => null),
  ]);
  console.info("[timesheets] response", {
    filters,
    page: timesheetsCurrentPage,
    rowCount: Array.isArray(data?.timesheets) ? data.timesheets.length : 0,
    pagination: data?.pagination || null,
  });
  renderTimesheetSummary(summaryData?.summary || null);
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
  setInlineFeedback(timesheetActionMessageEl, "", "info");
  setInlineFeedback(payPeriodActionMessageEl, "", "info");
  renderTimesheetSummary(null);
  renderPayPeriods([]);
  renderPayrollExportBatches([]);
  renderPayrollExportDetail(null);
  clearTimesheetFilters();
  timesheetDetailPanelEl.classList.add("hidden");
  await Promise.all([populateWorkplaceFilter(), loadPayrollExportBatches(), loadPayPeriods()]);
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

  const reviewLabel = toReviewStateLabel(detail.reviewStatus, detail.reviewPending);
  const payPeriodLocked = detail.payPeriodStatus === "locked";
  const activeBreak = Array.isArray(detail.breaks)
    ? [...detail.breaks].reverse().find((item) => item.startAt && !item.endAt) || null
    : null;
  const currentPayablePlaceholder =
    typeof detail.payableHours === "number" ? detail.payableHours.toFixed(2) : "";
  const defaultReviewStatus = detail.reviewStatus === "follow_up_required" ? "follow_up_required" : "reviewed";
  const defaultPayrollStatus = detail.payrollStatus || "pending";

  const summaryHtml = `
    <div class="detail-grid">
      ${field("Shift ID", detail.shiftId)}
      ${field("Worker", detail.workerName)}
      ${field("Staff ID", detail.workerStaffId)}
      ${field("Email", detail.workerEmail)}
      ${field("Business Date", detail.date)}
      ${field("Business Time Zone", detail.businessTimeZone || "—")}
      ${field(
        "Pay Period",
        detail.payPeriodLabel
          ? `${escapeHtml(detail.payPeriodLabel)} (${escapeHtml(detail.payPeriodStartDate || "—")} to ${escapeHtml(detail.payPeriodEndDate || "—")}) • ${toPayPeriodStatusLabel(detail.payPeriodStatus || "open")}`
          : "—"
      )}
      ${field("Status", detail.status)}
      ${field("Clock In", formatDateTime(detail.clockInAt))}
      ${field("Clock Out", formatDateTime(detail.clockOutAt))}
      ${field("Raw Duration", detail.rawDuration || formatDurationMinutes(detail.totalMinutes))}
      ${field("Actual Hours", formatHours(detail.actualHours))}
      ${field("Final Payable Hours", formatHours(detail.payableHours))}
      ${field("System Payable Hours", formatHours(detail.systemPayableHours))}
      ${field("Break Minutes", typeof detail.breakMinutes === "number" ? detail.breakMinutes : "—")}
      ${field("Workplace", detail.workplaceName)}
      ${field("Geofence", geofenceStr)}
      ${field("Distance", distanceStr)}
      ${field("Location", detail.locationSummary || "—")}
      ${field("Location Accuracy", accuracyStr)}
      ${field("Review Status", reviewLabel)}
      ${field("Reviewed By", detail.reviewedByName || "—")}
      ${field("Reviewed At", formatDateTime(detail.reviewedAt))}
      ${field("Payroll Status", toPayrollStateLabel(detail.payrollStatus))}
      ${field("Payroll Approved By", detail.payrollApprovedByName || "—")}
      ${field("Payroll Approved At", formatDateTime(detail.payrollApprovedAt))}
      ${field("Payroll Exported By", detail.payrollExportedByName || "—")}
      ${field("Payroll Exported At", formatDateTime(detail.payrollExportedAt))}
      ${field(
        "Payroll Export Batch",
        detail.payrollExportBatchId
          ? `<button class="ghost tiny detail-link-button" type="button" data-action="view-related-payroll-batch" data-batchid="${detail.payrollExportBatchId}">Batch ${detail.payrollExportBatchId.slice(0, 8)}</button>`
          : "—"
      )}
      ${field("Payable Adjusted", detail.payableHoursAdjusted ? "Yes" : "No")}
      ${field("Review Note", detail.reviewNote || "—")}
      ${field("Clock-In Notes", detail.clockInNotes || "—")}
      ${field("Clock-Out Notes", detail.clockOutNotes || "—")}
    </div>`;

  const resolutionHtml = payPeriodLocked
    ? `
    <section class="resolution-panel">
      <h3>Resolution Tools</h3>
      <p class="detail-note">${escapeHtml(detail.payPeriodLabel || "This pay period")} is locked. Reopen the pay period before modifying shifts in it.</p>
    </section>`
    : `
    <section class="resolution-panel">
      <h3>Resolution Tools</h3>
      <p class="detail-note">Use these actions to close operational exceptions, leave a manager audit note, and control payroll readiness. Stored payroll exports are created from the main timesheet screen after shifts are approved.</p>
      <form id="timesheetResolutionForm" class="resolution-form" data-shiftid="${detail.shiftId}">
        <label>
          Review Status
          <select name="reviewStatus">
            <option value="reviewed" ${defaultReviewStatus === "reviewed" ? "selected" : ""}>Reviewed</option>
            <option value="follow_up_required" ${defaultReviewStatus === "follow_up_required" ? "selected" : ""}>Follow-up required</option>
          </select>
        </label>

        <label>
          Payroll Status
          <select name="payrollStatus">
            ${defaultPayrollStatus === "exported" ? '<option value="exported" selected disabled>Exported via batch</option>' : ""}
            <option value="pending" ${defaultPayrollStatus === "pending" ? "selected" : ""}>Pending</option>
            <option value="approved" ${defaultPayrollStatus === "approved" ? "selected" : ""}>Approved for payroll</option>
          </select>
        </label>

        ${!detail.clockOutAt ? `
          <div>
            <label class="resolution-option">
              <input type="checkbox" name="closeOpenShift" />
              Close open shift
            </label>
            <label>
              Close Shift At
              <input name="closeOpenShiftAt" type="datetime-local" value="${escapeHtml(formatDateTimeInputValue())}" />
            </label>
          </div>
        ` : ""}

        ${detail.hasActiveBreak ? `
          <div>
            <label class="resolution-option">
              <input type="checkbox" name="closeActiveBreak" />
              End active break
            </label>
            <label>
              End Break At
              <input name="closeActiveBreakAt" type="datetime-local" value="${escapeHtml(formatDateTimeInputValue())}" />
            </label>
          </div>
        ` : ""}

        <label>
          Override Final Payable Hours (optional)
          <input
            name="payableHours"
            type="number"
            step="0.25"
            min="0"
            max="48"
            placeholder="Current: ${escapeHtml(currentPayablePlaceholder || "—")}" />
        </label>

        <label class="full-width">
          Manager Note
          <textarea name="reviewNote" maxlength="1000" required placeholder="Explain what was reviewed or changed.">${escapeHtml(detail.reviewNote || "")}</textarea>
        </label>

        <div class="actions">
          <button type="submit">Save Resolution</button>
        </div>
      </form>
    </section>`;

  const actionsHtml = Array.isArray(detail.actions) && detail.actions.length > 0
    ? `<h3 style="margin:12px 0 6px">Action History</h3>
       <div class="table-wrap">
         <table class="detail-actions-table">
           <thead>
             <tr>
               <th>Action</th>
                <th>Actor</th>
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
                 <td>${a.actorName || "—"}</td>
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

  timesheetDetailContentEl.innerHTML = summaryHtml + resolutionHtml + actionsHtml;
  timesheetDetailPanelEl.classList.remove("hidden");
  timesheetDetailPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadTimesheetDetail(shiftId) {
  setError(timesheetErrorEl, "");
  setInlineFeedback(timesheetActionMessageEl, "", "info");
  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}`);
    renderTimesheetDetail(data.timesheet);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
  }
}

async function submitTimesheetResolution(form) {
  const shiftId = form.dataset.shiftid;
  if (!shiftId) return;

  setError(timesheetErrorEl, "");
  setInlineFeedback(timesheetActionMessageEl, "Saving resolution...", "info");

  const formData = new FormData(form);
  const selectedPayrollStatus = String(formData.get("payrollStatus") || "").trim();
  const payload = {
    reviewStatus: String(formData.get("reviewStatus") || "").trim() || undefined,
    payrollStatus: selectedPayrollStatus && selectedPayrollStatus !== "exported" ? selectedPayrollStatus : undefined,
    reviewNote: String(formData.get("reviewNote") || "").trim() || undefined,
  };

  if (formData.get("closeOpenShift") === "on") {
    payload.closeOpenShiftAt = parseDateTimeLocalToIso(String(formData.get("closeOpenShiftAt") || ""));
  }

  if (formData.get("closeActiveBreak") === "on") {
    payload.closeActiveBreakAt = parseDateTimeLocalToIso(String(formData.get("closeActiveBreakAt") || ""));
  }

  const payableHoursRaw = String(formData.get("payableHours") || "").trim();
  if (payableHoursRaw) {
    payload.payableHours = Number(payableHoursRaw);
  }

  try {
    const data = await apiFetch(`/api/admin/timesheets/${encodeURIComponent(shiftId)}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    renderTimesheetDetail(data.timesheet);
    setInlineFeedback(timesheetActionMessageEl, "Resolution saved.", "success");
    await Promise.all([
      loadTimesheets(timesheetsLastFilters, timesheetsCurrentPage),
      loadPayPeriods(tsPayPeriodFilterEl.value || ""),
    ]);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(timesheetActionMessageEl, error.message, "error");
  }
}

async function createPayrollExportBatch() {
  const filters = readTimesheetFilters();
  setError(timesheetErrorEl, "");
  setInlineFeedback(timesheetActionMessageEl, "Creating payroll export...", "info");
  setInlineFeedback(payrollExportActionMessageEl, "", "info");

  try {
    const data = await apiFetch("/api/admin/payroll-exports", {
      method: "POST",
      body: JSON.stringify({ filters }),
    });

    const batch = data?.batch;
    if (!batch?.id) {
      throw new Error("Payroll export batch was created without an id");
    }

    await Promise.all([
      loadTimesheets(filters, 1),
      loadPayrollExportBatches(),
      loadPayPeriods(batch.payPeriodId || filters.payPeriodId || tsPayPeriodFilterEl.value || ""),
    ]);
    setInlineFeedback(timesheetActionMessageEl, `Payroll export ${batch.id.slice(0, 8)} created.`, "success");
    await loadPayrollExportBatchDetail(batch.id);
    await downloadPayrollExportBatch(batch.id, batch.fileName);
  } catch (error) {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(timesheetActionMessageEl, error.message, "error");
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

createPayrollExportBtnEl.addEventListener("click", () => {
  createPayrollExportBatch();
});

createPayPeriodFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  createPayPeriod(event.target);
});

payPeriodsListEl.addEventListener("click", (event) => {
  const useButton = event.target.closest("button[data-action='use-pay-period']");
  if (useButton) {
    tsPayPeriodFilterEl.value = useButton.dataset.periodid || "";
    loadTimesheets(readTimesheetFilters(), 1).catch((error) => setError(timesheetErrorEl, error.message));
    return;
  }

  const lockButton = event.target.closest("button[data-action='lock-pay-period']");
  if (lockButton) {
    updatePayPeriodStatus(lockButton.dataset.periodid, "lock");
    return;
  }

  const reopenButton = event.target.closest("button[data-action='reopen-pay-period']");
  if (reopenButton) {
    updatePayPeriodStatus(reopenButton.dataset.periodid, "reopen");
  }
});

exportTimesheetsCsvBtnEl.addEventListener("click", () => {
  const filters = readTimesheetFilters();
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.payPeriodId) params.set("payPeriodId", filters.payPeriodId);
  if (filters.search) params.set("search", filters.search);
  if (filters.workplaceId) params.set("workplaceId", filters.workplaceId);
  if (filters.status) params.set("status", filters.status);
  if (filters.payrollStatus) params.set("payrollStatus", filters.payrollStatus);
  const qs = params.toString();

  apiFetch(`/api/admin/timesheets/export/csv${qs ? "?" + qs : ""}`, { headers: { Accept: "text/csv" } })
    .then((text) => {
      triggerCsvDownload(text, `timesheets-${new Date().toISOString().slice(0, 10)}.csv`);
    })
    .catch((error) => setError(timesheetErrorEl, error.message));
});

payrollExportsListEl.addEventListener("click", (event) => {
  const viewButton = event.target.closest("button[data-action='view-payroll-batch']");
  if (viewButton) {
    loadPayrollExportBatchDetail(viewButton.dataset.batchid).catch((error) => {
      setError(timesheetErrorEl, error.message);
    });
    return;
  }

  const downloadButton = event.target.closest("button[data-action='download-payroll-batch']");
  if (!downloadButton) return;

  downloadPayrollExportBatch(downloadButton.dataset.batchid, downloadButton.dataset.filename).catch((error) => {
    setError(timesheetErrorEl, error.message);
    setInlineFeedback(timesheetActionMessageEl, error.message, "error");
  });
});

timesheetsBodyEl.addEventListener("click", (event) => {
  const row = event.target.closest("tr.ts-row[data-shiftid]");
  if (!row) return;
  loadTimesheetDetail(row.dataset.shiftid);
});

timesheetDetailContentEl.addEventListener("submit", (event) => {
  const form = event.target.closest("form#timesheetResolutionForm");
  if (!form) return;
  event.preventDefault();
  submitTimesheetResolution(form);
});

timesheetDetailContentEl.addEventListener("click", (event) => {
  const relatedBatchButton = event.target.closest("button[data-action='view-related-payroll-batch']");
  if (!relatedBatchButton) return;

  loadPayrollExportBatchDetail(relatedBatchButton.dataset.batchid).catch((error) => {
    setError(timesheetErrorEl, error.message);
  });
});

payrollExportDetailContentEl.addEventListener("submit", (event) => {
  const form = event.target.closest("form#payrollExportReopenForm");
  if (!form) return;
  event.preventDefault();
  submitPayrollExportReopen(form);
});

payrollExportDetailContentEl.addEventListener("click", (event) => {
  const relatedBatchButton = event.target.closest("button[data-action='view-related-payroll-batch']");
  if (relatedBatchButton) {
    loadPayrollExportBatchDetail(relatedBatchButton.dataset.batchid).catch((error) => {
      setError(timesheetErrorEl, error.message);
    });
    return;
  }

  const shiftButton = event.target.closest("button[data-action='view-exported-shift']");
  if (shiftButton) {
    loadTimesheetDetail(shiftButton.dataset.shiftid);
    return;
  }

  const reissueButton = event.target.closest("button[data-action='reissue-payroll-batch']");
  if (reissueButton) {
    createReplacementPayrollExport(reissueButton.dataset.batchid);
  }
});

closeTimesheetDetailBtnEl.addEventListener("click", () => {
  setInlineFeedback(timesheetActionMessageEl, "", "info");
  timesheetDetailPanelEl.classList.add("hidden");
});

closePayrollExportDetailBtnEl.addEventListener("click", () => {
  renderPayrollExportDetail(null);
});

// ─── End Admin Timesheets ─────────────────────────────────────────────────────

startLiveClock();
resetWorkplaceForm();
showMapPlaceholder("Location not captured yet.", "Waiting for location");
updateLocationPermissionState().catch(() => {
  locationPermissionState = "unsupported";
  renderLocationDebug();
});
loadAuthOptions().finally(() => {
  initFromSession().finally(() => {
    consumeAuthErrorFromUrl();
  });
});

window.addEventListener("beforeunload", () => {
  if (liveClockIntervalId) clearInterval(liveClockIntervalId);
});
