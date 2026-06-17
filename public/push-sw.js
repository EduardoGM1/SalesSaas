/* eslint-disable no-restricted-globals */
/** Handlers de Web Push (importado por el service worker de Workbox). */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "Sales Timeshare";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "salesapp",
    data: { url: payload.url || "/" },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          const path = (() => {
            try {
              return new URL(client.url).pathname + new URL(client.url).search;
            } catch {
              return "";
            }
          })();
          const targetPath = (() => {
            try {
              return new URL(targetUrl, self.location.origin).pathname
                + new URL(targetUrl, self.location.origin).search;
            } catch {
              return targetUrl;
            }
          })();
          if (path === targetPath || client.url.includes(targetPath)) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        const absolute = targetUrl.startsWith("http")
          ? targetUrl
          : new URL(targetUrl, self.location.origin).href;
        return self.clients.openWindow(absolute);
      }
      return undefined;
    }),
  );
});
