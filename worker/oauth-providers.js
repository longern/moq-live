const textEncoder = new TextEncoder();

const DEFAULT_SESSION_TTL_DAYS = 30;
const GOOGLE_OPENID_CONFIG_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const MICROSOFT_OPENID_CONFIG_URL =
  "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration";
const TWITTER_AUTHORIZATION_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_USERINFO_URL =
  "https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url";

const AUTH_PROVIDER_DEFINITIONS = [
  {
    id: "google",
    label: "Google",
    requiredEnvKeys: [
      "AUTH_COOKIE_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ],
  },
  {
    id: "twitter",
    label: "Twitter",
    requiredEnvKeys: [
      "AUTH_COOKIE_SECRET",
      "TWITTER_CLIENT_ID",
      "TWITTER_CLIENT_SECRET",
    ],
  },
  {
    id: "microsoft",
    label: "Microsoft",
    requiredEnvKeys: [
      "AUTH_COOKIE_SECRET",
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
    ],
  },
];

let googleOpenIdConfigCache = null;
let googleJwksCache = null;
let microsoftOpenIdConfigCache = null;
let microsoftJwksCache = null;

export function getAuthProviderDefinition(providerId) {
  return AUTH_PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId) ?? null;
}

export function getConfiguredAuthProviders(env, request) {
  const origin = request ? new URL(request.url).origin : "";
  return AUTH_PROVIDER_DEFINITIONS
    .filter((provider) => provider.requiredEnvKeys.every((key) => {
      return Boolean(String(env?.[key] || "").trim());
    }))
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      startUrl: origin
        ? `${origin}/api/auth/${provider.id}/start`
        : `/api/auth/${provider.id}/start`,
    }));
}

export function getOAuthProviderConfig(env, providerId) {
  const provider = getAuthProviderDefinition(providerId);
  if (!provider) {
    throw new Error(`Unsupported auth provider: ${providerId}`);
  }

  const envPrefix = provider.id.toUpperCase();
  const config = {
    provider,
    clientId: String(env?.[`${envPrefix}_CLIENT_ID`] || "").trim(),
    clientSecret: String(env?.[`${envPrefix}_CLIENT_SECRET`] || "").trim(),
    cookieSecret: String(env?.AUTH_COOKIE_SECRET || "").trim(),
    sessionTtlDays:
      Number.parseInt(
        env.AUTH_SESSION_TTL_DAYS ?? `${DEFAULT_SESSION_TTL_DAYS}`,
        10,
      ) || DEFAULT_SESSION_TTL_DAYS,
  };

  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    throw new Error(
      `Missing ${provider.label} auth configuration. Set ${envPrefix}_CLIENT_ID, ${envPrefix}_CLIENT_SECRET, and AUTH_COOKIE_SECRET.`,
    );
  }

  return config;
}

