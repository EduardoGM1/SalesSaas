/* Shim local — carga el SDK ES6 desde el mismo origen (evita bloqueo de cdn.onesignal.com). */
(function loadOneSignalPageSdk() {
  var pushCapable =
    (typeof PushSubscriptionOptions !== "undefined"
      && PushSubscriptionOptions.prototype
      && Object.prototype.hasOwnProperty.call(PushSubscriptionOptions.prototype, "applicationServerKey"))
    || (typeof window !== "undefined"
      && window.safari
      && typeof window.safari.pushNotification !== "undefined");

  if (!pushCapable) {
    var msg = "Incompatible browser.";
    if (navigator.vendor === "Apple Computer, Inc." && navigator.maxTouchPoints > 0) {
      msg += " Try these steps: https://tinyurl.com/bdh2j9f7";
    }
    console.info(msg);
    return;
  }

  var script = document.createElement("script");
  script.src = "/onesignal/OneSignalSDK.page.es6.js";
  script.defer = true;
  document.head.appendChild(script);
})();
