// Service worker mínimo para que Pulso sea instalable (PWA).
// No cachea de forma agresiva: deja pasar todo a la red para no servir
// versiones viejas tras un despliegue.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* passthrough: usa la red normal */ });
