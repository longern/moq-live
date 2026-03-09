# moq-live

基于 React + Vite 的 Cloudflare MoQ 直播 demo。页面默认连接 Cloudflare 官方公开的互操作 relay，并使用 URL 友好的随机房间号来区分直播间。

## 资料来源

- Cloudflare MoQ docs: <https://developers.cloudflare.com/moq/>
- Cloudflare 官方博客（说明已和 `moq.dev` / `moq-js` 做过互通）: <https://blog.cloudflare.com/introducing-media-over-quic-in-open-beta/>
- `moq.dev` Web Components 文档: <https://doc.moq.dev/>
- Cloudflare `moq-rs` 公开互操作 relay: <https://github.com/cloudflare/moq-rs>

## Demo 内容

- 自动生成形如 `silver-harbor-k9xm` 的房间号，全部由小写字母、数字和连字符组成。
- 通过 `?room=<id>&role=host|viewer` 分享主播/观众链接。
- 主播模式可发布摄像头或屏幕。
- 观众模式可直接订阅同一个房间 namespace。
- Relay URL 可在页面里切换，也可以用 `VITE_MOQ_RELAY_URL` 覆盖默认值。

## 启动

```bash
npm install
npm run dev
```

## 注意事项

- 浏览器需要支持 `WebTransport`、`WebCodecs` 和 `MediaStreamTrackProcessor`，推荐使用新版 Chromium 内核浏览器。
- 当前实现为了避免在终端里新增依赖，直接在 `index.html` 中从 CDN 加载 `@moq/publish` 和 `@moq/watch`。
- 默认 relay 指向 Cloudflare 公开的互操作节点；如果你有 Cloudflare 私有预览环境或带认证参数的 relay URL，可直接在页面输入框替换。
