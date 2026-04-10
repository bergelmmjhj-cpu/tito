import { login, requireUserFromToken } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";
import { parseBearerToken } from "../utils/auth.js";

export function loginController(req, res) {
  try {
    const { identifier, password } = req.body || {};
    const result = login(identifier, password);
    res.json(result);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export function meController(req, res) {
  try {
    const token = parseBearerToken(req);
    const user = requireUserFromToken(token);
    res.json({ user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
