import { json } from "./auth.js";
import { ChatRoomDO } from "./chat-room.js";
import * as handlers from "./handlers/index.js";
import { createApiRoutes, createMediaRoutes, dispatchRoute } from "./routes.js";

const MEDIA_ROUTES = createMediaRoutes(handlers);
const API_ROUTES = createApiRoutes(handlers);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const mediaResponse = await dispatchRoute(MEDIA_ROUTES, env, request, ctx, url);
    if (mediaResponse) {
      return mediaResponse;
    }

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Missing ASSETS binding.", { status: 500 });
    }

    try {
      const apiResponse = await dispatchRoute(API_ROUTES, env, request, ctx, url);
      if (apiResponse) {
        return apiResponse;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const payload = { ok: false, error: message };
      if (error?.code) {
        payload.code = error.code;
      }
      if (error?.details) {
        payload.details = error.details;
      }
      return json(payload, { status });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  },
};

export { ChatRoomDO };
