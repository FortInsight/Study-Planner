self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("study-planner-pwa-"))
          .map((key) => caches.delete(key))
      );
    } catch (_) {
      // Ignore cleanup failures during retirement.
    }

    try {
      await self.registration.unregister();
    } catch (_) {
      // Ignore unregister failures during retirement.
    }

    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((client) => {
      client.postMessage({ type: "PWA_DISABLED" });
    });
  })());
});

self.addEventListener("fetch", () => {
  // Intentionally no-op. This service worker retires old PWA behavior.
});
