/** Selecciona todo el texto al enfocar — mejora captura en móvil. */
export function selectOnFocus(e) {
  const el = e.target;
  if (el && typeof el.select === "function") {
    requestAnimationFrame(() => el.select());
  }
}
