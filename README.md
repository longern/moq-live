# moq-live

一个基于 `moq-js` 的轻量直播站：

- 观众端：进入直播间、播放 MoQ 流、聊天室互动
- 主播端：摄像头/麦克风开播、屏幕共享、合成源、封面上传
- 账号端：Microsoft OAuth 登录、头像/Handle/显示名管理
- 后端：Cloudflare Worker + D1 + Durable Object + R2

## 技术栈

- 前端：Preact + Vite
- 播放/推流：vendored `moq-js`
- 后端：Cloudflare Workers
- 数据：
  - D1：用户、session、直播间
  - Durable Object：聊天室在线状态、最近消息、直播状态
  - R2：头像、直播封面

## 本地开发

安装依赖：

```bash
npm install
```

启动前端开发服务器：

```bash
export VITE_SITE_TITLE="MoQ Live"
npm run dev -- --host 127.0.0.1 --port 8080
```

如需联调 Worker API，可额外配置：

```bash
export BACKEND_PROXY_TARGET="http://127.0.0.1:8788"
```

## Worker 依赖

需要以下绑定或环境变量：

- D1：`APP_DB`
- Durable Object：`CHAT_ROOM`
- R2：`APP_MEDIA`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `AUTH_COOKIE_SECRET`
- `AUTH_SESSION_TTL_DAYS`，可选，默认 `30`

数据库迁移位于 [`migrations/`](./migrations)。

## 主要接口

- `GET /api/me`
- `POST /api/me/profile`
- `POST /api/me/avatar`
- `GET /api/me/room`
- `POST /api/me/room/cover`
- `GET /api/rooms`
- `GET /api/rooms/resolve`
- `GET /api/auth/microsoft/start`
- `GET /api/auth/microsoft/callback`
- `POST /api/auth/logout`
- `GET /api/chat/:room/ws`

## 构建

```bash
npm run build
```

静态资源输出到 `dist/`，Worker 入口为 [worker/index.js](/Users/longsiyu/workspace/moq-live/worker/index.js)。
