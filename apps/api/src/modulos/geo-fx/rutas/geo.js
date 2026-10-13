import { Router } from "express";
import { json } from "../../../lib/http.js";
import { runService } from "../../../routes/route-utils.js";
import * as geoControlador from "../controladores/geo-controlador.js";

const router = Router();

router.get("/geo/countries", (_req, res) => {
  json(res, { data: geoControlador.listarPaises() });
});

router.get("/geo/countries/:country/cities", (req, res) => {
  runService(res, () => geoControlador.listarCiudades(req.params.country), { wrap: "data" });
});

export default router;
