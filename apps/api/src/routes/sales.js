import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as salesController from "../controllers/sales-controller.js";

const router = Router();
router.get("/sales", rutaAutenticada(salesController.listarVentas));
router.post("/sales", rutaAutenticada(salesController.crearVenta, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/sales/:id", rutaAutenticada(salesController.obtenerVenta, { wrap: "data" }));
router.patch("/sales/:id", rutaAutenticada(salesController.actualizarVenta, { cuerpo: true, wrap: "data" }));
router.delete("/sales/:id", rutaAutenticada(salesController.eliminarVenta, { wrap: "ok" }));
export default router;
