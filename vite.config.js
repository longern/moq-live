import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig, loadEnv } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const moqWatchBroadcastModuleMarker = "/node_modules/@moq/watch/broadcast-";
const moqLiteSubscribeModulePath = "/node_modules/@moq/lite/ietf/subscribe.js";
const AUDIO_PREBUFFER_MS = 100;
const AUDIO_RING_CAPACITY_MS = 2000;
const AUDIO_TARGET_BUFFER_MS = 140;
const AUDIO_MAX_BUFFER_MS = 220;
const AUDIO_SEGMENT_READ_TIMEOUT_MS = 4000;
const VIDEO_SEGMENT_READ_TIMEOUT_MS = 10000;
const AUDIO_SUBGROUP_SWITCH_TIMEOUT_MS = 750;
const VIDEO_SUBGROUP_SWITCH_TIMEOUT_MS = 2000;

function patchMoqWatchCatalogFormats() {
  const broadcastFetchSnippet =
    'const o = r === "hang" ? "catalog.json" : "catalog", a = i.subscribe(o, ee.catalog);\n    e.cleanup(() => a.close());\n    const c = r === "hang" ? async () => ms(a) : async () => {\n      const u = await er(a);\n      return u ? rr(u) : void 0;\n    };';
  const patchedBroadcastFetchSnippet =
    'const o = r === "hang" ? "catalog.json" : r === ".catalog" ? ".catalog" : "catalog", a = i.subscribe(o, ee.catalog);\n    e.cleanup(() => a.close());\n    const c = r === "hang" ? async () => ms(a) : r === ".catalog" ? async () => {\n      const u = await __moqWatchFetchMoqJsCatalog(a);\n      return u ? await __moqWatchMoqJsCatalogToHang(u, i, e) : void 0;\n    } : async () => {\n      const u = await er(a);\n      return u ? rr(u) : void 0;\n    };';
  const converterInsertAfter =
    "async function er(t) {\n  const e = await t.readFrame();\n  if (e)\n    return Qi(e);\n}\n";
  const moqJsCatalogConverter = `${converterInsertAfter}function __moqWatchBytes(t) {
  if (t instanceof Uint8Array) return t;
  if (t instanceof ArrayBuffer) return new Uint8Array(t);
  return new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
}

function __moqWatchBase64ToBytes(t) {
  try {
    const e = atob(t), n = new Uint8Array(e.length);
    for (let s = 0; s < e.length; s++) n[s] = e.charCodeAt(s);
    return n;
  } catch {
    return;
  }
}
function __moqWatchBase64ToHex(t) {
  if (!t) return;
  try {
    return rt(__moqWatchBytes(__moqWatchBase64ToBytes(t) ?? new Uint8Array()));
  } catch {
    return;
  }
}
function __moqWatchFlattenMoqJsTracks(t) {
  const e = t?.commonTrackFields ?? {};
  return (t?.tracks ?? []).map((n) => ({
    ...e,
    ...n,
    selectionParams: {
      ...(e.selectionParams ?? {}),
      ...(n.selectionParams ?? {})
    }
  }));
}
function __moqWatchDecodeMoqJsCatalog(t) {
  const e = new TextDecoder().decode(t);
  try {
    return JSON.parse(e);
  } catch (n) {
    console.warn("invalid .catalog payload", e);
    throw n;
  }
}
async function __moqWatchFetchMoqJsCatalog(t) {
  const e = await t.readFrame();
  if (e)
    return __moqWatchDecodeMoqJsCatalog(e);
}
async function __moqWatchReadInitTrack(t, e, n) {
  if (!t) return;
  const s = e.subscribe(t, ee.catalog);
  n.cleanup(() => s.close());
  try {
    const i = await s.readFrame();
    if (!i) return;
    return ri(i);
  } catch (i) {
    console.warn("failed to read .catalog init track", t, i);
    return;
  } finally {
    s.close();
  }
}
async function __moqWatchMoqJsCatalogToHang(t, e, n) {
  const s = {}, i = {};
  for (const l of __moqWatchFlattenMoqJsTracks(t)) {
    const r = l.selectionParams ?? {}, o = l.name;
    if (!o) continue;
    const a = l.packaging === "cmaf" && l.initTrack ? await __moqWatchReadInitTrack(l.initTrack, e, n) : void 0;
    const c = l.packaging === "cmaf" ? { kind: "cmaf", timescale: L(a?.timescale ?? 1e6), trackId: L(a?.trackId ?? 1) } : { kind: "legacy" };
    const u = a?.description ? rt(a.description) : __moqWatchBase64ToHex(l.initData);
    if (typeof r.width == "number" && typeof r.height == "number") {
      s[o] = {
        codec: r.codec ?? "",
        container: c,
        description: u,
        codedWidth: L(r.width),
        codedHeight: L(r.height),
        framerate: r.framerate,
        bitrate: r.bitrate != null ? L(r.bitrate) : void 0
      };
    } else if (typeof r.samplerate == "number" || typeof r.channelConfig == "string") {
      const d = Number.parseInt(r.channelConfig ?? "2", 10);
      i[o] = {
        codec: r.codec ?? "opus",
        container: c,
        description: u,
        sampleRate: L(r.samplerate ?? 48e3),
        numberOfChannels: L(Number.isFinite(d) ? d : 2),
        bitrate: r.bitrate != null ? L(r.bitrate) : void 0
      };
    }
  }
  const r = {};
  return Object.keys(s).length > 0 && (r.video = { renditions: s }), Object.keys(i).length > 0 && (r.audio = { renditions: i }), r;
}
`;

  return {
    name: "patch-moq-watch-catalog-formats",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0];
      if (
        normalizedId.includes(moqWatchBroadcastModuleMarker) &&
        normalizedId.endsWith(".js")
      ) {
        let nextCode = code;
        if (!nextCode.includes(converterInsertAfter)) {
          throw new Error(
            "Missing @moq/watch broadcast converter insert target",
          );
        }
        nextCode = nextCode.replace(
          converterInsertAfter,
          moqJsCatalogConverter,
        );
        if (!nextCode.includes(broadcastFetchSnippet)) {
          throw new Error(
            "Missing @moq/watch broadcast catalog fetch patch target",
          );
        }
        nextCode = nextCode.replace(
          broadcastFetchSnippet,
          patchedBroadcastFetchSnippet,
        );
        return nextCode === code ? null : { code: nextCode, map: null };
      }

      return null;
    },
  };
}

