import { requireUserFromToken } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";

function getBearerToken(req) {
  const value = req.headers.authorization || "";
  const [type, token] = value.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token.trim();
}

export function authMiddleware(req, res, next) {
  try {
    const token = getBearerToken(req);
    req.user = requireUserFromToken(token);
    next();
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
