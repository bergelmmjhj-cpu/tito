const loginViewEl = document.getElementById("loginView");
const appViewEl = document.getElementById("appView");
const loginFormViewEl = document.getElementById("loginFormView");
const signupFormViewEl = document.getElementById("signupFormView");
const showLoginBtnEl = document.getElementById("showLoginBtn");
const showSignupBtnEl = document.getElementById("showSignupBtn");

const identifierEl = document.getElementById("identifier");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
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
const historyBodyEl = document.getElementById("historyBody");
const refreshHistoryBtnEl = document.getElementById("refreshHistoryBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const refreshLocationBtnEl = document.getElementById("refreshLocationBtn");
const locationStatusBadgeEl = document.getElementById("locationStatusBadge");
const locationCoordinatesEl = document.getElementById("locationCoordinates");
const lastLocationDetailsEl = document.getElementById("lastLocationDetails");
const locationMapEl = document.getElementById("locationMap");
const mapPlaceholderEl = document.getElementById("mapPlaceholder");
const mapStatusTextEl = document.getElementById("mapStatusText");
const mapCoordinatesTextEl = document.getElementById("mapCoordinatesText");

const showTimeClockBtnEl = document.getElementById("showTimeClockBtn");
const showWorkplacesBtnEl = document.getElementById("showWorkplacesBtn");
const timeClockSectionEl = document.getElementById("timeClockSection");
const historySectionEl = document.getElementById("historySection");
const workplacesSectionEl = document.getElementById("workplacesSection");
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

const TOKEN_KEY = "timeclock_token";
const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let currentStatus = "not_clocked_in";
let liveClockIntervalId = null;
let lastCapturedLocation = null;
let currentUser = null;
let locationMap = null;
let locationMarker = null;

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

function isValidLocation(location) {
  return Boolean(
    location &&
      typeof location.latitude === "number" &&
      Number.isFinite(location.latitude) &&
      typeof location.longitude === "number" &&
      Number.isFinite(location.longitude)
  );
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

function renderLocationState(status, location = null) {
  if (status === "locating") {
    locationStatusBadgeEl.textContent = "Locating...";
    locationCoordinatesEl.textContent = "Coordinates: waiting for browser geolocation...";
    showMapPlaceholder("Waiting for location...", "Locating...");
    return;
  }

  if (status === "captured" && location) {
    const coordinates = formatCoordinates(location.latitude, location.longitude);
    locationStatusBadgeEl.textContent = "Location captured";
    locationCoordinatesEl.textContent = `Coordinates: ${coordinates}`;
    lastLocationDetailsEl.textContent = `Lat/Lon ${coordinates} | Accuracy ${
      typeof location.accuracy === "number" ? `${location.accuracy.toFixed(1)}m` : "n/a"
    } | Captured ${formatDateTime(location.capturedAt)}`;
    updateMapPreview(location, "Last captured location");
    return;
  }

  if (status === "denied") {
    locationStatusBadgeEl.textContent = "Location denied";
    locationCoordinatesEl.textContent = "Coordinates: unavailable (permission denied).";
    showMapPlaceholder("Location permission required.", "Location denied");
    return;
  }

  locationStatusBadgeEl.textContent = "Location unavailable";
  locationCoordinatesEl.textContent = "Coordinates: unavailable.";
  showMapPlaceholder("Location not captured yet.", "Location unavailable");
}

function renderStatus(status) {
  currentStatus = status || "not_clocked_in";
  statusBadgeEl.textContent = toStatusLabel(currentStatus);
  const canClockInByStatus = currentStatus === "not_clocked_in" || currentStatus === "clocked_out";
  clockInBtnEl.disabled = !canClockInByStatus || !isValidLocation(lastCapturedLocation);
  startBreakBtnEl.disabled = currentStatus !== "clocked_in";
  endBreakBtnEl.disabled = currentStatus !== "on_break";
  clockOutBtnEl.disabled = currentStatus !== "clocked_in";
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
    historyBodyEl.innerHTML = `<tr><td colspan="8" class="muted">No attendance history yet.</td></tr>`;
    return;
  }

  historyBodyEl.innerHTML = history
    .map((item) => {
      const attendanceDate = item.attendanceTimestamp ? item.attendanceTimestamp.slice(0, 10) : "—";
      const locationSummary = formatCoordinates(item.latitude, item.longitude);
      const accuracySummary =
        typeof item.accuracy === "number" ? `${item.accuracy.toFixed(1)} m` : "—";
      const workplaceDistance = [
        item.workplaceName || "—",
        typeof item.distanceMeters === "number" ? `${item.distanceMeters.toFixed(2)} m` : "n/a",
      ].join(" / ");

      return `
        <tr
          ${typeof item.latitude === "number" ? `data-latitude="${item.latitude}"` : ""}
          ${typeof item.longitude === "number" ? `data-longitude="${item.longitude}"` : ""}
          data-label="${toActionLabel(item.actionType)} ${formatDateTime(item.attendanceTimestamp)}"
          title="Preview this captured location on the map"
        >
          <td>${attendanceDate}</td>
          <td>${toActionLabel(item.actionType)}</td>
          <td>${formatDateTime(item.attendanceTimestamp)}</td>
          <td>${locationSummary}</td>
          <td>${workplaceDistance}</td>
          <td>${accuracySummary}</td>
          <td>${formatDateTime(item.locationCapturedAt)}</td>
          <td>${item.notes || "—"}</td>
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
  if (!isAdmin) {
    workplacesSectionEl.classList.add("hidden");
    timeClockSectionEl.classList.remove("hidden");
    historySectionEl.classList.remove("hidden");
  }
}

function openScreen(name) {
  const isWorkplaces = name === "workplaces";
  workplacesSectionEl.classList.toggle("hidden", !isWorkplaces);
  timeClockSectionEl.classList.toggle("hidden", isWorkplaces);
  historySectionEl.classList.toggle("hidden", isWorkplaces);
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
  if (error.code === 1) return "Location permission denied by browser.";
  if (error.code === 3) return "Location request timed out.";
  return "Location unavailable. Ensure GPS/network location is enabled.";
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
      GEO_OPTIONS
    );
  });
}

async function collectActionLocation() {
  renderLocationState("locating");

  try {
    const location = await captureLocation();
    lastCapturedLocation = location;
    renderLocationState("captured", location);
    return location;
  } catch (error) {
    const denied = error && error.code === 1;
    renderLocationState(denied ? "denied" : "unavailable");

    if (LOCATION_REQUIRED) {
      throw new Error(
        `${getLocationErrorMessage(error)} Enable location permission to complete attendance actions.`
      );
    }

    return null;
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
  renderLocationState("unavailable");
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
  const data = await apiFetch("/api/time/history");
  renderHistory(data?.history || []);
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
  if (actionType === "clock_in" && !isValidLocation(lastCapturedLocation)) {
    setError(actionErrorEl, "Location is required before clocking in.");
    return;
  }

  const notes = notesEl.value.trim();
  const location = await collectActionLocation();

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
    await collectActionLocation();
    renderStatus(currentStatus);
  } catch (error) {
    setError(actionErrorEl, error.message);
    renderStatus(currentStatus);
  }
}

async function refreshLocationSilently() {
  try {
    await collectActionLocation();
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
  renderLocationState("unavailable");
  await Promise.all([loadStatus(), loadHistory()]);
  await refreshLocationSilently();
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
  renderLocationState("unavailable");
  await Promise.all([loadStatus(), loadHistory()]);
  await refreshLocationSilently();
}

async function saveWorkplace(event) {
  event.preventDefault();
  setError(workplaceErrorEl, "");

  try {
    const payload = toWorkplacePayload();
    const workplaceId = workplaceIdEl.value.trim();

    if (workplaceId) {
      await apiFetch(`/api/workplaces/${workplaceId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/workplaces", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    resetWorkplaceForm();
    await Promise.all([loadWorkplaces(), loadWorkerAssignments()]);
  } catch (error) {
    setError(workplaceErrorEl, error.message);
  }
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

async function handleWorkplaceTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const workplaceId = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "toggle") {
      const currentlyActive = button.dataset.active === "true";
      await apiFetch(`/api/workplaces/${workplaceId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active: !currentlyActive }),
      });
      await loadWorkplaces();
      return;
    }

    if (action === "edit") {
      const data = await apiFetch(`/api/workplaces/${workplaceId}`);
      const wp = data.workplace;
      workplaceIdEl.value = wp.id;
      wpNameEl.value = wp.name || "";
      wpAddressEl.value = wp.address || "";
      wpCityEl.value = wp.city || "";
      wpStateEl.value = wp.state || "";
      wpPostalCodeEl.value = wp.postalCode || "";
      wpCountryEl.value = wp.country || "";
      wpContactNameEl.value = wp.contactName || "";
      wpContactPhoneEl.value = wp.contactPhone || "";
      wpContactEmailEl.value = wp.contactEmail || "";
      wpLatitudeEl.value = wp.latitude;
      wpLongitudeEl.value = wp.longitude;
      wpRadiusEl.value = wp.geofenceRadiusMeters;
      wpActiveEl.checked = wp.active !== false;
      saveWorkplaceBtnEl.textContent = "Update Workplace";
    }
  } catch (error) {
    setError(workplaceErrorEl, error.message);
  }
}

async function initFromSession() {
  if (!authToken) {
    setLoggedOutState();
    return;
  }

  try {
    await Promise.all([loadStatus(), loadHistory()]);
    setLoggedInState();
    renderLocationState("unavailable");
    await refreshLocationSilently();
  } catch (error) {
    setLoggedOutState();
  }
}

function startLiveClock() {
  const render = () => {
    liveClockEl.textContent = new Date().toLocaleString();
  };
  render();
  liveClockIntervalId = setInterval(render, 1000);
}

showLoginBtnEl.addEventListener("click", () => setAuthMode("login"));
showSignupBtnEl.addEventListener("click", () => setAuthMode("signup"));

loginBtnEl.addEventListener("click", () => {
  login().catch((error) => setError(loginErrorEl, error.message));
});
signupBtnEl.addEventListener("click", () => {
  signup().catch((error) => setError(signupErrorEl, error.message));
});

logoutBtnEl.addEventListener("click", () => setLoggedOutState());

showTimeClockBtnEl.addEventListener("click", () => openScreen("time"));
showWorkplacesBtnEl.addEventListener("click", () => {
  openScreen("workplaces");
  Promise.all([loadWorkplaces(), loadWorkerAssignments()]).catch((error) =>
    setError(workplaceErrorEl, error.message)
  );
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
  Promise.all([loadWorkplaces(), loadWorkerAssignments()]).catch((error) =>
    setError(workplaceErrorEl, error.message)
  );
});

saveAssignmentBtnEl.addEventListener("click", () => {
  saveWorkerAssignment();
});

workplaceFormEl.addEventListener("submit", saveWorkplace);
resetWorkplaceBtnEl.addEventListener("click", () => {
  resetWorkplaceForm();
  setError(workplaceErrorEl, "");
});
workplacesBodyEl.addEventListener("click", (event) => {
  handleWorkplaceTableClick(event);
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

startLiveClock();
setAuthMode("login");
resetWorkplaceForm();
showMapPlaceholder("Location not captured yet.", "Waiting for location");
initFromSession();

window.addEventListener("beforeunload", () => {
  if (liveClockIntervalId) clearInterval(liveClockIntervalId);
});
