self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || payload.notification?.title || 'Notification';
  const body = payload.body || payload.notification?.body || '';
  const data = payload.data || payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      tag: data.notificationId || title,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.actionUrl || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => 'focus' in client);
      if (existing) {
        existing.navigate(actionUrl);
        return existing.focus();
      }
      return clients.openWindow(actionUrl);
    })
  );
});
