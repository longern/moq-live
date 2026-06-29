import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const moqNetAdapterModulePath = "/node_modules/@moq/net/ietf/adapter.js";
const moqNetSubscribeModulePath = "/node_modules/@moq/net/ietf/subscribe.js";
const moqNetSubscriberModulePath = "/node_modules/@moq/net/ietf/subscriber.js";
const moqPublishModulePath = "/node_modules/@moq/publish/";
const moqWatchModulePath = "/node_modules/@moq/watch/";

function patchMoqNetCloudflareSubscribe() {
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
    name: "patch-moq-net-cloudflare-subscribe",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0];
      if (!normalizedId.endsWith(moqNetSubscribeModulePath)) {
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
          throw new Error(`Missing @moq/net subscribe patch target: ${from}`);
        }
        nextCode = nextCode.replace(from, to);
      }

      return nextCode === code ? null : { code: nextCode, map: null };
    },
  };
}

function patchMoqNetPublishDoneDetails() {
  const adapterPublishDoneSnippet = `            case 0x0b: {
                // PublishDone
                const requestId = await readRequestId();
                return { route: Route.CloseStream, requestId };
            }`;
  const patchedAdapterPublishDoneSnippet = `            case 0x0b: {
                // PublishDone carries the subscription close status; route it
                // through so the subscriber can decode statusCode/reasonPhrase.
                const requestId = await readRequestId();
                return { route: Route.FollowUp, requestId };
            }`;
  const subscriberImportSnippet =
    'import { PublishError } from "./publish.js";';
  const patchedSubscriberImportSnippet =
    'import { PublishDone, PublishError } from "./publish.js";';
  const subscriberCloseSnippet = `                        // Wait for stream close (= PublishDone) or track close (= local unsubscribe)
                        await Promise.race([stream.reader.closed, request.track.closed]);`;
  const patchedSubscriberCloseSnippet = `                        // Wait for PublishDone, stream close, or local unsubscribe.
                        const closeResult = await Promise.race([
                            (async () => {
                                const msgType = await stream.reader.u53();
                                if (msgType !== PublishDone.id) {
                                    throw new Error(\`unexpected subscribe follow-up: 0x\${msgType.toString(16)}\`);
                                }
                                const done = await PublishDone.decode(stream.reader, version);
                                return { type: "publishDone", done };
                            })(),
                            stream.reader.closed.then(() => ({ type: "stream" })),
                            request.track.closed.then((reason) => ({ type: "track", reason })),
                        ]);
                        if (closeResult.type === "publishDone") {
                            const done = closeResult.done;
                            console.debug(\`publish done detail: id=\${requestId} broadcast=\${broadcast} track=\${request.track.name} statusCode=\${done.statusCode} reason=\${done.reasonPhrase}\`);
                            if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
                                globalThis.dispatchEvent(new CustomEvent("moq-subscribe-done", {
                                    detail: {
                                        requestId: Number(requestId),
                                        requestIdText: requestId.toString(),
                                        broadcast,
                                        track: request.track.name,
                                        statusCode: done.statusCode,
                                        reasonPhrase: done.reasonPhrase,
                                    },
                                }));
                            }
                        }`;

  return {
    name: "patch-moq-net-publish-done-details",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.split("?")[0];
      if (normalizedId.endsWith(moqNetAdapterModulePath)) {
        if (!code.includes(adapterPublishDoneSnippet)) {
          throw new Error("Missing @moq/net adapter PublishDone patch target");
        }
        return {
          code: code.replace(
            adapterPublishDoneSnippet,
            patchedAdapterPublishDoneSnippet,
          ),
          map: null,
        };
      }

      if (normalizedId.endsWith(moqNetSubscriberModulePath)) {
        let nextCode = code;
        for (const [from, to] of [
          [subscriberImportSnippet, patchedSubscriberImportSnippet],
          [subscriberCloseSnippet, patchedSubscriberCloseSnippet],
        ]) {
          if (!nextCode.includes(from)) {
            throw new Error(
              `Missing @moq/net subscriber patch target: ${from}`,
            );
          }
          nextCode = nextCode.replace(from, to);
        }
        return nextCode === code ? null : { code: nextCode, map: null };
      }

      return null;
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
        res.setHeader(
          "Content-Type",
          "application/manifest+json; charset=utf-8",
        );
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
      VitePWA({
        injectRegister: false,
        manifest: false,
        strategies: "injectManifest",
        srcDir: "src",
        filename: "moq-push-sw.js",
        injectManifest: {
          injectionPoint: undefined,
          rollupFormat: "iife",
        },
      }),
      patchMoqNetPublishDoneDetails(),
      viteStaticCopy({
        targets: [{ src: "public.local/**/*", dest: "./" }],
        silent: true,
      }),
      react(),
    ],
    optimizeDeps: {
      exclude: ["@moq/net", "@moq/publish", "@moq/watch"],
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
            },
          }
        : {}),
    },
    preview: {
      headers: isolationHeaders,
    },
  };
});
