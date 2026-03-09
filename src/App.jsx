import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'

const DEFAULT_RELAY_URL =
  import.meta.env.VITE_MOQ_RELAY_URL ||
  'https://interop-relay.cloudflare.mediaoverquic.com:443'

const ADJECTIVES = [
  'amber',
  'brisk',
  'clear',
  'dawn',
  'ember',
  'glossy',
  'lucky',
  'rapid',
  'silver',
  'solar',
  'tidy',
  'vivid',
]

const NOUNS = [
  'bay',
  'brook',
  'cloud',
  'echo',
  'field',
  'harbor',
  'meadow',
  'orbit',
  'river',
  'studio',
  'summit',
  'trail',
]

const SAFE_CHARS = '23456789abcdefghjkmnpqrstuvwxyz'

function randomInt(max) {
  const buffer = new Uint32Array(1)
  window.crypto.getRandomValues(buffer)
  return buffer[0] % max
}

function pick(list) {
  return list[randomInt(list.length)]
}

function randomToken(length = 4) {
  return Array.from({ length }, () => SAFE_CHARS[randomInt(SAFE_CHARS.length)]).join('')
}

function normalizeRoomId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function createRoomId() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${randomToken()}`
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search)
  const room = normalizeRoomId(params.get('room') || '')
  const role = params.get('role') === 'viewer' ? 'viewer' : 'host'

  return {
    room: room || createRoomId(),
    role,
  }
}

function setStringAttribute(element, name, value) {
  if (!element) return

  if (value) {
    element.setAttribute(name, value)
  } else {
    element.removeAttribute(name)
  }
}

function setBooleanAttribute(element, name, enabled) {
  if (!element) return

  if (enabled) {
    element.setAttribute(name, '')
  } else {
    element.removeAttribute(name)
  }
}

function copyText(text) {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error('Clipboard API unavailable'))
  }

  return navigator.clipboard.writeText(text)
}

function MoqPublish({ relayUrl, streamName, device, audioEnabled, videoEnabled }) {
  const publishRef = useRef(null)

  useEffect(() => {
    const element = publishRef.current

    setStringAttribute(element, 'url', relayUrl)
    setStringAttribute(element, 'name', streamName)
    setStringAttribute(element, 'device', device)
    setBooleanAttribute(element, 'audio', audioEnabled)
    setBooleanAttribute(element, 'video', videoEnabled)
    setBooleanAttribute(element, 'controls', true)
  }, [audioEnabled, device, relayUrl, streamName, videoEnabled])

  return (
    <moq-publish className="moq-surface" data-moq-publisher ref={publishRef}>
      <div className="stream-fallback">
        正在加载发布组件。如果这里长时间没有出现采集控件，请确认浏览器允许加载远程模块。
      </div>
    </moq-publish>
  )
}

function MoqWatch({ relayUrl, streamName }) {
  const watchRef = useRef(null)

  useEffect(() => {
    const element = watchRef.current

    setStringAttribute(element, 'url', relayUrl)
    setStringAttribute(element, 'name', streamName)
    setBooleanAttribute(element, 'controls', true)
  }, [relayUrl, streamName])

  return (
    <moq-watch className="moq-surface" data-moq-viewer ref={watchRef}>
      <canvas className="stream-canvas" />
      <div className="stream-fallback">
        这里会显示房间直播画面。首次订阅时可能需要等待关键帧。
      </div>
    </moq-watch>
  )
}

function FeaturePill({ label, value }) {
  return (
    <div className="feature-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function App() {
  const initialState = useMemo(parseUrlState, [])
  const [roomId, setRoomId] = useState(initialState.room)
  const [role, setRole] = useState(initialState.role)
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL)
  const [device, setDevice] = useState('camera')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [copyFeedback, setCopyFeedback] = useState('')

  const streamName = `rooms/${roomId}`
  const viewerLink = useMemo(() => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('room', roomId)
    url.searchParams.set('role', 'viewer')
    return url.toString()
  }, [roomId])
  const hostLink = useMemo(() => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('room', roomId)
    url.searchParams.set('role', 'host')
    return url.toString()
  }, [roomId])
  const webTransportReady =
    typeof window !== 'undefined' &&
    'WebTransport' in window &&
    'VideoEncoder' in window &&
    'MediaStreamTrackProcessor' in window

  useEffect(() => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('room', roomId)
    url.searchParams.set('role', role)
    window.history.replaceState({}, '', url)
  }, [role, roomId])

  useEffect(() => {
    if (!copyFeedback) return undefined

    const timer = window.setTimeout(() => setCopyFeedback(''), 1800)
    return () => window.clearTimeout(timer)
  }, [copyFeedback])

  const handleCopy = async (label, value) => {
    try {
      await copyText(value)
      setCopyFeedback(`${label}已复制`)
    } catch (error) {
      setCopyFeedback('复制失败，请手动复制')
    }
  }

  const handleNewRoom = () => {
    setRoomId(createRoomId())
    setRole('host')
  }

  const showPublisher = role === 'host'

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Cloudflare MoQ Live Demo</p>
          <h1>用 URL 友好的随机房间号，直接进 Cloudflare 的 MoQ relay。</h1>
          <p className="hero-text">
            这个 demo 默认连接 Cloudflare 官方公开的互操作 relay，用浏览器发布摄像头或屏幕，并通过同一个房间号完成观看。
          </p>
        </div>

        <div className="hero-metrics">
          <FeaturePill label="Relay" value="Cloudflare interop" />
          <FeaturePill label="Room ID" value={roomId} />
          <FeaturePill label="Namespace" value={streamName} />
        </div>
      </section>

      {!webTransportReady ? (
        <section className="notice warning">
          当前浏览器缺少 `WebTransport` / `WebCodecs` 能力。请使用较新的 Chrome / Edge / Brave 测试。
        </section>
      ) : null}

      <section className="control-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>房间与角色</h2>
            <button className="ghost-button" onClick={handleNewRoom} type="button">
              新建随机房间
            </button>
          </div>

          <label className="field">
            <span>房间号</span>
            <input
              value={roomId}
              onChange={(event) => {
                const nextRoomId = normalizeRoomId(event.target.value)

                if (nextRoomId) {
                  setRoomId(nextRoomId)
                }
              }}
              placeholder="例如 silver-harbor-k9xm"
            />
          </label>

          <div className="toggle-row">
            <button
              className={role === 'host' ? 'segmented active' : 'segmented'}
              onClick={() => setRole('host')}
              type="button"
            >
              主播模式
            </button>
            <button
              className={role === 'viewer' ? 'segmented active' : 'segmented'}
              onClick={() => setRole('viewer')}
              type="button"
            >
              观众模式
            </button>
          </div>

          <p className="hint">
            房间号会同步写入 URL 查询参数，分享给别人即可直接进入同一个直播间。
          </p>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Relay 配置</h2>
          </div>

          <label className="field">
            <span>MoQ relay URL</span>
            <input
              value={relayUrl}
              onChange={(event) => setRelayUrl(event.target.value)}
              placeholder={DEFAULT_RELAY_URL}
            />
          </label>

          <p className="hint">
            默认值是 Cloudflare 在 `moq-rs` 仓库里公开的互操作测试 relay。若你拿到了专属 Cloudflare MoQ endpoint，可直接替换。
          </p>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>发布设置</h2>
          </div>

          <div className="toggle-row">
            <button
              className={device === 'camera' ? 'segmented active' : 'segmented'}
              onClick={() => setDevice('camera')}
              type="button"
            >
              摄像头
            </button>
            <button
              className={device === 'screen' ? 'segmented active' : 'segmented'}
              onClick={() => setDevice('screen')}
              type="button"
            >
              屏幕共享
            </button>
          </div>

          <div className="check-row">
            <label>
              <input
                checked={audioEnabled}
                onChange={(event) => setAudioEnabled(event.target.checked)}
                type="checkbox"
              />
              采集音频
            </label>
            <label>
              <input
                checked={videoEnabled}
                onChange={(event) => setVideoEnabled(event.target.checked)}
                type="checkbox"
              />
              采集视频
            </label>
          </div>

          <p className="hint">
            主播端可在组件内直接开始/停止推流。观众模式下这里只保留配置，便于快速切回主播。
          </p>
        </article>
      </section>

      <section className="share-grid">
        <article className="panel share-card">
          <h2>主播链接</h2>
          <code>{hostLink}</code>
          <button className="solid-button" onClick={() => handleCopy('主播链接', hostLink)} type="button">
            复制主播链接
          </button>
        </article>

        <article className="panel share-card">
          <h2>观众链接</h2>
          <code>{viewerLink}</code>
          <button className="solid-button" onClick={() => handleCopy('观众链接', viewerLink)} type="button">
            复制观众链接
          </button>
        </article>
      </section>

      {copyFeedback ? <section className="notice success">{copyFeedback}</section> : null}

      <section className={showPublisher ? 'stage-grid' : 'stage-grid viewer-only'}>
        {showPublisher ? (
          <article className="panel stage-card">
            <div className="panel-head">
              <h2>主播推流</h2>
              <span className="badge">publish</span>
            </div>
            <p className="hint">启动后会把本机摄像头或屏幕推到 `{streamName}`。</p>
            <MoqPublish
              audioEnabled={audioEnabled}
              device={device}
              relayUrl={relayUrl}
              streamName={streamName}
              videoEnabled={videoEnabled}
            />
          </article>
        ) : null}

        <article className="panel stage-card">
          <div className="panel-head">
            <h2>{showPublisher ? '房间监看' : '观众播放'}</h2>
            <span className="badge">watch</span>
          </div>
          <p className="hint">首次加入直播时，播放器可能要等到下一个关键帧才会开始出画。</p>
          <MoqWatch relayUrl={relayUrl} streamName={streamName} />
        </article>
      </section>

      <section className="notes-grid">
        <article className="panel">
          <h2>使用说明</h2>
          <ol className="steps">
            <li>打开页面后点击“新建随机房间”，会生成一个 URL 友好的房间号。</li>
            <li>主播模式下允许摄像头/屏幕权限，然后在左侧组件里开始推流。</li>
            <li>把观众链接发给其他人，对方打开后会直接订阅同一个房间。</li>
          </ol>
        </article>

        <article className="panel">
          <h2>实现假设</h2>
          <ol className="steps">
            <li>默认 relay 使用 Cloudflare 公开互操作节点，不需要额外本地服务。</li>
            <li>浏览器端媒体组件来自 `moq.dev` 的 Web Components，和 Cloudflare 官方博客列出的互通实现保持一致。</li>
            <li>如果你接入 Cloudflare 私有预览或带 JWT 的 relay，只需替换 relay URL。</li>
          </ol>
        </article>
      </section>
    </main>
  )
}
