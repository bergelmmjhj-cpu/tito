const loginViewEl = document.getElementById("loginView");
const appViewEl = document.getElementById("appView");
const identifierEl = document.getElementById("identifier");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
const loginErrorEl = document.getElementById("loginError");
const workerNameEl = document.getElementById("workerName");
const liveClockEl = document.getElementById("liveClock");
const statusBadgeEl = document.getElementById("statusBadge");
const actionErrorEl = document.getElementById("actionError");
const notesEl = document.getElementById("notes");
const clockInBtnEl = document.getElementById("clockInBtn");
const startBreakBtnEl = document.getElementById("startBreakBtn");
const endBreakBtnEl = document.getElementById("endBreakBtn");
const clockOutBtnEl = document.getElementById("clockOutBtn");
const historyBodyEl = document.getElementById("historyBody");
const refreshHistoryBtnEl = document.getElementById("refreshHistoryBtn");
const logoutBtnEl = document.getElementById("logoutBtn");

const TOKEN_KEY = "timeclock_token";
let authToken = localStorage.getItem(TOKEN_KEY) || "";
let currentStatus = "not_clocked_in";
let liveClockIntervalId = null;

const API_BASE_URL = (() => {
  const configured = window.TIME_CLOCK_API_BASE_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.replace(/\/$/, "");
  }
  return window.location.protocol === "file:" ? "http://localhost:3000" : "";
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

function renderStatus(status) {
  currentStatus = status || "not_clocked_in";
  statusBadgeEl.textContent = toStatusLabel(currentStatus);
  clockInBtnEl.disabled = currentStatus !== "not_clocked_in" && currentStatus !== "clocked_out";
  startBreakBtnEl.disabled = currentStatus !== "clocked_in";
  endBreakBtnEl.disabled = currentStatus !== "on_break";
  clockOutBtnEl.disabled = currentStatus !== "clocked_in";
}

function renderHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    historyBodyEl.innerHTML = `<tr><td colspan="6" class="muted">No attendance history yet.</td></tr>`;
    return;
  }

  historyBodyEl.innerHTML = history
    .map((item) => {
      const breakStart = Array.isArray(item.breakStart) && item.breakStart.length
        ? item.breakStart.map(formatDateTime).join("<br>")
        : "—";
      const breakEnd = Array.isArray(item.breakEnd) && item.breakEnd.length
        ? item.breakEnd.map(formatDateTime).join("<br>")
        : "—";

      return `
        <tr>
          <td>${item.date || "—"}</td>
          <td>${formatDateTime(item.timeIn)}</td>
          <td>${breakStart}</td>
          <td>${breakEnd}</td>
          <td>${formatDateTime(item.timeOut)}</td>
          <td>${typeof item.totalHours === "number" ? item.totalHours.toFixed(2) : "0.00"}</td>
        </tr>
      `;
    })
    .join("");
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

function setLoggedOutState() {
  authToken = "";
  localStorage.removeItem(TOKEN_KEY);
  loginViewEl.classList.remove("hidden");
  appViewEl.classList.add("hidden");
  identifierEl.value = "";
  passwordEl.value = "";
}

function setLoggedInState() {
  loginViewEl.classList.add("hidden");
  appViewEl.classList.remove("hidden");
}

async function loadStatus() {
  const data = await apiFetch("/api/time/status");
  workerNameEl.textContent = data?.user?.name || "Worker";
  renderStatus(data?.status);
}

async function loadHistory() {
  const data = await apiFetch("/api/time/history");
  renderHistory(data?.history || []);
}

async function doAction(actionType) {
  setError(actionErrorEl, "");
  const notes = notesEl.value.trim();
  await apiFetch("/api/time/actions", {
    method: "POST",
    body: JSON.stringify({ actionType, notes: notes || undefined }),
  });
  notesEl.value = "";
  await Promise.all([loadStatus(), loadHistory()]);
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
  await Promise.all([loadStatus(), loadHistory()]);
}

async function initFromSession() {
  if (!authToken) {
    setLoggedOutState();
    return;
  }

  try {
    await Promise.all([loadStatus(), loadHistory()]);
    setLoggedInState();
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

loginBtnEl.addEventListener("click", () => {
  login().catch((error) => setError(loginErrorEl, error.message));
});
logoutBtnEl.addEventListener("click", () => setLoggedOutState());
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

startLiveClock();
initFromSession();

window.addEventListener("beforeunload", () => {
  if (liveClockIntervalId) clearInterval(liveClockIntervalId);
});
