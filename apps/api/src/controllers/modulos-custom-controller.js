/**
 * Controller de módulos custom por tenant.
 */
import * as modulosCustomService from "../services/modulos-custom-service.js";

export async function listarFlagsEmpresa(auth, empresaId) {
  return modulosCustomService.listFlagsForEmpresa(auth.userId, empresaId);
}

export async function crearModuloCustom(auth, empresaId, body) {
  return modulosCustomService.createCustomModule(auth.userId, empresaId, body);
}

export async function actualizarModuloCustom(auth, empresaId, moduloId, body) {
  return modulosCustomService.updateCustomModule(auth.userId, empresaId, moduloId, body);
}

export async function upsertDatosModulo(auth, empresaId, moduloId, body) {
  return modulosCustomService.upsertModuloCustomDatos(auth.userId, empresaId, moduloId, body);
}

export async function listarDatosModulo(auth, empresaId, moduloId, query) {
  return modulosCustomService.listModuloCustomDatos(auth.userId, empresaId, moduloId, {
    entidadId: query?.entidad_id || query?.entidadId,
  });
}
