import { useEffect, useRef, useState } from "preact/hooks";

export function useAuthController({ log, onAuthenticated }) {
  const [authState, setAuthState] = useState({
    loading: true,
    available: true,
    user: null
  });
  const onAuthenticatedRef = useRef(onAuthenticated);

  onAuthenticatedRef.current = onAuthenticated;

  async function refreshAuthState() {
    try {
      const response = await fetch("/api/me", {
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`auth endpoint returned ${response.status}`);
      }
      const payload = await response.json();
      const nextState = {
        loading: false,
        available: true,
        user: payload.user ?? null
      };
      setAuthState(nextState);
      if (nextState.user) {
        onAuthenticatedRef.current?.(nextState.user);
      }
    } catch (error) {
      setAuthState({
        loading: false,
        available: false,
        user: null
      });
      log(`auth unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function startMicrosoftLogin() {
    const redirectTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/microsoft/start?redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`logout failed with ${response.status}`);
      }
      setAuthState((current) => ({
        ...current,
        user: null,
        available: true
      }));
      log("signed out");
    } catch (error) {
      log(`logout failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const authError = url.searchParams.get("auth_error");
    if (authError) {
      log(`auth failed: ${authError}`);
      url.searchParams.delete("auth_error");
      history.replaceState({}, "", url);
    }

    void refreshAuthState();
  }, []);

  return {
    authState,
    refreshAuthState,
    startMicrosoftLogin,
    logout
  };
}
