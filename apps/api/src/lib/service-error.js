export class ServiceError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    if (code) this.code = code;
  }
}

export function assertFound(row, message = "No encontrado.", status = 404) {
  if (!row) throw new ServiceError(message, status);
  return row;
}
