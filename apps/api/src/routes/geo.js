import { Router } from "express";
import { json } from "../lib/http.js";
import { runService } from "./route-utils.js";
import * as geoController from "../controllers/geo-controller.js";

const router = Router();

router.get("/geo/countries", (_req, res) => {
  json(res, { data: geoController.listarPaises() });
});

router.get("/geo/countries/:country/cities", (req, res) => {
  runService(res, () => geoController.listarCiudades(req.params.country), { wrap: "data" });
});

export default router;
