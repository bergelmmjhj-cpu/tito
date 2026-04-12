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
    const existingEmail = (existingAdmin.email || "").toLowerCase();
    const configEmail = config.email.toLowerCase();
    const emailMatchesEnv = existingEmail === configEmail;
    // Treat the built-in dev placeholder as something we should always replace.
    const isPlaceholder = existingEmail === "admin@hotel.local";

    // Diagnostic log — shows first 3 chars of existing admin email so we can
    // confirm which account is in the DB without exposing the full address.
    const emailHint = existingAdmin.email
      ? `${existingAdmin.email.slice(0, 3)}***@${existingAdmin.email.split("@")[1] || "?"}`
      : "unknown";
    console.log(`[bootstrap] found_admin email_hint=${emailHint} match_env=${emailMatchesEnv} is_placeholder=${isPlaceholder}`);

    if (emailMatchesEnv || isPlaceholder) {
      const patch = {};

      // Always sync the password from env vars.
      const { salt, hash } = createPasswordHash(config.password);
      patch.passwordSalt = salt;
      patch.passwordHash = hash;

      if (isPlaceholder && !emailMatchesEnv) {
        // Moving from placeholder to real admin — check for conflicts first.
        const emailConflict = await findUserByEmail(config.email);
        if (emailConflict && emailConflict.id !== existingAdmin.id) {
          return { created: false, reason: "admin_exists", admin: null };
        }

        const staffConflict = await findUserByStaffId(config.staffId);
        if (!staffConflict || staffConflict.id === existingAdmin.id) {
          patch.staffId = config.staffId;
        }

        patch.email = config.email;
        patch.firstName = config.firstName;
        patch.lastName = config.lastName;
        patch.name = `${config.firstName} ${config.lastName}`;
      }

      const updatedUser = await updateUserById(existingAdmin.id, patch);
      const reason = isPlaceholder && !emailMatchesEnv ? "placeholder_replaced" : "password_synced";
      return { created: false, reason, admin: sanitizeUser(updatedUser || existingAdmin) };
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
