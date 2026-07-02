// Service worker de Pulso: instalable (PWA) + notificaciones Web Push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => new Response("", { status: 504 })));
});

// Notificación push: llega aunque la pestaña esté cerrada.
self.addEventListener("push", (e) => {
  let d = { titulo: "Pulso", cuerpo: "" };
  try { d = e.data.json(); } catch { d.cuerpo = e.data ? e.data.text() : ""; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Pulso", {
    body: d.cuerpo || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "pulso",
  }));
});

// Clic en la notificación: enfoca Pulso si está abierto, o lo abre.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow("/");
    })
  );
});
