const TOKEN_KEY = "timeclock_token";

console.log("[auth] app.js loaded");

function first(selectors = []) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function byId(id) {
  return document.getElementById(id);
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("hidden", !message);
}

function redirectForUser(user) {
  if (user?.role === "admin") {
    window.location.replace("/admin/");
    return;
  }
  window.location.replace("/worker/");
}

async function apiFetch(path, options = {}) {
  const { headers: extraHeaders = {}, ...restOptions } = options;
  const request = {
    ...restOptions,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  };
  console.log("[auth] fetch start", request.method || "GET", path);
  const res = await fetch(path, request);
  console.log("[auth] fetch response", request.method || "GET", path, res.status);

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  let payload = raw;
  if (contentType.includes("application/json")) {
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = raw;
    }
  }

  if (!res.ok) {
    const errorMessage =
      typeof payload === "string" ? payload : (payload?.error || "Request failed");
    throw new Error(errorMessage);
  }

  return payload;
}

function setView({ loginViewEl, signupViewEl, loginHelpTextEl, showLogin }) {
  if (loginViewEl) loginViewEl.classList.toggle("hidden", !showLogin);
  if (signupViewEl) signupViewEl.classList.toggle("hidden", showLogin);
  if (loginHelpTextEl) {
    loginHelpTextEl.textContent = showLogin
      ? "Staff and admins use the same login with their Staff ID or email."
      : "Create your account to start clocking attendance.";
  }
}

function bindClick(label, el, handler) {
  if (!el) {
    console.warn(`[auth] ${label} element not found; handler not attached`);
    return;
  }
  el.addEventListener("click", handler);
  console.log(`[auth] ${label} click handler attached`);
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[auth] DOMContentLoaded fired");

  const loginBtn = first(["#loginBtn", "button[data-action='login']"]);
  const signupBtn = first(["#signupBtn", "button[data-action='signup']"]);
  const googleLoginBtn = first(["#googleLoginBtn", "button[data-action='google-login']"]);

  const showLoginBtn = first(["#showLoginBtn", "button[data-view='login']"]);
  const showSignupBtn = first(["#showSignupBtn", "button[data-view='signup']"]);

  const loginFormView = byId("loginFormView");
  const signupFormView = byId("signupFormView");
  const loginHelpText = byId("loginHelpText");
  const loginError = byId("loginError");
  const signupError = byId("signupError");
  const authDivider = byId("authDivider");

  const identifierEl = byId("identifier");
  const passwordEl = byId("password");

  const signupFirstNameEl = byId("signupFirstName");
  const signupLastNameEl = byId("signupLastName");
  const signupEmailEl = byId("signupEmail");
  const signupPhoneEl = byId("signupPhone");
  const signupPasswordEl = byId("signupPassword");
  const signupConfirmPasswordEl = byId("signupConfirmPassword");

  bindClick("showLoginBtn", showLoginBtn, () => {
    console.log("[auth] show-login clicked");
    setView({ loginViewEl: loginFormView, signupViewEl: signupFormView, loginHelpTextEl: loginHelpText, showLogin: true });
  });

  bindClick("showSignupBtn", showSignupBtn, () => {
    console.log("[auth] show-signup clicked");
    setView({ loginViewEl: loginFormView, signupViewEl: signupFormView, loginHelpTextEl: loginHelpText, showLogin: false });
  });

  bindClick("loginBtn", loginBtn, async () => {
    console.log("[auth] loginBtn clicked");
    showError(loginError, "");

    const identifier = (identifierEl?.value || "").trim();
    const password = (passwordEl?.value || "").trim();

    if (!identifier || !password) {
      showError(loginError, "Staff ID/email and password are required.");
      return;
    }

    try {
      const result = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      if (result?.token) localStorage.setItem(TOKEN_KEY, result.token);
      redirectForUser(result?.user);
    } catch (error) {
      showError(loginError, error.message || "Login failed.");
    }
  });

  bindClick("signupBtn", signupBtn, async () => {
    console.log("[auth] signupBtn clicked");
    showError(signupError, "");

    const payload = {
      firstName: (signupFirstNameEl?.value || "").trim(),
      lastName: (signupLastNameEl?.value || "").trim(),
      email: (signupEmailEl?.value || "").trim(),
      phone: (signupPhoneEl?.value || "").trim(),
      password: (signupPasswordEl?.value || "").trim(),
      confirmPassword: (signupConfirmPasswordEl?.value || "").trim(),
    };

    if (!payload.firstName || !payload.lastName || !payload.email || !payload.password || !payload.confirmPassword) {
      showError(signupError, "Please complete all required sign-up fields.");
      return;
    }
    if (payload.password !== payload.confirmPassword) {
      showError(signupError, "Password and confirm password must match.");
      return;
    }

    try {
      const result = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result?.token) localStorage.setItem(TOKEN_KEY, result.token);
      redirectForUser(result?.user);
    } catch (error) {
      showError(signupError, error.message || "Sign up failed.");
    }
  });

  bindClick("googleLoginBtn", googleLoginBtn, () => {
    console.log("[auth] googleLoginBtn clicked");
    console.log("[auth] fetch start", "GET", "/api/auth/google");
    window.location.assign("/api/auth/google");
  });

  const authError = new URLSearchParams(window.location.search).get("authError");
  if (authError) {
    showError(loginError, authError);
    setView({ loginViewEl: loginFormView, signupViewEl: signupFormView, loginHelpTextEl: loginHelpText, showLogin: true });
  }

  apiFetch("/api/auth/options")
    .then((options) => {
      const googleEnabled = Boolean(options?.providers?.google?.enabled);
      if (googleLoginBtn) googleLoginBtn.classList.toggle("hidden", !googleEnabled);
      if (authDivider) authDivider.classList.toggle("hidden", !googleEnabled);
      console.log("[auth] google login enabled:", googleEnabled);
    })
    .catch((error) => {
      console.warn("[auth] failed to load auth options:", error.message);
    });
});