export function getOAuthCallbackUrl(request, providerId) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/${providerId}/callback`;
}

export function getOAuthCookieName(providerId) {
  return `moq_oauth_${providerId}`;
}

export async function createOAuthState(secret, redirectTo) {
  const payload = {
    state: randomToken(18),
    nonce: randomToken(18),
    codeVerifier: randomToken(48),
    redirectTo,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  return {
    payload,
    cookieValue: await signPayload(payload, secret),
  };
}

export async function readOAuthState(cookieValue, secret) {
  if (!cookieValue) {
    return null;
  }
  const payload = await verifySignedPayload(cookieValue, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
    return null;
  }
  return payload;
}

export async function buildOAuthAuthorizationUrl(
  request,
  env,
  providerId,
  statePayload,
) {
  if (providerId === "twitter") {
    return buildTwitterAuthorizationUrl(request, env, statePayload);
  }
  return buildOpenIdAuthorizationUrl(request, env, providerId, statePayload);
}

export async function exchangeOAuthCode(request, env, providerId, code, codeVerifier) {
  if (providerId === "twitter") {
    return exchangeTwitterCode(request, env, code, codeVerifier);
  }
  return exchangeOpenIdCode(request, env, providerId, code, codeVerifier);
}

export async function resolveOAuthUserProfile(tokenPayload, env, providerId, nonce) {
  if (providerId === "twitter") {
    const profile = await fetchTwitterUserInfo(tokenPayload.access_token);
    return {
      provider: "twitter",
      subject: profile.id,
      tenantId: null,
      providerOid: profile.username || null,
      email: null,
      displayName: profile.name || profile.username || profile.id,
      avatarUrl: profile.profile_image_url || null,
      rawProfile: profile,
    };
  }

  const claims = providerId === "google"
    ? await verifyGoogleIdToken(tokenPayload.id_token, env, nonce)
    : await verifyMicrosoftIdToken(tokenPayload.id_token, env, nonce);
  if (providerId === "google") {
    return {
      provider: "google",
      subject: claims.sub,
      tenantId: null,
      providerOid: claims.sub,
      email: claims.email || null,
      displayName: claims.name || claims.email || claims.sub,
      avatarUrl: claims.picture || null,
      rawProfile: {
        sub: claims.sub,
        email: claims.email ?? null,
        email_verified: claims.email_verified ?? null,
        name: claims.name ?? null,
        picture: claims.picture ?? null,
        locale: claims.locale ?? null,
      },
    };
  }

  return {
    provider: "microsoft",
    subject: claims.sub,
    tenantId: claims.tid ?? null,
    providerOid: claims.oid ?? null,
    email: claims.email || claims.preferred_username || null,
    displayName: claims.name || claims.preferred_username || claims.email || claims.sub,
    avatarUrl: null,
    rawProfile: {
      sub: claims.sub,
      oid: claims.oid ?? null,
      tid: claims.tid ?? null,
      preferred_username: claims.preferred_username ?? null,
      email: claims.email || claims.preferred_username || null,
    },
  };
}

async function buildOpenIdAuthorizationUrl(request, env, providerId, statePayload) {
  const authConfig = getOAuthProviderConfig(env, providerId);
  const openIdConfig = providerId === "google"
    ? await getGoogleOpenIdConfig()
    : await getMicrosoftOpenIdConfig();
  const url = new URL(openIdConfig.authorization_endpoint);
  url.searchParams.set("client_id", authConfig.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getOAuthCallbackUrl(request, providerId));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", statePayload.state);
  url.searchParams.set("nonce", statePayload.nonce);
  url.searchParams.set(
    "code_challenge",
    await sha256Base64Url(statePayload.codeVerifier),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function buildTwitterAuthorizationUrl(request, env, statePayload) {
  const authConfig = getOAuthProviderConfig(env, "twitter");
  const url = new URL(TWITTER_AUTHORIZATION_URL);
  url.searchParams.set("client_id", authConfig.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getOAuthCallbackUrl(request, "twitter"));
  url.searchParams.set("scope", "tweet.read users.read");
  url.searchParams.set("state", statePayload.state);
  url.searchParams.set(
    "code_challenge",
    await sha256Base64Url(statePayload.codeVerifier),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeOpenIdCode(request, env, providerId, code, codeVerifier) {
  const authConfig = getOAuthProviderConfig(env, providerId);
  const openIdConfig = providerId === "google"
    ? await getGoogleOpenIdConfig()
    : await getMicrosoftOpenIdConfig();
  const form = new URLSearchParams();
  form.set("client_id", authConfig.clientId);
  form.set("client_secret", authConfig.clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", getOAuthCallbackUrl(request, providerId));
  form.set("code_verifier", codeVerifier);

  const response = await fetch(openIdConfig.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `${authConfig.provider.label} token exchange failed`,
    );
  }

  if (!payload.id_token) {
    throw new Error(`${authConfig.provider.label} token response did not include id_token`);
  }

  return payload;
}

async function exchangeTwitterCode(request, env, code, codeVerifier) {
  const authConfig = getOAuthProviderConfig(env, "twitter");
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", getOAuthCallbackUrl(request, "twitter"));
  form.set("code_verifier", codeVerifier);

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${authConfig.clientId}:${authConfig.clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "Twitter token exchange failed",
    );
  }

  if (!payload.access_token) {
    throw new Error("Twitter token response did not include access_token");
  }

  return payload;
}

async function verifyMicrosoftIdToken(idToken, env, expectedNonce) {
  const authConfig = getOAuthProviderConfig(env, "microsoft");
  const payload = await verifyOpenIdToken(idToken, {
    getJwk: getMicrosoftJwk,
    expectedAudience: authConfig.clientId,
    expectedNonce,
    providerLabel: "Microsoft",
  });

  if (!isValidMicrosoftIssuer(payload.iss)) {
    throw new Error("Microsoft id_token issuer mismatch");
  }
  return payload;
}

async function verifyGoogleIdToken(idToken, env, expectedNonce) {
  const authConfig = getOAuthProviderConfig(env, "google");
  const payload = await verifyOpenIdToken(idToken, {
    getJwk: getGoogleJwk,
    expectedAudience: authConfig.clientId,
    expectedNonce,
    providerLabel: "Google",
  });

  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) {
    throw new Error("Google id_token issuer mismatch");
  }
  return payload;
}

async function verifyOpenIdToken(
  idToken,
  { getJwk, expectedAudience, expectedNonce, providerLabel },
) {
  const [rawHeader, rawPayload, rawSignature] = idToken.split(".");
  if (!rawHeader || !rawPayload || !rawSignature) {
    throw new Error("Invalid id_token format");
  }

  const header = decodeJsonSegment(rawHeader);
  const payload = decodeJsonSegment(rawPayload);
  const signature = base64UrlToUint8Array(rawSignature);
  const signedContent = textEncoder.encode(`${rawHeader}.${rawPayload}`);

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported ${providerLabel} token alg: ${header.alg}`);
  }

  const jwk = await getJwk(header.kid);
  if (!jwk) {
    throw new Error(`Unable to find matching ${providerLabel} signing key`);
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedContent,
  );
  if (!verified) {
    throw new Error(`${providerLabel} id_token signature verification failed`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error(`${providerLabel} id_token is expired`);
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 60) {
    throw new Error(`${providerLabel} id_token is not yet valid`);
  }

  const audience = payload.aud;
  const audienceMatches = Array.isArray(audience)
    ? audience.includes(expectedAudience)
    : audience === expectedAudience;
  if (!audienceMatches) {
    throw new Error(`${providerLabel} id_token audience mismatch`);
  }

  if (payload.nonce !== expectedNonce) {
    throw new Error(`${providerLabel} id_token nonce mismatch`);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error(`${providerLabel} id_token missing subject`);
  }

  return payload;
}

