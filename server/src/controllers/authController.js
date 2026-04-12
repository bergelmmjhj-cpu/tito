import { login, registerWorker, requireUserFromToken } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";
import { parseBearerToken } from "../utils/auth.js";

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
