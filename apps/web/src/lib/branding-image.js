/** Máx. del archivo original antes de procesar (branding). */
export const BRAND_MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export const BRAND_ICON_PRESET = {
  slot: "icon",
  outputSize: 256,
  minSize: 128,
  label: "Ícono de workspace",
  hint: "Cuadrado, recomendado 256×256 px (mín. 128×128). PNG, JPG o WEBP. Máx. 2 MB.",
};

export const BRAND_PRINCIPAL_PRESET = {
  slot: "principal",
  maxWidth: 400,
  maxHeight: 120,
  label: "Logo principal",
  hint: "Horizontal, recomendado hasta 400×120 px. PNG, JPG o WEBP. Máx. 2 MB.",
};

const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function normalizeMime(mime) {
  const m = String(mime || "").toLowerCase();
  return m === "image/jpg" ? "image/jpeg" : m;
}

async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(Object.assign(new Error("No se pudo leer la imagen."), { code: "INVALID_FILE" }));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Recorte centrado (cover) al aspect ratio destino. */
function drawCoverCrop(ctx, img, outW, outH) {
  const srcAspect = img.width / img.height;
  const dstAspect = outW / outH;
  let sx;
  let sy;
  let sw;
  let sh;
  if (srcAspect > dstAspect) {
    sh = img.height;
    sw = sh * dstAspect;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dstAspect;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
}

/** Encaja la imagen dentro del rectángulo con letterboxing transparente. */
function drawContain(ctx, img, outW, outH) {
  ctx.clearRect(0, 0, outW, outH);
  const scale = Math.min(outW / img.width, outH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (outW - w) / 2, (outH - h) / 2, w, h);
}

async function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen."))),
      mime,
      quality,
    );
  });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el resultado."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Procesa una imagen de branding: valida tamaño/formato, recorta o ajusta al preset.
 * @param {File} file
 * @param {typeof BRAND_ICON_PRESET | typeof BRAND_PRINCIPAL_PRESET} preset
 */
export async function processBrandingImage(file, preset) {
  if (!file || !(file instanceof Blob)) {
    throw Object.assign(new Error("Archivo inválido."), { code: "INVALID_FILE" });
  }
  if (file.size > BRAND_MAX_SOURCE_BYTES) {
    throw Object.assign(
      new Error("La imagen supera el máximo de 2 MB."),
      { code: "FILE_TOO_LARGE" },
    );
  }
  const mime = normalizeMime(file.type);
  if (!ACCEPTED_MIME.has(mime)) {
    throw Object.assign(
      new Error("Formato no soportado. Usa PNG, JPG o WEBP."),
      { code: "INVALID_FORMAT" },
    );
  }

  const img = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible en este navegador.");

  if (preset.slot === "icon") {
    canvas.width = preset.outputSize;
    canvas.height = preset.outputSize;
    drawCoverCrop(ctx, img, preset.outputSize, preset.outputSize);
  } else {
    canvas.width = preset.maxWidth;
    canvas.height = preset.maxHeight;
    drawContain(ctx, img, preset.maxWidth, preset.maxHeight);
  }

  const preferPng = mime === "image/png" && preset.slot === "icon";
  let outMime = preferPng ? "image/png" : "image/jpeg";
  let quality = preferPng ? undefined : 0.88;
  let blob = await canvasToBlob(canvas, outMime, quality);

  if (blob.size > BRAND_MAX_SOURCE_BYTES && outMime !== "image/jpeg") {
    outMime = "image/jpeg";
    quality = 0.82;
    blob = await canvasToBlob(canvas, outMime, quality);
  }
  if (blob.size > BRAND_MAX_SOURCE_BYTES) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
  }
  if (blob.size > BRAND_MAX_SOURCE_BYTES) {
    throw Object.assign(
      new Error("La imagen procesada sigue superando 2 MB. Prueba con un archivo más pequeño."),
      { code: "FILE_TOO_LARGE" },
    );
  }

  const ext = outMime === "image/png" ? "png" : "jpg";
  const outFile = new File(
    [blob],
    `logo-${preset.slot}.${ext}`,
    { type: outMime, lastModified: Date.now() },
  );
  const dataUrl = await blobToDataUrl(blob);

  return {
    file: outFile,
    dataUrl,
    originalBytes: file.size,
    compressedBytes: outFile.size,
  };
}

/** URL del ícono cuadrado con fallback al logo principal (empresas existentes). */
export function workspaceIconUrl(workspace) {
  if (!workspace) return null;
  return workspace.logo_icono_url
    ?? workspace.brand?.logo_icono_url
    ?? workspace.logo_url
    ?? workspace.brand?.logo_url
    ?? null;
}

/** URL del logo principal (header). */
export function workspacePrincipalLogoUrl(workspaceOrBrand) {
  if (!workspaceOrBrand) return null;
  return workspaceOrBrand.logo_url
    ?? workspaceOrBrand.brand?.logo_url
    ?? null;
}
