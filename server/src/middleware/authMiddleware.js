import { requireUserFromToken } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";
import { parseBearerToken } from "../utils/auth.js";

export async function authMiddleware(req, res, next) {
  try {
    const token = parseBearerToken(req);
    req.user = await requireUserFromToken(token);
    next();
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
