import crypto from "node:crypto";
import {
  createUser,
  findUserByEmail,
  findUserByIdentifier,
  findUserByStaffId,
  findUserById,
  listUsers,
} from "../models/userModel.js";
import { createPasswordHash, verifyPassword } from "../utils/password.js";
import { HttpError } from "../utils/errors.js";
import { createSession, getSessionUserId } from "./sessionService.js";

const PASSWORD_MIN_LENGTH = 8;

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

function validatePassword(password, confirmPassword) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
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
  return { token, user: sanitizeUser(user) };
}

export async function loginAdmin(identifier, password) {
  const user = await authenticateWithCredentials(identifier, password);

  if (user.role !== "admin") {
    throw new HttpError(403, "Forbidden: admin role required");
  }

  const token = await createSession(user.id);
  return { token, user: sanitizeUser(user) };
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
