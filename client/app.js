const workerIdEl = document.getElementById("workerId");
const hotelNameEl = document.getElementById("hotelName");
const timeInBtn = document.getElementById("timeInBtn");
const timeOutBtn = document.getElementById("timeOutBtn");
const refreshLogsBtn = document.getElementById("refreshLogsBtn");
const resultEl = document.getElementById("result");
const logsEl = document.getElementById("logs");

// v1: simple local dev default
const API_BASE_URL = "http://localhost:3000";

function setResult(objOrText) {
  resultEl.textContent =
    typeof objOrText === "string" ? objOrText : JSON.stringify(objOrText, null, 2);
}

function setLogs(objOrText) {
  logsEl.textContent =
    typeof objOrText === "string" ? objOrText : JSON.stringify(objOrText, null, 2);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof data === "string" ? data : data?.error || "Request failed";
    throw new Error(message);
  }

  return data;
}

function getWorkerId() {
  return workerIdEl.value.trim();
}

function getHotelName() {
  return hotelNameEl.value.trim();
}

async function clockIn() {
  const workerId = getWorkerId();
  const hotelName = getHotelName();

  if (!workerId) return setResult("Worker ID is required.");
  if (!hotelName) return setResult("Hotel Name is required.");

  setResult("Clocking in...");
  const data = await apiFetch("/clock-in", {
    method: "POST",
    body: JSON.stringify({ workerId, hotelName }),
  });
  setResult(data);
  await refreshLogs();
}

async function clockOut() {
  const workerId = getWorkerId();
  if (!workerId) return setResult("Worker ID is required.");

  setResult("Clocking out...");
  const data = await apiFetch("/clock-out", {
    method: "POST",
    body: JSON.stringify({ workerId }),
  });
  setResult(data);
  await refreshLogs();
}

async function refreshLogs() {
  const workerId = getWorkerId();
  if (!workerId) {
    setLogs("Enter a Worker ID to view logs.");
    return;
  }
  const data = await apiFetch(`/logs/${encodeURIComponent(workerId)}`);
  setLogs(data);
}

timeInBtn.addEventListener("click", () =>
  clockIn().catch((err) => setResult(`Error: ${err.message}`))
);
timeOutBtn.addEventListener("click", () =>
  clockOut().catch((err) => setResult(`Error: ${err.message}`))
);
refreshLogsBtn.addEventListener("click", () =>
  refreshLogs().catch((err) => setLogs(`Error: ${err.message}`))
);

setResult("Ready.");
setLogs("Enter a Worker ID then click Refresh Logs.");
