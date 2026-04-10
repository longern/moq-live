import {
  appendAuthError,
  buildMicrosoftAuthorizationUrl,
  buildSessionCookie,
  createDeleteCookie,
  createMicrosoftOAuthState,
  createSession,
  exchangeMicrosoftCode,
  getAuthConfig,
  getDb,
  getMicrosoftLoginUrl,
  getMicrosoftOAuthCookieName,
  getSessionCookieName,
  getSessionUser,
  json,
  parseCookies,
  readMicrosoftOAuthState,
  redirect,
  revokeSession,
  sanitizeRedirectTo,
  shouldUseSecureCookies,
  upsertMicrosoftUser,
  verifyMicrosoftIdToken
} from "./auth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Missing ASSETS binding.", { status: 500 });
    }

    try {
      if (url.pathname === "/api/me" && request.method === "GET") {
        return await handleMe(env, request);
      }
      if (url.pathname === "/api/auth/microsoft/start" && request.method === "GET") {
        return await handleMicrosoftStart(env, request);
      }
      if (url.pathname === "/api/auth/microsoft/callback" && request.method === "GET") {
        return await handleMicrosoftCallback(env, request);
      }
      if (url.pathname === "/api/auth/logout" && (request.method === "POST" || request.method === "GET")) {
        return await handleLogout(env, request);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, { status: 500 });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  }
};

async function handleMe(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session) {
    return json({
      ok: true,
      authenticated: false,
      loginUrl: getMicrosoftLoginUrl(request),
      user: null
    });
  }

  return json({
    ok: true,
    authenticated: true,
    loginUrl: getMicrosoftLoginUrl(request),
    user: session.user
  });
}

async function handleMicrosoftStart(env, request) {
  const authConfig = getAuthConfig(env);
  const redirectTo = sanitizeRedirectTo(new URL(request.url).searchParams.get("redirect_to") || "/");
  const { payload, cookieValue } = await createMicrosoftOAuthState(authConfig.cookieSecret, redirectTo);
  const authorizationUrl = await buildMicrosoftAuthorizationUrl(request, env, payload);

  return redirect(authorizationUrl, {
    headers: {
      "set-cookie": buildOAuthCookie(cookieValue, shouldUseSecureCookies(request))
    }
  });
}

async function handleMicrosoftCallback(env, request) {
  const authConfig = getAuthConfig(env);
  const db = getDb(env);
  const url = new URL(request.url);
  const cookies = parseCookies(request);
  const oauthState = await readMicrosoftOAuthState(
    cookies[getMicrosoftOAuthCookieName()],
    authConfig.cookieSecret
  );

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, error), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!oauthState || !code || !returnedState || returnedState !== oauthState.state) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, "state_mismatch"), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }

  try {
    const tokenPayload = await exchangeMicrosoftCode(request, env, code, oauthState.codeVerifier);
    const claims = await verifyMicrosoftIdToken(tokenPayload.id_token, env, oauthState.nonce);
    const userId = await upsertMicrosoftUser(db, claims);
    const session = await createSession(
      db,
      userId,
      {
        ip: request.headers.get("CF-Connecting-IP"),
        userAgent: request.headers.get("user-agent")
      },
      authConfig.sessionTtlDays
    );

    return redirect(oauthState.redirectTo, {
      headers: buildCallbackCookieHeaders(request, session.token, session.expiresAt)
    });
  } catch (callbackError) {
    const redirectTo = oauthState.redirectTo ?? "/";
    const errorCode = errorDescription || (callbackError instanceof Error ? callbackError.message : "login_failed");
    return redirect(appendAuthError(redirectTo, slugifyError(errorCode)), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }
}

async function handleLogout(env, request) {
  const db = getDb(env);
  const cookies = parseCookies(request);
  await revokeSession(db, cookies[getSessionCookieName()]);

  return json(
    {
      ok: true
    },
    {
      headers: {
        "set-cookie": createDeleteCookie(getSessionCookieName(), shouldUseSecureCookies(request))
      }
    }
  );
}

function buildOAuthCookie(cookieValue, secure) {
  return [
    `${getMicrosoftOAuthCookieName()}=${cookieValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600"
  ].concat(secure ? ["Secure"] : []).join("; ");
}

function buildCallbackCookieHeaders(request, sessionToken, sessionExpiresAt) {
  const secure = shouldUseSecureCookies(request);
  const headers = new Headers();
  headers.append("set-cookie", createDeleteCookie(getMicrosoftOAuthCookieName(), secure));
  if (sessionToken && sessionExpiresAt) {
    headers.append("set-cookie", buildSessionCookie(sessionToken, sessionExpiresAt, secure));
  }
  return headers;
}

function slugifyError(message) {
  return String(message).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "login_failed";
}
