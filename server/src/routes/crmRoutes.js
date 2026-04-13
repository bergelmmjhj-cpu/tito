import { Router } from "express";
import { isCrmPoolReady } from "../db/crmPool.js";
import {
  getHotelByIdFromCrm,
  getHotelRatesFromCrm,
  getHotelsFromCrm,
} from "../services/crmHotelService.js";
import {
  getWorkplaceByIdFromCrm,
  getWorkplacesFromCrm,
} from "../services/workplaceService.js";
import { toHttpError } from "../utils/errors.js";

function crmAvailabilityGuard(req, res, next) {
  if (!isCrmPoolReady()) {
    return res
      .status(503)
      .json({ error: "CRM database is not available. CRM_DATABASE_URL is not configured." });
  }
  next();
}

export function createCrmRoutes() {
  const router = Router();

  // All CRM routes require the CRM pool to be ready
  router.use(crmAvailabilityGuard);

  // --- Workplaces ---

  // GET /api/crm/workplaces
  router.get("/workplaces", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive !== "false";
      const workplaces = await getWorkplacesFromCrm(includeInactive);
      res.json({ workplaces });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  // GET /api/crm/workplaces/:workplaceId
  router.get("/workplaces/:workplaceId", async (req, res) => {
    try {
      const workplace = await getWorkplaceByIdFromCrm(req.params.workplaceId);
      res.json({ workplace });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  // --- Hotels ---

  // GET /api/crm/hotels
  router.get("/hotels", async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive !== "false";
      const hotels = await getHotelsFromCrm(includeInactive);
      res.json({ hotels });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  // GET /api/crm/hotels/:hotelId
  router.get("/hotels/:hotelId", async (req, res) => {
    try {
      const hotel = await getHotelByIdFromCrm(req.params.hotelId);
      res.json({ hotel });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  // GET /api/crm/hotels/:hotelId/rates
  router.get("/hotels/:hotelId/rates", async (req, res) => {
    try {
      const rates = await getHotelRatesFromCrm(req.params.hotelId);
      res.json({ rates });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ error: err.message });
    }
  });

  return router;
}
