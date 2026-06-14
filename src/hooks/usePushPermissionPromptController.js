import { useState } from "react";
import {
  setPushPermissionReminderDismissed,
  subscribeCurrentUserToWebPush,
} from "../lib/webPush.js";

export function usePushPermissionPromptController({ t }) {
  const [open, setOpen] = useState(false);
  const [dismissChecked, setDismissChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (dismissChecked) {
      setPushPermissionReminderDismissed(true);
    }
    setOpen(false);
    setError("");
    setBusy(false);
  }

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const subscribed = await subscribeCurrentUserToWebPush();
      if (dismissChecked || subscribed) {
        setPushPermissionReminderDismissed(true);
      }
      setOpen(false);
    } catch {
      setError(t("push.enableFailed"));
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    dismissChecked,
    error,
    open,
    close,
    enable,
    setDismissChecked,
    setOpen,
  };
}
