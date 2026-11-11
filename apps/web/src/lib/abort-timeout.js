/**
 * AbortSignal.timeout con polyfill para Safari/WebView antiguos.
 * @param {number} ms
 * @returns {AbortSignal}
 */
export function abortTimeout(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const id = setTimeout(() => {
    try {
      controller.abort(new DOMException("TimeoutError", "TimeoutError"));
    } catch {
      controller.abort();
    }
  }, ms);
  const { signal } = controller;
  const clear = () => clearTimeout(id);
  signal.addEventListener("abort", clear, { once: true });
  return signal;
}
