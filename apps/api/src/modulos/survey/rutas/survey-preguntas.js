import { Router } from "express";
import { rutaAutenticada } from "../../../routes/route-utils.js";
import * as surveyPreguntasControlador from "../controladores/survey-preguntas-controlador.js";

const router = Router();
router.get(
  "/survey/questions-config",
  rutaAutenticada(surveyPreguntasControlador.obtenerConfigPreguntas, { wrap: "data" }),
);
router.put(
  "/survey/questions-config",
  rutaAutenticada(surveyPreguntasControlador.guardarConfigPreguntas, { cuerpo: true, wrap: "data" }),
);
export default router;
