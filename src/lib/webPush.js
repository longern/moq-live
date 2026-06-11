export const PUSH_PERMISSION_REMINDER_KEY = "moq-live:push-permission-reminder-dismissed";

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function shouldPromptForPushPermission() {
  if (!isWebPushSupported()) {
    return false;
  }
  if (Notification.permission === "granted") {
    return false;
  }
  try {
    return window.localStorage.getItem(PUSH_PERMISSION_REMINDER_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setPushPermissionReminderDismissed(dismissed) {
  try {
    if (dismissed) {
      window.localStorage.setItem(PUSH_PERMISSION_REMINDER_KEY, "1");
    } else {
      window.localStorage.removeItem(PUSH_PERMISSION_REMINDER_KEY);
    }
  } catch {
    // Ignore storage failures; this only controls a local reminder.
  }
}

export async function subscribeCurrentUserToWebPush() {
  if (!isWebPushSupported()) {
    throw new Error("web push unsupported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  const keyResponse = await fetch("/api/push/public-key", {
    credentials: "same-origin"
  });
  const keyPayload = await keyResponse.json().catch(() => ({}));
  const publicKey = String(keyPayload.publicKey || "").trim();
  if (!keyResponse.ok || !publicKey) {
    throw new Error("web push public key unavailable");
  }

  const registration = await navigator.serviceWorker.register("/moq-push-sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(publicKey)
  });
  await savePushSubscription(subscription);
  return true;
}

async function savePushSubscription(subscription) {
  const payload = subscription.toJSON();
  const response = await fetch("/api/me/push-subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("web push subscription save failed");
  }
}

function base64UrlToUint8Array(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
