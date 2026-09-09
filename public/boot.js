/**
 * Boot script sin hash (servido desde /public) para poder correr con una CSP
 * sin 'unsafe-inline'. Se ejecuta antes del bundle y NO depende de él:
 * recupera shells PWA obsoletos (index.html/SW cacheados cuyos chunks ya
 * devuelven 404 tras un deploy).
 */
(function () {
  var current = document.querySelector('script[type="module"][src*="/assets/"]');
  if (!current) return;
  var currentSrc = current.getAttribute("src") || "";
  fetch("/index.html?__fresh=" + Date.now(), { cache: "no-store", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
    .then(function (html) {
      var match = html.match(/\/assets\/index-[^"']+\.js/);
      if (!match || !match[0] || currentSrc.indexOf(match[0]) !== -1) return;
      console.warn("[pwa] outdated shell detected, clearing SW caches", currentSrc, match[0]);
      var reloadKey = "app:shell-reload:" + match[0];
      try {
        var n = Number(sessionStorage.getItem(reloadKey) || 0);
        if (n >= 3) return;
        sessionStorage.setItem(reloadKey, String(n + 1));
      } catch (e) {}
      var done = function () { location.reload(); };
      if (!("serviceWorker" in navigator)) return done();
      return navigator.serviceWorker.getRegistrations()
        .then(function (regs) {
          return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
        })
        .then(function () { return caches.keys(); })
        .then(function (keys) {
          return Promise.all(keys.map(function (key) { return caches.delete(key); }));
        })
        .then(done);
    })
    .catch(function () {});
})();