async function fetchTwitterUserInfo(accessToken) {
  const response = await fetch(TWITTER_USERINFO_URL, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.detail ||
        payload.title ||
        payload.error ||
        "Twitter userinfo request failed",
    );
  }
  if (!payload.data?.id) {
    throw new Error("Twitter userinfo response missing user id");
  }
  return payload.data;
}

async function getGoogleOpenIdConfig() {
  if (googleOpenIdConfigCache && googleOpenIdConfigCache.expiresAt > Date.now()) {
    return googleOpenIdConfigCache.value;
  }

  const value = await fetchOpenIdConfig(GOOGLE_OPENID_CONFIG_URL, "Google");
  googleOpenIdConfigCache = {
    value,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return value;
}

async function getMicrosoftOpenIdConfig() {
  if (microsoftOpenIdConfigCache && microsoftOpenIdConfigCache.expiresAt > Date.now()) {
    return microsoftOpenIdConfigCache.value;
  }

  const value = await fetchOpenIdConfig(MICROSOFT_OPENID_CONFIG_URL, "Microsoft");
  microsoftOpenIdConfigCache = {
    value,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return value;
}

async function fetchOpenIdConfig(url, providerLabel) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load ${providerLabel} OpenID configuration`);
  }
  return response.json();
}

async function getGoogleJwk(keyId) {
  if (!googleJwksCache || googleJwksCache.expiresAt <= Date.now()) {
    const openIdConfig = await getGoogleOpenIdConfig();
    googleJwksCache = await fetchJwks(openIdConfig.jwks_uri, "Google");
  }
  return googleJwksCache.keys.find((entry) => entry.kid === keyId) ?? null;
}

async function getMicrosoftJwk(keyId) {
  if (!microsoftJwksCache || microsoftJwksCache.expiresAt <= Date.now()) {
    const openIdConfig = await getMicrosoftOpenIdConfig();
    microsoftJwksCache = await fetchJwks(openIdConfig.jwks_uri, "Microsoft");
  }
  return microsoftJwksCache.keys.find((entry) => entry.kid === keyId) ?? null;
}

async function fetchJwks(url, providerLabel) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load ${providerLabel} signing keys`);
  }
  const payload = await response.json();
  return {
    keys: payload.keys ?? [],
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
}

function isValidMicrosoftIssuer(issuer) {
  if (typeof issuer !== "string") {
    return false;
  }

  try {
    const url = new URL(issuer);
    return (
      url.hostname === "login.microsoftonline.com" &&
      url.pathname.endsWith("/v2.0")
    );
  } catch {
    return false;
  }
}

function randomToken(bytes) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return uint8ArrayToBase64Url(value);
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(input),
  );
  return uint8ArrayToBase64Url(new Uint8Array(digest));
}

async function signPayload(payload, secret) {
  const body = uint8ArrayToBase64Url(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const signature = await hmacSha256Base64Url(secret, body);
  return `${body}.${signature}`;
}

async function verifySignedPayload(value, secret) {
  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex < 0) {
    return null;
  }
  const body = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = await hmacSha256Base64Url(secret, body);
  if (signature !== expectedSignature) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(body)));
  } catch {
    return null;
  }
}

async function hmacSha256Base64Url(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(message),
  );
  return uint8ArrayToBase64Url(new Uint8Array(signature));
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(segment)));
}

function base64UrlToUint8Array(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function uint8ArrayToBase64Url(value) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
