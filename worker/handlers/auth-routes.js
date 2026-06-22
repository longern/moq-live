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
  updateUserProfile,
  upsertMicrosoftUser,
  verifyMicrosoftIdToken,
} from "../auth.js";
import {
  slugifyError,
  withSuperAdminFlag
} from "./shared.js";

export async function handleProfileUpdate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json(
      { ok: false, error: "Invalid JSON body", code: "invalid_json" },
      { status: 400 },
    );
  }

  const user = await updateUserProfile(db, session.user.id, {
    ...(Object.hasOwn(payload, "displayName")
      ? { displayName: payload.displayName }
      : {}),
    ...(Object.hasOwn(payload, "handle") ? { handle: payload.handle } : {}),
    ...(Object.hasOwn(payload, "bio") ? { bio: payload.bio } : {}),
    ...(Object.hasOwn(payload, "gender") ? { gender: payload.gender } : {}),
    ...(Object.hasOwn(payload, "birthDate")
      ? { birthDate: payload.birthDate }
      : {}),
  });
  return json({
    ok: true,
    user: withSuperAdminFlag(env, user),
  });
}

export async function handleMicrosoftStart(env, request) {
  const authConfig = getAuthConfig(env);
  const redirectTo = sanitizeRedirectTo(
    new URL(request.url).searchParams.get("redirect_to") || "/",
  );
  const { payload, cookieValue } = await createMicrosoftOAuthState(
    authConfig.cookieSecret,
    redirectTo,
  );
  const authorizationUrl = await buildMicrosoftAuthorizationUrl(
    request,
    env,
    payload,
  );

  return redirect(authorizationUrl, {
    headers: {
      "set-cookie": buildOAuthCookie(
        cookieValue,
        shouldUseSecureCookies(request),
      ),
    },
  });
}

export async function handleMicrosoftCallback(env, request) {
  const authConfig = getAuthConfig(env);
  const db = getDb(env);
  const url = new URL(request.url);
  const cookies = parseCookies(request);
  const oauthState = await readMicrosoftOAuthState(
    cookies[getMicrosoftOAuthCookieName()],
    authConfig.cookieSecret,
  );

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, error), {
      headers: buildCallbackCookieHeaders(request, null, null),
    });
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (
    !oauthState ||
    !code ||
    !returnedState ||
    returnedState !== oauthState.state
  ) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, "state_mismatch"), {
      headers: buildCallbackCookieHeaders(request, null, null),
    });
  }

  try {
    const tokenPayload = await exchangeMicrosoftCode(
      request,
      env,
      code,
      oauthState.codeVerifier,
    );
    const claims = await verifyMicrosoftIdToken(
      tokenPayload.id_token,
      env,
      oauthState.nonce,
    );
    const authUser = await upsertMicrosoftUser(db, claims);
    const session = await createSession(
      db,
      authUser.userId,
      {
        ip: request.headers.get("CF-Connecting-IP"),
        userAgent: request.headers.get("user-agent"),
      },
      authConfig.sessionTtlDays,
    );

    const redirectTo = new URL(oauthState.redirectTo, "https://moq.local");
    if (authUser.isNewUser) {
      redirectTo.searchParams.set("auth_new_user", "1");
      redirectTo.searchParams.set(
        "oauth_display_name",
        authUser.oauthDisplayName || "",
      );
    }

    return redirect(
      `${redirectTo.pathname}${redirectTo.search}${redirectTo.hash}`,
      {
        headers: buildCallbackCookieHeaders(
          request,
          session.token,
          session.expiresAt,
        ),
      },
    );
  } catch (callbackError) {
    const redirectTo = oauthState.redirectTo ?? "/";
    const errorCode =
      errorDescription ||
      (callbackError instanceof Error ? callbackError.message : "login_failed");
    return redirect(appendAuthError(redirectTo, slugifyError(errorCode)), {
      headers: buildCallbackCookieHeaders(request, null, null),
    });
  }
}

export async function handleLogout(env, request) {
  const db = getDb(env);
  const cookies = parseCookies(request);
  await revokeSession(db, cookies[getSessionCookieName()]);

  return json(
    {
      ok: true,
    },
    {
      headers: {
        "set-cookie": createDeleteCookie(
          getSessionCookieName(),
          shouldUseSecureCookies(request),
        ),
      },
    },
  );
}

function buildOAuthCookie(cookieValue, secure) {
  return [
    `${getMicrosoftOAuthCookieName()}=${cookieValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ]
    .concat(secure ? ["Secure"] : [])
    .join("; ");
}

function buildCallbackCookieHeaders(request, sessionToken, sessionExpiresAt) {
  const secure = shouldUseSecureCookies(request);
  const headers = new Headers();
  headers.append(
    "set-cookie",
    createDeleteCookie(getMicrosoftOAuthCookieName(), secure),
  );
  if (sessionToken && sessionExpiresAt) {
    headers.append(
      "set-cookie",
      buildSessionCookie(sessionToken, sessionExpiresAt, secure),
    );
  }
  return headers;
}
