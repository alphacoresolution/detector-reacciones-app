// Guarda la app en el telefono para que abra sin internet despues de la primera vez.
const VERSION = "detector-v1";
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "manifest.webmanifest",
  "js/app.js", "js/rostro.js", "js/ojo.js", "js/senales.js", "js/conducta.js", "js/voz.js", "js/habla.js",
  "js/protocolo.js", "js/reporte.js", "js/almacen.js",
  "vendor/vision_bundle.mjs", "vendor/wasm/vision_wasm_internal.js", "vendor/wasm/vision_wasm_internal.wasm",
  "vendor/wasm/vision_wasm_nosimd_internal.js", "vendor/wasm/vision_wasm_nosimd_internal.wasm",
  "modelos/face_landmarker.task", "modelos/hand_landmarker.task",
  "iconos/icono-180.png", "iconos/icono-192.png", "iconos/icono-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// primero la red (para recibir mejoras); sin conexion, lo guardado
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone();
    caches.open(VERSION).then(c => c.put(e.request, copia)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
