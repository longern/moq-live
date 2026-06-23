export function createMediaRoutes(handlers) {
  return [
    {
      method: "GET",
      prefix: "/media/room-covers/",
      handler: (env, request) => handlers.handleRoomCoverMedia(env, request),
    },
    {
      method: "GET",
      prefix: "/media/user-avatars/",
      handler: (env, request) => handlers.handleUserAvatarMedia(env, request),
    },
  ];
}

export function createApiRoutes(handlers) {
  return [
    { method: "GET", path: "/api/me", handler: (env, request) => handlers.handleMe(env, request) },
    { method: "GET", path: "/api/me/room", handler: (env, request) => handlers.handleMyRoom(env, request) },
    { method: "POST", path: "/api/me/room", handler: (env, request) => handlers.handleMyRoomCreate(env, request) },
    { method: "PATCH", path: "/api/me/room", handler: (env, request) => handlers.handleMyRoomUpdate(env, request) },
    { method: "POST", path: "/api/me/room/cover", handler: (env, request) => handlers.handleMyRoomCoverUpload(env, request) },
    { method: "DELETE", path: "/api/me/room/cover", handler: (env, request) => handlers.handleMyRoomCoverDelete(env, request) },
    { method: "GET", path: "/api/me/follows", handler: (env, request) => handlers.handleMyFollows(env, request) },
    { method: "GET", path: "/api/rooms", handler: (env) => handlers.handleRooms(env) },
    { method: "GET", path: "/api/rooms/resolve", handler: (env, request) => handlers.handleRoomResolve(env, request) },
    { method: "POST", path: "/api/cohost/request", handler: (env, request) => handlers.handleCohostRequest(env, request) },
    { method: "POST", path: "/api/cohost/respond", handler: (env, request) => handlers.handleCohostRespond(env, request) },
    {
      method: "POST",
      path: "/api/audience-call/realtime/sessions",
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionCreate(env, request),
    },
    {
      method: "GET",
      pattern: /^\/api\/audience-call\/realtime\/sessions\/[^/]+$/,
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionGet(env, request),
    },
    {
      method: "POST",
      pattern: /^\/api\/audience-call\/realtime\/sessions\/[^/]+\/tracks$/,
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionTracksNew(env, request),
    },
    {
      method: "PUT",
      pattern: /^\/api\/audience-call\/realtime\/sessions\/[^/]+\/tracks$/,
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionTracksUpdate(env, request),
    },
    {
      method: "PUT",
      pattern: /^\/api\/audience-call\/realtime\/sessions\/[^/]+\/renegotiate$/,
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionRenegotiate(env, request),
    },
    {
      method: "PUT",
      pattern: /^\/api\/audience-call\/realtime\/sessions\/[^/]+\/tracks\/close$/,
      handler: (env, request) => handlers.handleAudienceCallRealtimeSessionTracksClose(env, request),
    },
    { method: "POST", path: "/api/me/room/webrtc/whip", handler: (env, request) => handlers.handleMyRoomWhipProxy(env, request) },
    {
      method: "POST",
      pattern: /^\/api\/rooms\/[^/]+\/webrtc\/whep$/,
      handler: (env, request) => handlers.handleRoomWhepProxy(env, request),
    },
    {
      methods: ["DELETE", "PATCH"],
      pattern: /^\/api\/webrtc\/sessions\/[^/]+$/,
      handler: (env, request) => handlers.handleWebRtcProxyResource(env, request),
    },
    {
      methods: ["GET", "POST", "PATCH", "DELETE"],
      pattern: /^\/api\/users\/[^/]+\/follow$/,
      handler: (env, request, ctx) => handlers.handleUserFollow(env, request, ctx),
    },
    {
      method: "GET",
      pattern: /^\/api\/users\/[^/]+\/profile$/,
      handler: (env, request) => handlers.handleUserProfile(env, request),
    },
    { method: "GET", path: "/api/push/public-key", handler: (env) => handlers.handlePushPublicKey(env) },
    {
      methods: ["POST", "DELETE"],
      path: "/api/me/push-subscriptions",
      handler: (env, request) => handlers.handleMyPushSubscription(env, request),
    },
    {
      method: "POST",
      pattern: /^\/api\/rooms\/[^/]+\/live-notifications$/,
      handler: (env, request, ctx) => handlers.handleLiveNotifications(env, request, ctx),
    },
    { method: "POST", path: "/api/me/profile", handler: (env, request) => handlers.handleProfileUpdate(env, request) },
    { method: "POST", path: "/api/me/avatar", handler: (env, request) => handlers.handleMyAvatarUpload(env, request) },
    { method: "DELETE", path: "/api/me/avatar", handler: (env, request) => handlers.handleMyAvatarDelete(env, request) },
    { method: "GET", path: "/api/auth/microsoft/start", handler: (env, request) => handlers.handleMicrosoftStart(env, request) },
    { method: "GET", path: "/api/auth/microsoft/callback", handler: (env, request) => handlers.handleMicrosoftCallback(env, request) },
    { method: "GET", path: "/api/auth/google/start", handler: (env, request) => handlers.handleOAuthStart(env, request, "google") },
    { method: "GET", path: "/api/auth/google/callback", handler: (env, request) => handlers.handleOAuthCallback(env, request, "google") },
    { method: "GET", path: "/api/auth/twitter/start", handler: (env, request) => handlers.handleOAuthStart(env, request, "twitter") },
    { method: "GET", path: "/api/auth/twitter/callback", handler: (env, request) => handlers.handleOAuthCallback(env, request, "twitter") },
    {
      methods: ["GET", "POST"],
      path: "/api/auth/logout",
      handler: (env, request) => handlers.handleLogout(env, request),
    },
    {
      method: "GET",
      pattern: /^\/api\/chat\/[^/]+\/ws$/,
      handler: (env, request) => handlers.handleChatWebSocket(env, request),
    },
    {
      method: "POST",
      pattern: /^\/api\/chat\/[^/]+\/location\/distance$/,
      handler: (env, request) => handlers.handleChatLocationDistance(env, request),
    },
  ];
}

export async function dispatchRoute(routes, env, request, ctx, url = new URL(request.url)) {
  for (const route of routes) {
    if (!routeMethodMatches(route, request.method) || !routePathMatches(route, url.pathname)) {
      continue;
    }
    return await route.handler(env, request, ctx, url);
  }
  return null;
}

function routeMethodMatches(route, method) {
  if (route.method) {
    return route.method === method;
  }
  return Array.isArray(route.methods) && route.methods.includes(method);
}

function routePathMatches(route, pathname) {
  if (route.path) {
    return route.path === pathname;
  }
  if (route.prefix) {
    return pathname.startsWith(route.prefix);
  }
  return route.pattern?.test(pathname) === true;
}
