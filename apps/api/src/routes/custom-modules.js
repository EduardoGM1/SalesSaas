import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as modulosCustomController from "../controllers/modulos-custom-controller.js";

const router = Router();

router.get("/custom-modules", rutaAutenticada(
  (auth, req) => modulosCustomController.listarModulosWorkspace(auth, req.query),
  { wrap: "data" },
));
router.get("/custom-modules/:moduloId/datos", rutaAutenticada(
  (auth, req) => modulosCustomController.obtenerDatosEntidad(auth, req.params.moduloId, req.query),
  { wrap: "data" },
));
router.put("/custom-modules/:moduloId/datos", rutaAutenticada(
  (auth, req, body) => modulosCustomController.guardarDatosEntidad(auth, req.params.moduloId, body),
  { cuerpo: true, wrap: "data" },
));

export default router;
