import crypto from "node:crypto";
import {
  createUser,
  findUserByEmail,
  findUserByIdentifier,
  findUserByStaffId,
  findUserById,
  listUsers,
  updateUserById,
} from "../models/userModel.js";
import { createPasswordHash, verifyPassword } from "../utils/password.js";
import { HttpError } from "../utils/errors.js";
import { createSession, deleteSession, getSessionUserId } from "./sessionService.js";

const PASSWORD_MIN_LENGTH = 8;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPE = "openid email profile";

function sanitizeUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    staffId: user.staffId,
    role: user.role,
    isActive: user.isActive !== false,
    assignedWorkplaceId: user.profile?.assignedWorkplaceId || null,
    forcePasswordReset: user.forcePasswordReset === true,
  };
}

function normalizeEmail(email) {
  if (typeof email !== "string" || !email.trim()) {
    throw new HttpError(400, "Email is required");
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, "Email format is invalid");
  }

  return normalized;
}

function normalizeName(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required`);
  }
  return value.trim();
}

function normalizePhone(phone) {
  if (phone === undefined || phone === null || phone === "") return null;
  if (typeof phone !== "string") throw new HttpError(400, "Phone number must be a string");

  const clean = phone.trim();
  if (!clean) return null;
  if (clean.length > 30) throw new HttpError(400, "Phone number is too long");

  return clean;
}

function normalizeOptionalName(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function validatePassword(password, confirmPassword) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(400, "Password must include at least one letter and one number");
  }

  if (password !== confirmPassword) {
    throw new HttpError(400, "Password confirmation does not match");
  }
}

async function generateStaffId() {
  const users = await listUsers();
  let max = 1000;

  for (const user of users) {
    const match = /^W(\d+)$/.exec(user.staffId || "");
    if (!match) continue;
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > max) max = numeric;
  }

  let candidate = max + 1;
  while (await findUserByStaffId(`W${candidate}`)) {
    candidate += 1;
  }

  return `W${candidate}`;
}

function getGoogleOAuthConfig(origin) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim() ||
    (origin ? `${origin}/api/auth/google/callback` : "");

  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(500, "Google OAuth is not configured on the server");
  }

  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthEnabled(origin) {
  try {
    getGoogleOAuthConfig(origin);
    return true;
  } catch {
    return false;
  }
}

export function getAuthOptions(origin) {
  return {
    unifiedLogin: true,
    providers: {
      google: {
        enabled: isGoogleOAuthEnabled(origin),
      },
    },
  };
}

async function exchangeGoogleCodeForTokens(code, origin) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(origin);
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || "Google token exchange failed";
    throw new HttpError(401, message);
  }

  return payload;
}

async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.email) {
    throw new HttpError(401, "Failed to read Google account profile");
  }

  if (payload.email_verified === false) {
    throw new HttpError(403, "Google account email is not verified");
  }

  return payload;
}

async function findOrCreateGoogleUser(googleProfile) {
  const email = normalizeEmail(googleProfile.email);
  const firstName = normalizeOptionalName(
    googleProfile.given_name,
    normalizeOptionalName(googleProfile.name?.split(" ")?.[0], "Google")
  );
  const lastName = normalizeOptionalName(
    googleProfile.family_name,
    normalizeOptionalName(googleProfile.name?.split(" ")?.slice(1).join(" "), "User")
  );
  const now = new Date().toISOString();
  const providerProfile = {
    authProvider: "google",
    googleSubject: typeof googleProfile.sub === "string" ? googleProfile.sub : null,
    googlePicture: typeof googleProfile.picture === "string" ? googleProfile.picture : null,
    createdFrom: "google_oauth",
  };

  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.isActive === false) {
      throw new HttpError(403, "User account is inactive");
    }

    const nextProfile = {
      ...(existing.profile || {}),
      ...providerProfile,
    };

    const profileChanged = JSON.stringify(existing.profile || {}) !== JSON.stringify(nextProfile);
    const nameChanged = !existing.firstName || !existing.lastName;

    if (profileChanged || nameChanged) {
      return (await updateUserById(existing.id, {
        firstName: existing.firstName || firstName,
        lastName: existing.lastName || lastName,
        name: existing.name || `${firstName} ${lastName}`,
        profile: nextProfile,
      })) || existing;
    }

    return existing;
  }

  const generatedPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { salt, hash } = createPasswordHash(generatedPassword);

  return createUser({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    phone: null,
    staffId: await generateStaffId(),
    role: "worker",
    isActive: true,
    profile: providerProfile,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
  });
}

async function authenticateWithCredentials(identifier, password) {
  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new HttpError(400, "Staff ID or email is required");
  }
  if (typeof password !== "string" || !password.trim()) {
    throw new HttpError(400, "Password is required");
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) throw new HttpError(401, "Invalid login credentials");
  if (user.isActive === false) throw new HttpError(403, "User account is inactive");

  const ok = verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid login credentials");

  return user;
}

export async function login(identifier, password) {
  const user = await authenticateWithCredentials(identifier, password);

  const token = await createSession(user.id);
  return {
    token,
    user: sanitizeUser(user),
    requiresPasswordReset: user.forcePasswordReset === true,
  };
}

export function buildGoogleAuthorizationUrl(origin, state) {
  const { clientId, redirectUri } = getGoogleOAuthConfig(origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });

  if (state) params.set("state", state);

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function loginWithGoogleAuthorizationCode(code, origin) {
  if (typeof code !== "string" || !code.trim()) {
    throw new HttpError(400, "Google authorization code is required");
  }

  const tokens = await exchangeGoogleCodeForTokens(code.trim(), origin);
  const googleProfile = await fetchGoogleUserProfile(tokens.access_token);
  const user = await findOrCreateGoogleUser(googleProfile);
  const token = await createSession(user.id);

  return { token, user: sanitizeUser(user) };
}

export async function loginAdmin(identifier, password) {
  const user = await authenticateWithCredentials(identifier, password);

  if (user.role !== "admin") {
    throw new HttpError(403, "Forbidden: admin role required");
  }

  const token = await createSession(user.id);
  return {
    token,
    user: sanitizeUser(user),
    requiresPasswordReset: user.forcePasswordReset === true,
  };
}

export async function registerWorker(payload = {}) {
  const firstName = normalizeName(payload.firstName, "First name");
  const lastName = normalizeName(payload.lastName, "Last name");
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);

  validatePassword(payload.password, payload.confirmPassword);

  if (await findUserByEmail(email)) {
    throw new HttpError(409, "Email is already registered");
  }

  const { salt, hash } = createPasswordHash(payload.password);
  const now = new Date().toISOString();
  const user = await createUser({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    phone,
    staffId: await generateStaffId(),
    role: "worker",
    isActive: true,
    profile: {
      phone,
      createdFrom: "self_signup",
    },
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
  });

  const token = await createSession(user.id);
  return { token, user: sanitizeUser(user) };
}

export async function requireUserFromToken(token) {
  if (!token) throw new HttpError(401, "Authentication required");
  const userId = await getSessionUserId(token);
  if (!userId) throw new HttpError(401, "Session expired or invalid");
  const user = await findUserById(userId);
  if (!user) throw new HttpError(401, "Invalid session user");
  return sanitizeUser(user);
}

export async function logout(token) {
  if (!token) return;
  await deleteSession(token);
}
