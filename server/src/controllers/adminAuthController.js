import { loginAdmin } from "../services/authService.js";
import { toHttpError } from "../utils/errors.js";

export async function adminLoginController(req, res) {
  try {
    const { identifier, password } = req.body || {};
    const result = await loginAdmin(identifier, password);
    res.json(result);
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function adminMeController(req, res) {
  try {
    res.json({ user: req.user });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}

export async function adminAccessController(req, res) {
  try {
    res.json({
      authenticated: true,
      isAdmin: req.user?.role === "admin",
      role: req.user?.role || null,
    });
  } catch (error) {
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
