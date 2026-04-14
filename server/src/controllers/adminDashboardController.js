import { getAdminDashboardStats } from "../services/adminDashboardService.js";
import { toHttpError } from "../utils/errors.js";

export async function dashboardController(req, res) {
  try {
    const stats = await getAdminDashboardStats();
    res.json({ stats });
  } catch (error) {
    console.error("[admin.dashboard] failed", {
      adminUserId: req.user?.id || null,
      message: error?.message || "unknown_error",
    });
    const err = toHttpError(error);
    res.status(err.status).json({ error: err.message });
  }
}
