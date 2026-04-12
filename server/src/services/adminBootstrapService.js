import crypto from "node:crypto";
import { getBootstrapAdminSeed } from "../db/migrations.js";
import { createPasswordHash } from "../utils/password.js";
import { HttpError } from "../utils/errors.js";
import { createUser, findUserByEmail, findUserByStaffId, listUsers, updateUserById, findUserByIdentifier } from "../models/userModel.js";

const PASSWORD_MIN_LENGTH = 8;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function ensureValidBootstrapConfig(config) {
  if (!isValidEmail(config.email)) {
    throw new HttpError(400, "ADMIN_EMAIL format is invalid");
  }

  if (typeof config.password !== "string" || config.password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email,
    staffId: user.staffId,
    role: user.role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
  };
}

export async function ensureBootstrapAdminExists(source = "startup") {
  const config = getBootstrapAdminSeed();
  ensureValidBootstrapConfig(config);

  const users = await listUsers();
  const existingAdmin = users.find((user) => user.role === "admin");

  if (existingAdmin) {
    // If the env-configured email matches the existing admin, sync the password
    // so that changing ADMIN_PASSWORD in the environment takes effect on redeploy.
    if (
      existingAdmin.email &&
      existingAdmin.email.toLowerCase() === config.email.toLowerCase()
    ) {
      const { salt, hash } = createPasswordHash(config.password);
      await updateUserById(existingAdmin.id, {
        passwordSalt: salt,
        passwordHash: hash,
        updatedAt: new Date().toISOString(),
      });
      return { created: false, reason: "password_synced", admin: sanitizeUser(existingAdmin) };
    }
    return { created: false, reason: "admin_exists", admin: null };
  }

  const conflictingUser = await findUserByEmail(config.email);
  if (conflictingUser) {
    throw new HttpError(
      409,
      `Cannot bootstrap admin: email ${config.email} is already used by another user`
    );
  }

  const staffConflict = await findUserByStaffId(config.staffId);
  if (staffConflict) {
    throw new HttpError(
      409,
      `Cannot bootstrap admin: staff ID ${config.staffId} is already used by another user`
    );
  }

  const now = new Date().toISOString();
  const { salt, hash } = createPasswordHash(config.password);
  const adminUser = await createUser({
    id: crypto.randomUUID(),
    firstName: config.firstName,
    lastName: config.lastName,
    name: `${config.firstName} ${config.lastName}`,
    email: config.email,
    phone: null,
    staffId: config.staffId,
    role: "admin",
    isActive: true,
    profile: {
      createdFrom: source,
    },
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
  });

  return { created: true, reason: "created", admin: sanitizeUser(adminUser) };
}

export async function promoteUserToAdmin(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    throw new HttpError(400, "Identifier is required (staff ID or email)");
  }

  const user = await findUserByIdentifier(identifier);

  if (!user) {
    throw new HttpError(404, `User not found for identifier: ${identifier}`);
  }

  if (user.role === "admin") {
    return { updated: false, reason: "already_admin", user: sanitizeUser(user) };
  }

  const updatedUser = await updateUserById(user.id, {
    role: "admin",
    updatedAt: new Date().toISOString(),
    profile: {
      ...(user.profile && typeof user.profile === "object" ? user.profile : {}),
      promotedToAdminAt: new Date().toISOString(),
    },
  });

  return { updated: true, reason: "promoted", user: sanitizeUser(updatedUser) };
}

export async function hasAnyAdminUser() {
  const users = await listUsers();
  return users.some((user) => user.role === "admin");
}
