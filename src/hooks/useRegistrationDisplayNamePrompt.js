import { useState } from "react";
import { getAppErrorMessage } from "../lib/appErrors.js";

export function useRegistrationDisplayNamePrompt({
  dismissRegistrationPrompt,
  locale,
  updateDisplayName,
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setInput("");
    setError("");
  }

  function close() {
    dismissRegistrationPrompt();
    reset();
  }

  function changeInput(value) {
    setInput(value);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateDisplayName(input);
      dismissRegistrationPrompt();
      setInput("");
    } catch (submitError) {
      setError(getAppErrorMessage(submitError, locale));
    } finally {
      setSaving(false);
    }
  }

  return {
    error,
    input,
    saving,
    changeInput,
    close,
    submit,
  };
}
