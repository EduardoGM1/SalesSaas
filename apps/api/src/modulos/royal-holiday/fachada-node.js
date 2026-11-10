/**
 * Entrada pura de Royal Holiday para cron, admin y ventas.
 * Las fórmulas siguen en @salesapp/shared.
 */
export {
  handleCancelacionVenta,
  getCatalogoVigente,
  publishNuevaVersion,
  getRhMoneyBoxConfig,
  saveRhMoneyBoxConfig,
  getPremanifiestoOlaConfig,
  savePremanifiestoOlaConfig,
} from "./servicios/royal-holiday-service.js";
export { procesarExtraDpCron } from "./controladores/royal-holiday-controller.js";
