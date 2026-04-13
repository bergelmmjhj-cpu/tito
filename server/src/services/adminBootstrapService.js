import crypto from "node:crypto";
import { getBootstrapAdminSeed } from "../db/migrations.js";
import { createPasswordHash } from "../utils/password.js";
import { HttpError } from "../utils/errors.js";
import { createUser, findUserByEmail, findUserByStaffId, listUsers, updateUserById, findUserByIdentifier } from "../models/userModel.js";

const PASSWORD_MIN_LENGTH = 8;
const DEVELOPMENT_FALLBACK_ADMIN = {
  firstName: "System",
  lastName: "Admin",
  email: "admin@hotel.local",
  password: "admin12345",
  staffId: "A1000",
};

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

function buildBootstrapAdminPatch(config, passwordSalt, passwordHash, source, currentUser = null) {
  return {
    firstName: config.firstName,
    lastName: config.lastName,
    name: `${config.firstName} ${config.lastName}`,
    email: config.email,
    role: "admin",
    isActive: true,
    passwordSalt,
    passwordHash,
    profile: {
      ...(currentUser?.profile && typeof currentUser.profile === "object" ? currentUser.profile : {}),
      createdFrom: currentUser?.profile?.createdFrom || source,
      bootstrapManaged: true,
      bootstrapLastSyncedAt: new Date().toISOString(),
    },
  };
}

export async function ensureBootstrapAdminExists(source = "startup") {
  const seedConfig = getBootstrapAdminSeed();
  let config = seedConfig;
  let usingDevFallback = false;

  try {
    ensureValidBootstrapConfig(config);
  } catch (error) {
    const users = await listUsers();
    const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    if (!isProduction && users.length === 0) {
      config = {
        firstName: seedConfig.firstName || DEVELOPMENT_FALLBACK_ADMIN.firstName,
        lastName: seedConfig.lastName || DEVELOPMENT_FALLBACK_ADMIN.lastName,
        email: isValidEmail(seedConfig.email) ? seedConfig.email : DEVELOPMENT_FALLBACK_ADMIN.email,
        password: DEVELOPMENT_FALLBACK_ADMIN.password,
        staffId: seedConfig.staffId || DEVELOPMENT_FALLBACK_ADMIN.staffId,
      };
      usingDevFallback = true;
    } else {
      throw error;
    }
  }

  const users = await listUsers();
  const adminUsers = users.filter((user) => user.role === "admin");
  const existingAdmin = adminUsers[0] || null;
  const configUserByEmail = await findUserByEmail(config.email);
  const configUserByStaffId = await findUserByStaffId(config.staffId);
  const { salt, hash } = createPasswordHash(config.password);

  if (existingAdmin) {
    const emailHint = existingAdmin.email
      ? `${existingAdmin.email.slice(0, 3)}***@${existingAdmin.email.split("@")[1] || "?"}`
      : "unknown";
    console.log(
      `[bootstrap] found_admin email_hint=${emailHint} admin_count=${adminUsers.length} config_email_present=${Boolean(configUserByEmail)} config_staff_present=${Boolean(configUserByStaffId)}`
    );
  }

  if (configUserByEmail) {
    const patch = buildBootstrapAdminPatch(config, salt, hash, source, configUserByEmail);
    if (!configUserByStaffId || configUserByStaffId.id === configUserByEmail.id) {
      patch.staffId = config.staffId;
    }

    const updatedUser = await updateUserById(configUserByEmail.id, patch);
    const reason = configUserByEmail.role === "admin" ? "password_synced" : "promoted_existing_user";
    return { created: false, reason, admin: sanitizeUser(updatedUser || configUserByEmail) };
  }

  if (configUserByStaffId) {
    const patch = buildBootstrapAdminPatch(config, salt, hash, source, configUserByStaffId);
    patch.staffId = config.staffId;
    const updatedUser = await updateUserById(configUserByStaffId.id, patch);
    const reason = configUserByStaffId.role === "admin" ? "identifier_synced" : "promoted_existing_user";
    return { created: false, reason, admin: sanitizeUser(updatedUser || configUserByStaffId) };
  }

  const now = new Date().toISOString();
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

  if (usingDevFallback) {
    return {
      created: true,
      reason: "created_dev_fallback",
      admin: sanitizeUser(adminUser),
      fallbackCredentials: {
        identifier: config.email,
        password: DEVELOPMENT_FALLBACK_ADMIN.password,
      },
    };
  }

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
