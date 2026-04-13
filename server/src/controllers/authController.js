import crypto from "node:crypto";
import {
  buildGoogleAuthorizationUrl,
  login,
  loginWithGoogleAuthorizationCode,
  registerWorker,
  requireUserFromToken,
} from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";
import { parseBearerToken } from "../utils/auth.js";

const GOOGLE_STATE_COOKIE = "google_oauth_state";

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function isSecureRequest(req) {
  return getRequestOrigin(req).startsWith("https://");
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(";").reduce((acc, entry) => {
    const [rawKey, ...rest] = entry.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setGoogleStateCookie(res, state, secure) {
  const parts = [
    `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearGoogleStateCookie(res, secure) {
  const parts = [
    `${GOOGLE_STATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function buildAuthCompleteHtml({ token, error }) {
  const tokenLiteral = JSON.stringify(token || "");
  const errorLiteral = JSON.stringify(error || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Sign In</title>
  </head>
  <body>
    <p>Completing sign-in...</p>
    <script>
      const token = ${tokenLiteral};
      const error = ${errorLiteral};
      if (token) {
        window.localStorage.setItem("timeclock_token", token);
        window.location.replace("/");
      } else {
        const target = new URL("/", window.location.origin);
        if (error) target.searchParams.set("authError", error);
        window.location.replace(target.toString());
      }
    </script>
  </body>
</html>`;
}

export async function registerController(req, res) {
  try {
    const result = await registerWorker(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function loginController(req, res) {
  try {
    const { identifier, password } = req.body || {};
    const result = await login(identifier, password);
    res.json(result);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function meController(req, res) {
  try {
    const token = parseBearerToken(req);
    const user = await requireUserFromToken(token);
    res.json({ user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function googleAuthStartController(req, res) {
  try {
    const state = crypto.randomBytes(24).toString("hex");
    const origin = getRequestOrigin(req);
    const authorizationUrl = buildGoogleAuthorizationUrl(origin, state);
    setGoogleStateCookie(res, state, isSecureRequest(req));
    res.redirect(302, authorizationUrl);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).type("html").send(buildAuthCompleteHtml({ error: err.message }));
  }
}

export async function googleCallbackController(req, res) {
  const secure = isSecureRequest(req);

  try {
    clearGoogleStateCookie(res, secure);

    if (typeof req.query.error === "string" && req.query.error) {
      const description =
        typeof req.query.error_description === "string" && req.query.error_description
          ? req.query.error_description
          : req.query.error;
      res.type("html").send(buildAuthCompleteHtml({ error: description }));
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookies = parseCookies(req);

    if (!code) {
      res.type("html").send(buildAuthCompleteHtml({ error: "Google authorization code is missing" }));
      return;
    }

    if (!state || cookies[GOOGLE_STATE_COOKIE] !== state) {
      res.type("html").send(buildAuthCompleteHtml({ error: "Google sign-in state validation failed" }));
      return;
    }

    const result = await loginWithGoogleAuthorizationCode(code, getRequestOrigin(req));
    res.type("html").send(buildAuthCompleteHtml({ token: result.token }));
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).type("html").send(buildAuthCompleteHtml({ error: err.message }));
  }
}
