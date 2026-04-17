import { validateHotelsData } from "../services/workplaceService.js";
import { toHttpError } from "../utils/errors.js";

export async function validateHotelsController(req, res) {
  try {
    const report = await validateHotelsData();
    res.json({ report });
  } catch (error) {
    console.error("[admin.hotels.validate] failed", {
      adminUserId: req.user?.id || null,
      message: error?.message || "unknown_error",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
