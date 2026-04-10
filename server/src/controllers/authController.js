import { login, requireUserFromToken } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";

function getBearerToken(req) {
  const value = req.headers.authorization || "";
  const [type, token] = value.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token.trim();
}

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
    const token = getBearerToken(req);
    const user = requireUserFromToken(token);
    res.json({ user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
