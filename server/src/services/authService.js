import { findUserByIdentifier, findUserById } from "../models/userModel.js";
import { verifyPassword } from "../utils/password.js";
import { HttpError } from "../utils/errors.js";
import { createSession, getSessionUserId } from "./sessionService.js";

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    staffId: user.staffId,
    role: user.role,
  };
}

export function login(identifier, password) {
  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new HttpError(400, "Staff ID or email is required");
  }
  if (typeof password !== "string" || !password.trim()) {
    throw new HttpError(400, "Password is required");
  }

  const user = findUserByIdentifier(identifier);
  if (!user) throw new HttpError(401, "Invalid login credentials");

  const ok = verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid login credentials");

  const token = createSession(user.id);
  return { token, user: sanitizeUser(user) };
}

export function requireUserFromToken(token) {
  if (!token) throw new HttpError(401, "Authentication required");
  const userId = getSessionUserId(token);
  if (!userId) throw new HttpError(401, "Session expired or invalid");
  const user = findUserById(userId);
  if (!user) throw new HttpError(401, "Invalid session user");
  return sanitizeUser(user);
}
