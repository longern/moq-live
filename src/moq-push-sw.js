const SITE_TITLE = import.meta.env.VITE_SITE_TITLE?.trim() || "MoQ Live";

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data?.json?.() || {};
      } catch {
        payload = {};
      }

      const hostDisplayName =
        String(payload.hostDisplayName ?? "").trim() || "您关注的主播";
      await self.registration.showNotification(`${hostDisplayName}开播啦`, {
        body: `快来${SITE_TITLE}看看吧`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: {
          url: payload.url || "/",
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }
      await clients.openWindow(targetUrl);
    })(),
  );
});
