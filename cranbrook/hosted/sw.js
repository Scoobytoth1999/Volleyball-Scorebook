/* Offline cache for Volleyball Scorebook. Bump VERSION when files change. */
var VERSION = 'scorebook-v5';
var FILES = ['index.html', 'style.css?v=5', 'core.js?v=5', 'ui.js?v=5', 'jspdf.umd.min.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('scorebook-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Always open the app shell; refresh it in the background when online.
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('index.html').then(function (hit) {
        var net = fetch(req).then(function (r) { if (r.ok) c.put('index.html', r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});
