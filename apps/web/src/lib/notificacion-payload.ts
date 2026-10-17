/**
 * Tipos + reexport del armado puro (Tramo B → modulos/notificaciones).
 * Templates exactos — no alterar titulo/cuerpo sin acuerdo de producto.
 */
export type NotificacionTipo =
  | "mensaje_nuevo"
  | "solicitud_contacto"
  | "solicitud_aceptada"
  | "expediente_compartido"
  | "cerrador_asignado"
  | "followup_pendiente"
  | "venta_pendiente"
  | "nota_programada"
  | "respuesta_soporte";

export type NotificacionPayload = {
  tipo: NotificacionTipo;
  titulo: string;
  cuerpo: string;
  avatarUrl?: string;
  iconoCategoria?: string;
  rutaDestino: string;
  entidadId: string;
  agrupada?: boolean;
  cantidadAgrupada?: number;
};

export { truncar, armarNotificacion } from "@/modulos/notificaciones/index.js";
