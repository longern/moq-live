# moq-live

`moq-live` is a lightweight live-streaming web app built around Media over QUIC. It provides a viewer surface, a broadcaster surface, account settings, and a Cloudflare Worker backend for auth, room state, chat, social features, notifications, and media uploads.

## Features

- Watch live rooms by host handle, with direct MoQ namespace support for development and diagnostics.
- Broadcast from camera, microphone, or screen share over MoQ or WHIP.
- Use MoQ by default, with WebRTC WHIP/WHEP support for publish and playback fallback.
- Chat with presence, recent-message history, message retract, viewer mute controls, and broadcaster room-state sync.
- Follow hosts, browse following/follower lists, and opt into live-start notifications.
- Invite cohosts, accept or reject cohost requests, and watch active cohost streams in a split layout.
- Share live room links and generated room/screenshot images.
- Share live location while broadcasting so viewers can see the host's province and distance when available.
- Sign in with Microsoft OAuth and manage display name, handle, bio, gender, birth date, avatar, room title, welcome text, and cover image.
- Store users, sessions, rooms, follows, push subscriptions, and media on Cloudflare D1, Durable Objects, and R2.

## Stack

- React 19 on Vite
- `@moq/watch` / `@moq/publish` for MoQ playback and publishing
- WHIP/WHEP client helpers for WebRTC publish and playback
- Cloudflare Workers for API and static asset serving
- D1 for relational data, Durable Objects for chat/live/cohost/location/moderation state, and R2 for uploaded media

## Architecture Notes

- Viewer flow: a watch target resolves from a host handle or `ns:` namespace, then room state from `ChatRoomDO` drives MoQ or WebRTC playback.
- Broadcaster flow: authenticated users activate a room, start preview/publish, and sync live stream metadata through the room's Durable Object.
- Social flow: follows are stored in D1, live notification preferences attach to follow rows, and Web Push subscriptions receive live-start notifications.

## Getting Started

```bash
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:3047` by default.

Useful local environment variables:

```bash
VITE_SITE_TITLE="MoQ Live"
BACKEND_PROXY_TARGET="http://127.0.0.1:8788"
```

Set `BACKEND_PROXY_TARGET` when running the Worker separately and proxying `/api` and `/share` from Vite.

## Cloudflare Setup

The Worker expects these bindings:

- `APP_DB`: D1 database
- `CHAT_ROOM`: Durable Object namespace for `ChatRoomDO`
- `APP_MEDIA`: R2 bucket for avatars and room covers
- `ASSETS`: built frontend assets from `dist/`

Required secrets and variables:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `AUTH_COOKIE_SECRET`
- `AUTH_SESSION_TTL_DAYS` (optional, defaults to `30`)
- `WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY` for live-start push notifications
- `WEB_PUSH_SUBJECT` (optional, defaults to `mailto:admin@example.com`)
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (optional, used to provision Cloudflare Stream WebRTC live inputs for rooms)

`GET /api/me` includes `authProviders`, the OAuth providers that are implemented
and fully configured in the current Worker environment. It does not expose
client secrets.

Database migrations are in `migrations/`. Apply them to the D1 database before running the authenticated room and profile flows.

## Build

```bash
npm run build
```

The frontend is written to `dist/`. The Worker entry point is `worker/index.js`.

## Project Layout

```text
src/          Frontend app, components, hooks, and client-side protocol helpers
worker/       Cloudflare Worker API, Microsoft OAuth, and ChatRoom Durable Object
migrations/   D1 schema migrations
public/       Icons, headers, and static assets
```

## License

ISC
