import {
  createUserAsAdmin,
  listAdminUsers,
  setUserActiveStateByAdmin,
  setUserRoleByAdmin,
} from "../services/adminUserService.js";
import { toHttpError } from "../utils/errors.js";

export async function listAdminUsersController(req, res) {
  try {
    const users = await listAdminUsers();
    res.json({ users });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function createAdminUserController(req, res) {
  try {
    const createdUser = await createUserAsAdmin(req.body || {}, req.user || null);
    res.status(201).json({ user: createdUser });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function setAdminUserStatusController(req, res) {
  try {
    const user = await setUserActiveStateByAdmin(
      req.params.userId,
      req.body?.isActive,
      req.user || null
    );
    res.json({ user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function setAdminUserRoleController(req, res) {
  try {
    const user = await setUserRoleByAdmin(req.params.userId, req.body?.role, req.user || null);
    res.json({ user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
