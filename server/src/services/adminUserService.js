import crypto from "node:crypto";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByStaffId,
  listUsers,
  updateUserById,
} from "../models/userModel.js";
import { HttpError } from "../utils/errors.js";
import { createPasswordHash } from "../utils/password.js";
import { createAuditLogEntry, listAuditLogEntries } from "../models/auditLogModel.js";

const PASSWORD_MIN_LENGTH = 8;
const ALLOWED_ROLES = new Set(["admin", "worker"]);

function normalizeName(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required`);
  }
  return value.trim();
}

function normalizeEmail(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Email is required");
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, "Email format is invalid");
  }

  return normalized;
}

function normalizeStaffId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Staff ID is required");
  }
  return value.trim();
}

function normalizeRole(role) {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "worker";
  if (!ALLOWED_ROLES.has(normalized)) {
    throw new HttpError(400, "Role must be one of: admin, worker");
  }
  return normalized;
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
    createdAt: user.createdAt || null,
  };
}

export async function listAdminUsers() {
  const users = await listUsers();
  return users
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .map(sanitizeUser);
}

export async function createUserAsAdmin(payload = {}, actor = null) {
  const firstName = normalizeName(payload.firstName, "First name");
  const lastName = normalizeName(payload.lastName, "Last name");
  const email = normalizeEmail(payload.email);
  const staffId = normalizeStaffId(payload.staffId);
  const role = normalizeRole(payload.role);

  validatePassword(payload.password, payload.confirmPassword);

  if (await findUserByEmail(email)) {
    throw new HttpError(409, "Email is already registered");
  }

  if (await findUserByStaffId(staffId)) {
    throw new HttpError(409, "Staff ID is already registered");
  }

  const { salt, hash } = createPasswordHash(payload.password);
  const now = new Date().toISOString();

  try {
    const created = await createUser({
      id: crypto.randomUUID(),
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      phone: null,
      staffId,
      role,
      isActive: true,
      profile: {
        createdFrom: "admin_portal",
        createdByUserId: actor?.id || null,
      },
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now,
    });

    return sanitizeUser(created);
  } catch (error) {
    if (error?.code === "23505") {
      throw new HttpError(409, "Email or staff ID already exists");
    }
    throw error;
  }
}

export async function setUserActiveStateByAdmin(userId, isActive, actor = null) {
  if (typeof isActive !== "boolean") {
    throw new HttpError(400, "isActive must be a boolean");
  }

  const target = await findUserById(userId);
  if (!target) throw new HttpError(404, "User not found");

  if (actor && target.id === actor.id && isActive === false) {
    throw new HttpError(400, "You cannot deactivate your own account");
  }

  if (target.role === "admin" && isActive === false) {
    const users = await listUsers();
    const activeAdmins = users.filter((user) => user.role === "admin" && user.isActive !== false);
    const isLastActiveAdmin =
      activeAdmins.length <= 1 && activeAdmins.some((user) => user.id === target.id);
    if (isLastActiveAdmin) {
      throw new HttpError(400, "Cannot deactivate the last active admin");
    }
  }

  const updated = await updateUserById(userId, {
    isActive,
    deactivatedAt: isActive ? null : new Date().toISOString(),
    profile: {
      ...(target.profile && typeof target.profile === "object" ? target.profile : {}),
      updatedByUserId: actor?.id || null,
      updatedByAdminAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  await createAuditLogEntry({
    userId: actor?.id || null,
    action: isActive ? "reactivate_user" : "deactivate_user",
    targetType: "user",
    targetId: userId,
    oldValue: { isActive: target.isActive !== false },
    newValue: { isActive },
  });

  return sanitizeUser(updated);
}

export async function setUserRoleByAdmin(userId, role, actor = null) {
  const normalizedRole = normalizeRole(role);
  const target = await findUserById(userId);
  if (!target) throw new HttpError(404, "User not found");

  if (target.role === normalizedRole) {
    return sanitizeUser(target);
  }

  if (actor && target.id === actor.id && normalizedRole !== "admin") {
    throw new HttpError(400, "You cannot remove your own admin role");
  }

  if (target.role === "admin" && normalizedRole !== "admin") {
    const users = await listUsers();
    const activeAdmins = users.filter((user) => user.role === "admin" && user.isActive !== false);
    const isLastActiveAdmin =
      activeAdmins.length <= 1 && activeAdmins.some((user) => user.id === target.id);
    if (isLastActiveAdmin) {
      throw new HttpError(400, "Cannot demote the last active admin");
    }
  }

  const updated = await updateUserById(userId, {
    role: normalizedRole,
    profile: {
      ...(target.profile && typeof target.profile === "object" ? target.profile : {}),
      updatedByUserId: actor?.id || null,
      updatedByAdminAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  await createAuditLogEntry({
    userId: actor?.id || null,
    action: "change_role",
    targetType: "user",
    targetId: userId,
    oldValue: { role: target.role },
    newValue: { role: normalizedRole },
  });

  return sanitizeUser(updated);
}

export async function resetUserPasswordByAdmin(userId, actor = null) {
  const target = await findUserById(userId);
  if (!target) throw new HttpError(404, "User not found");

  const token = crypto.randomUUID();
  const resetUrl = `https://app.local/reset-password?token=${token}&user=${encodeURIComponent(userId)}`;

  await updateUserById(userId, {
    forcePasswordReset: true,
    profile: {
      ...(target.profile && typeof target.profile === "object" ? target.profile : {}),
      resetPasswordToken: token,
      resetPasswordRequestedAt: new Date().toISOString(),
      updatedByUserId: actor?.id || null,
    },
    updatedAt: new Date().toISOString(),
  });

  await createAuditLogEntry({
    userId: actor?.id || null,
    action: "reset_password_requested",
    targetType: "user",
    targetId: userId,
    oldValue: { forcePasswordReset: target.forcePasswordReset === true },
    newValue: { forcePasswordReset: true },
  });

  console.info("[admin.users.reset-password] placeholder email", {
    to: target.email,
    resetUrl,
  });

  return {
    userId,
    email: target.email,
    resetUrl,
  };
}

export async function listAdminAuditLogs(filters = {}) {
  return listAuditLogEntries(filters);
}
