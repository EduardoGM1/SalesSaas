import * as delegacionService from "../services/delegacion-service.js";

export async function listarTechoDelegacion(auth, query) {
  return delegacionService.listCeilingKeys(auth.userId, {
    empresaId: query.empresa_id || null,
    salaId: query.sala_id || null,
  });
}

export async function listarPermisosDelegados(auth, query) {
  return delegacionService.listDelegatedKeys(auth.userId, {
    asistenteId: query.asistente_id,
    empresaId: query.empresa_id || null,
    salaId: query.sala_id || null,
  });
}

export async function reemplazarPermisosDelegados(auth, body) {
  return delegacionService.replaceDelegatedPermissions(auth.userId, {
    asistenteId: body.asistente_id,
    empresaId: body.empresa_id || null,
    salaId: body.sala_id || null,
    permisoKeys: body.permiso_keys || [],
  });
}

export async function listarAccesoCruzado(auth, empresaId, gerenteId) {
  return delegacionService.listAccesoCruzado(auth.userId, empresaId, gerenteId);
}

export async function fijarAccesoCruzado(auth, empresaId, gerenteId, body) {
  return delegacionService.setAccesoCruzado(
    auth.userId,
    empresaId,
    gerenteId,
    body.sala_id,
    body.activo !== false,
  );
}
