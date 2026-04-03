# MoQ Draft 14 Browser Tests

这个目录现在是基于 `@moq/lite + @moq/hang` 的浏览器测试页，默认目标是 Cloudflare 的 draft-14 BBB relay。

## 文件

- `index.html`: 只负责页面结构和样式，脚本入口改为外部模块。
- `src/main.js`: 主线程播放器逻辑（连接 relay、MSE append、canvas 渲染、UI 状态管理）。
- `src/segment-worker.js`: worker 线程，负责 CMAF 时间戳解析与音视频段调度（减轻主线程负担）。
- `public/_headers`: Cloudflare Pages 所需的 COOP/COEP 头。
- `vite.config.js`: 本地开发头配置和构建哈希注入。

## 运行

1. 在项目根目录执行:

   ```bash
   npm install
   npm run dev -- --host 127.0.0.1 --port 8080
   ```

2. 用支持 `WebTransport` / `WebCodecs` 的 Chromium 浏览器打开:

   - `http://127.0.0.1:8080/`

## 默认参数

- Relay URL: `https://draft-14.cloudflare.mediaoverquic.com/`
- Namespace: `bbb`

页面会订阅 `.catalog`，自动选择默认音视频轨道并播放。

## 说明

- 不依赖 vendored `moq-js` 或 `video-moq`，也没有默认内置控件。
- 当前播放链路是：`@moq/lite` 拉流 + `.catalog` 解析 + `segment-worker` 调度 + `MediaSource` 音频/视频缓冲 + `canvas` 渲染。
- 缓冲策略是“略增延迟换稳定”：启动前先累积一小段缓冲，并在缓冲过深时回拉到目标延迟。
