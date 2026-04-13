# MoQ Draft 14 Browser Tests

这个目录现在是一个基于 vendored `moq-js` 的浏览器测试页，目标是 Cloudflare 的 draft-14 relay。页面同时提供：

- `video-moq` 播放
- `publisher-moq` 摄像头 + 麦克风推流

播放器和推流器使用同一个 `namespace`，方便在同一页里直接“推了就播”。手工测试时请使用一个新的、唯一的 `namespace`，不要复用已存在内容的流名。

## 文件

- `index.html`: 页面结构和样式，包含播放器区和推流区。
- `src/main.js`: 页面入口，负责播放器生命周期，以及把 Relay URL / Namespace 同步给 `publisher-moq`。
- `worker/index.js`: Cloudflare Workers 入口，只处理 `/api/*`，其它请求回退到静态资源。
- `worker/auth.js`: Microsoft OAuth、session cookie 和 D1 读写辅助。
- `migrations/0001_auth.sql`: `moq_` 前缀的用户、外部身份映射和 session 表结构。
- `wrangler.jsonc`: Workers 入口、静态资源目录和 `/api/*` 路由配置。
- `vendor/moq-js/moq-player.esm.js`: 已 vendored 的 `moq-js` 播放器 bundle。
- `vendor/moq-js/moq-publisher/`: 从 upstream `moq-js` 复制过来的推流自定义元素源码。
- `vendor/moq-js/publish/`: `PublisherApi` 入口。
- `vendor/moq-js/contribute/`: 浏览器采集、`WebCodecs` 编码、CMAF 分片和发布轨道实现。
- `vendor/moq-js/transport/`: `moq-js` 的 draft-14 传输层实现。
- `vendor/moq-js/media/`: catalog 和 MP4 封装辅助代码。
- `public/_headers`: Cloudflare Pages 所需的 COOP/COEP 头。
- `vite.config.js`: 本地开发头配置和构建哈希注入。

## 运行

1. 在项目根目录执行:

   ```bash
   npm install
   npm run dev -- --host 127.0.0.1 --port 8080
   ```

2. 用支持 `WebTransport` / `WebCodecs` / `MediaStreamTrackProcessor` 的 Chromium 浏览器打开:

   - `http://127.0.0.1:8080/`

3. 如果要推流：

   - 先确认 `Relay URL` 和 `Namespace`
   - 在推流区允许摄像头和麦克风权限
   - 点击 `Start Publish`

4. 如果要播放：

   - 保持相同的 `Relay URL` 和 `Namespace`
   - 点击 `创建播放器`

## 默认参数

- Relay URL: `https://draft-14.cloudflare.mediaoverquic.com/`
- Namespace: 留空，手工输入一个新的唯一值

## 鉴权 API

当前仓库已增加一套只命中 `/api/*` 的 Cloudflare Workers 鉴权后端：

- `GET /api/auth/microsoft/start`
- `GET /api/auth/microsoft/callback`
- `POST /api/auth/logout`
- `GET /api/me`

这样静态页面请求仍然直接走静态资源，只有 `/api/*` 才会进入 Worker。

### 需要的环境变量

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `AUTH_COOKIE_SECRET`
- `AUTH_SESSION_TTL_DAYS`，可选，默认 `30`

本地开发可参考 `.dev.vars.example`。

### D1

把 `migrations/0001_auth.sql` 应用到你的 D1 数据库，并将 D1 绑定命名为：

- `APP_DB`

### 微软应用注册

在 Microsoft Entra 应用注册里：

- 平台类型选择 `Web`
- Redirect URI 配置为：
  - 本地：`http://127.0.0.1:8788/api/auth/microsoft/callback` 或你的本地域名
  - 线上：`https://你的域名/api/auth/microsoft/callback`
- scope 至少包含：
  - `openid`
  - `profile`
  - `email`

### Workers 配置

仓库中的 `wrangler.jsonc` 已经配置：

- Worker 入口：`worker/index.js`
- 静态资源目录：`dist`
- 仅 `/api/*` 命中 Worker：`assets.run_worker_first = ["/api/*"]`

在正式部署前，你还需要把 `APP_DB` 的 D1 绑定补到 `wrangler.jsonc` 里。

### 部署提示

这套实现现在假设站点以 Cloudflare Workers + Static Assets 形式部署。前端页面保持静态输出，`/api/*` 路径走 Worker，因此可以减少非 API 页面触发 Worker 调用的次数。

## 当前实现

- 播放链路：页面直接加载 vendored `moq-js` 的 `video-moq` bundle。
- 推流链路：页面加载 vendored `moq-js` 的 `publisher-moq` 源码，自定义元素内部通过 `PublisherApi -> Broadcast -> Track -> transport/*` 发布。
- 浏览器侧编码：
  - 视频默认 H.264 `avc1.42E01E`
  - 音频默认 Opus
- CMAF 封装依赖 `mp4box`。

## Vendoring 说明

- upstream commit 记录在 `vendor/moq-js/UPSTREAM_COMMIT.txt`
- 当前仓库保留了既有的 `moq-player.esm.js`
- 同时补充复制了 upstream 发布侧源码目录，便于在本仓库里继续魔改推流逻辑
