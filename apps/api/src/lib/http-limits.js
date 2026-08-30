/**
 * Límite del body parser JSON (Express) y de nginx client_max_body_size.
 *
 * El techo anterior (15 MB) no correspondía a ningún payload real.
 * El más grande que sí viaja como JSON (no Storage directo) es la captura de
 * un ticket de soporte: el API acepta hasta 5 MB decodificados
 * (support-service MAX_SCREENSHOT_BYTES) → data URL base64 ≈ 6.7 MB + campos.
 * Branding manda data URL de un archivo ya recortado (máx. 2 MB origen ≈ 2.7 MB).
 * Worksheet / PUT tool-calculations / PUT /sync quedan en decenas–cientos de KB
 * (el e2e de egress usa 250 KB/fila de tools y 80 KB/cliente en sync).
 *
 * 8 MB cubre la captura de 5 MB con margen y deja de aceptar blobs arbitrarios.
 */
export const JSON_BODY_LIMIT = "8mb";
