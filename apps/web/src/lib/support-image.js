import imageCompression from "browser-image-compression";

/** Máx. del archivo original antes de comprimir (SDD soporte). */
export const SUPPORT_MAX_SOURCE_BYTES = 5 * 1024 * 1024;
/** Ancho máx. tras redimensionar. */
export const SUPPORT_MAX_WIDTH_PX = 1600;
/** Calidad JPEG/WebP aproximada. */
export const SUPPORT_COMPRESS_QUALITY = 0.78;

/**
 * Comprime/redimensiona una captura de soporte en el navegador.
 * @param {File} file
 * @returns {Promise<{ file: File, dataUrl: string, originalBytes: number, compressedBytes: number }>}
 */
export async function compressSupportScreenshot(file) {
  if (!file || !(file instanceof Blob)) {
    throw Object.assign(new Error("Archivo inválido."), { code: "INVALID_FILE" });
  }
  const originalBytes = file.size;
  if (originalBytes > SUPPORT_MAX_SOURCE_BYTES) {
    throw Object.assign(
      new Error("La captura supera el máximo de 5 MB."),
      { code: "FILE_TOO_LARGE" },
    );
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: 0.85,
    maxWidthOrHeight: SUPPORT_MAX_WIDTH_PX,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: SUPPORT_COMPRESS_QUALITY,
  });

  const outFile = new File(
    [compressed],
    String(file.name || "captura").replace(/\.\w+$/, "") + ".jpg",
    { type: "image/jpeg", lastModified: Date.now() },
  );

  const dataUrl = await imageCompression.getDataUrlFromFile(outFile);
  return {
    file: outFile,
    dataUrl,
    originalBytes,
    compressedBytes: outFile.size,
  };
}
