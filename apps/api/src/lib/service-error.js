export class ServiceError extends Error {
  /** @param {object} [details] campos extra del cuerpo de error (sin datos sensibles) */
  constructor(message, status = 400, code, details) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    if (code) this.code = code;
    if (details) this.details = details;
  }
}

export function assertFound(row, message = "No encontrado.", status = 404) {
  if (!row) throw new ServiceError(message, status);
  return row;
}