function patchMoqLiteCloudflareSubscribe() {
  const groupOrderSnippet =
    "// we only support Group Order descending\nconst GROUP_ORDER = 0x02;";
  const patchedGroupOrderSnippet =
    "// Cloudflare's draft-14 relay expects publisher order for public media tracks.\nconst GROUP_ORDER = 0x00;";
  const draft14FilterSnippet =
    "await w.u53(0x2); // filter type = LargestObject";
  const patchedDraft14FilterSnippet =
    "await w.u53(0x1); // filter type = NextGroupStart";
  const paramsFilterSnippet =
    "params.subscriptionFilter = 0x2; // LargestObject";
  const patchedParamsFilterSnippet =
    "params.subscriptionFilter = 0x1; // NextGroupStart";

  return {
    name: "patch-moq-lite-cloudflare-subscribe",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0];
      if (!normalizedId.endsWith(moqLiteSubscribeModulePath)) {
        return null;
      }

      let nextCode = code;
      const replacements = [
        [groupOrderSnippet, patchedGroupOrderSnippet],
        [draft14FilterSnippet, patchedDraft14FilterSnippet],
        [paramsFilterSnippet, patchedParamsFilterSnippet],
      ];

      for (const [from, to] of replacements) {
        if (!nextCode.includes(from)) {
          throw new Error(`Missing @moq/lite subscribe patch target: ${from}`);
        }
        nextCode = nextCode.replace(from, to);
      }

      return nextCode === code ? null : { code: nextCode, map: null };
    },
  };
}

function injectSiteTitle(siteTitle) {
  const escapedSiteTitle = siteTitle
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return {
    name: "inject-site-title",
    transformIndexHtml(html) {
      return html.replace(
        /<title>.*<\/title>/,
        `<title>${escapedSiteTitle}</title>`,
      );
    },
  };
}

function readEnvValue(env, name, fallback) {
  const value = env[name]?.trim();
  return value || fallback;
}

function createWebManifest(env, siteTitle) {
  const name = readEnvValue(env, "VITE_MANIFEST_NAME", siteTitle);
  const shortName = readEnvValue(env, "VITE_MANIFEST_SHORT_NAME", name);

  return {
    name,
    short_name: shortName,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08131d",
    theme_color: "#08131d",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

function createWebManifestPlugin(env, siteTitle) {
  const manifestJson = `${JSON.stringify(createWebManifest(env, siteTitle), null, 2)}\n`;

  return {
    name: "generate-web-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        if (pathname !== "/manifest.webmanifest") {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        res.end(manifestJson);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: manifestJson,
      });
    },
  };
}

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function collectHashInputs(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "dist" || entry === "node_modules") {
      continue;
    }
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectHashInputs(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function computeBuildHash() {
  const hash = createHash("sha256");
  const files = collectHashInputs(rootDir).sort();
  for (const file of files) {
    hash.update(relative(rootDir, file));
    hash.update("\n");
    hash.update(readFileSync(file));
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 12);
}

const buildHash = computeBuildHash();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const siteTitle = env.VITE_SITE_TITLE?.trim() || "MoQ Live Deck";
  const backendProxyTarget = env.BACKEND_PROXY_TARGET?.trim() || "";

  return {
    plugins: [
      injectSiteTitle(siteTitle),
      createWebManifestPlugin(env, siteTitle),
      patchMoqWatchCatalogFormats(),
      patchMoqLiteCloudflareSubscribe(),
      preact(),
    ],
    optimizeDeps: {
      exclude: ["@moq/lite", "@moq/watch"],
    },
    define: {
      __APP_TITLE__: JSON.stringify(siteTitle),
      __BUILD_HASH__: JSON.stringify(buildHash),
    },
    server: {
      port: 3047,
      headers: isolationHeaders,
      ...(backendProxyTarget
        ? {
            proxy: {
              "/api": {
                target: backendProxyTarget,
                changeOrigin: true,
                ws: true,
              },
              "/share": {
                target: backendProxyTarget,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    preview: {
      headers: isolationHeaders,
    },
  };
});
