/* Service worker for AMC Portal browser push notifications */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Read the API base URL cached by the page so the worker can reach the backend
 * (needed to re-subscribe when the push service rotates the subscription).
 */
async function getApiBase() {
  try {
    const cache = await caches.open("amc-push-meta");
    const response = await cache.match("/api-base");
    return response ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Convert a base64url-encoded VAPID public key to a Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Show a notification when a push message arrives
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "AMC Portal";
  const options = {
    body: data.message || "",
    icon: "/logo-sw.png",
    badge: "/logo-sw.png",
    tag: data.link || "amc-notification",
    data: { url: data.link || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks — focus the app or open the linked page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(link, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if (url.startsWith(self.location.origin) && "navigate" in client) {
            await client.navigate(url);
          }
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })(),
  );
});

// Re-subscribe when the push service rotates the subscription,
// then tell open pages so they can re-sync it with the backend.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const apiBase = await getApiBase();
        if (!apiBase) return;

        const res = await fetch(`${apiBase}/push/vapid-public-key`);
        const { publicKey } = await res.json();
        if (!publicKey) return;

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const windowClients = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of windowClients) {
          client.postMessage({
            type: "PUSH_SUBSCRIPTION_CHANGED",
            subscription,
          });
        }
      } catch {
        // Nothing to do — the next page load will re-sync the subscription.
      }
    })(),
  );
});
