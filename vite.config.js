import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig, loadEnv } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const moqPlayerModulePath = "/vendor/moq-js/moq-player.esm.js";
const AUDIO_PREBUFFER_MS = 120;
const AUDIO_RING_CAPACITY_MS = 2000;

function optimizeMoqPlayerCanvas() {
  const audioCapabilityExpression =
    '"undefined"!=typeof SharedArrayBuffer&&"undefined"!=typeof AudioWorkletNode&&!0===globalThis.crossOriginIsolated';
  const privateFieldSnippet = "#g;#y=!0;#_;#b=!1;constructor";
  const optimizedPrivateFieldSnippet =
    "#g;#y=!0;#_;#b=!1;#D;#W=0;#H=0;constructor";
  const constructorSnippet =
    "constructor(t,e){this.#f=t.canvas,this.#h=e,this.#_=!1,this.#m=new TransformStream({start:this.#l.bind(this),transform:this.#d.bind(this)}),this.#p().catch(console.error)}";
  const optimizedConstructorSnippet =
    'constructor(t,e){this.#f=t.canvas,this.#h=e,this.#_=!1,this.#D=this.#f.getContext("2d");if(!this.#D)throw new Error("failed to get canvas context");this.#m=new TransformStream({start:this.#l.bind(this),transform:this.#d.bind(this)}),this.#p().catch(console.error)}';
  const frameRenderSnippet =
    'self.requestAnimationFrame(()=>{this.#f.width=e.displayWidth,this.#f.height=e.displayHeight;const t=this.#f.getContext("2d");if(!t)throw new Error("failed to get canvas context");t.drawImage(e,0,0,e.displayWidth,e.displayHeight),e.close()})';
  const optimizedFrameRenderSnippet =
    "self.requestAnimationFrame(()=>{const t=e.displayWidth,i=e.displayHeight;(this.#W!==t||this.#H!==i)&&(this.#f.width=t,this.#f.height=i,this.#W=t,this.#H=i),this.#D.drawImage(e,0,0,t,i),e.close()})";
  const audioRingWriteSnippetWorklet =
    'const i=this.channels[t],r=Math.min(t,e.numberOfChannels-1);if(a<o){const t=i.subarray(a,o);e.copyTo(t,{planeIndex:r,frameCount:o-a})}else{const t=i.subarray(a),s=i.subarray(0,o);e.copyTo(t,{planeIndex:r,frameCount:t.length}),s.length&&e.copyTo(s,{planeIndex:r,frameOffset:t.length,frameCount:s.length})}}';
  const optimizedAudioRingWriteSnippetWorklet =
    'const i=this.channels[t],r=Math.min(t,e.numberOfChannels-1),h="string"==typeof e.format&&!e.format.endsWith("-planar");if(h){const t=a<o?o-a:this.capacity-a+o,u=new Float32Array(t*e.numberOfChannels);try{e.copyTo(u,{planeIndex:0,frameCount:t,format:"f32"})}catch{e.copyTo(u,{planeIndex:0,frameCount:t})}for(let o=0;o<t;o+=1)i[(a+o)%this.capacity]=u[o*e.numberOfChannels+r]}else if(a<o){const t=i.subarray(a,o);e.copyTo(t,{planeIndex:r,frameCount:o-a})}else{const t=i.subarray(a),s=i.subarray(0,o);e.copyTo(t,{planeIndex:r,frameCount:t.length}),s.length&&e.copyTo(s,{planeIndex:r,frameOffset:t.length,frameCount:s.length})}}';
  const audioRingWriteSnippetWorker =
    'const i=this.channels[e],r=Math.min(e,t.numberOfChannels-1);if(a<o){const e=i.subarray(a,o);t.copyTo(e,{planeIndex:r,frameCount:o-a})}else{const e=i.subarray(a),s=i.subarray(0,o);t.copyTo(e,{planeIndex:r,frameCount:e.length}),s.length&&t.copyTo(s,{planeIndex:r,frameOffset:e.length,frameCount:s.length})}}';
  const optimizedAudioRingWriteSnippetWorker =
    'const i=this.channels[e],r=Math.min(e,t.numberOfChannels-1),h="string"==typeof t.format&&!t.format.endsWith("-planar");if(h){const e=a<o?o-a:this.capacity-a+o,u=new Float32Array(e*t.numberOfChannels);try{t.copyTo(u,{planeIndex:0,frameCount:e,format:"f32"})}catch{t.copyTo(u,{planeIndex:0,frameCount:e})}for(let o=0;o<e;o+=1)i[(a+o)%this.capacity]=u[o*t.numberOfChannels+r]}else if(a<o){const e=i.subarray(a,o);t.copyTo(e,{planeIndex:r,frameCount:o-a})}else{const e=i.subarray(a),s=i.subarray(0,o);t.copyTo(e,{planeIndex:r,frameCount:e.length}),s.length&&t.copyTo(s,{planeIndex:r,frameOffset:e.length,frameCount:s.length})}}';
  const audioConfigSnippet =
    'const s={};i&&r&&(s.audio={channels:r,sampleRate:i,ring:new v(2,i)},this.#P=new f(s.audio)),s.video={canvas:t.canvas},this.send({config:s},s.video.canvas)';
  const optimizedAudioConfigSnippet =
    `const s={},n=${audioCapabilityExpression};i&&r&&n&&(s.audio={channels:r,sampleRate:i,ring:new v(2,Math.max(Math.round(i*${AUDIO_RING_CAPACITY_MS}/1e3),Math.round(i*${AUDIO_PREBUFFER_MS}/1e3)+128)),prebufferFrames:Math.max(128,Math.round(i*${AUDIO_PREBUFFER_MS}/1e3))},this.#P=new f(s.audio)),s.video={canvas:t.canvas},this.send({config:s},s.video.canvas)`;
  const playerConstructorSnippet =
    'constructor(t,e,i,r){super(),this.#wt=t,this.#vt=e,this.#xt=new Map(e.tracks.map(t=>[t.name,t])),this.#Ut=i,this.#St=e.tracks.find(t=>a(t))?.name??"",this.#Et=e.tracks.find(t=>n(t))?.name??"",this.#Tt=!1,this.#Bt=!1,this.#bt=new x({canvas:r,catalog:e},this),';
  const optimizedPlayerConstructorSnippet =
    `constructor(t,e,i,r){super(),this.#wt=t,this.#vt=e,this.#xt=new Map(e.tracks.map(t=>[t.name,t])),this.#Ut=i;const o=${audioCapabilityExpression};this.#St=o?e.tracks.find(t=>a(t))?.name??"":"",this.#Et=e.tracks.find(t=>n(t))?.name??"",this.#Tt=!o,this.#Bt=!1,this.#bt=new x({canvas:r,catalog:e},this),`;
  const audioWorkletProcessorSnippet =
    'class i extends AudioWorkletProcessor{ring;base;constructor(){super(),this.base=0,this.port.onmessage=this.onMessage.bind(this)}onMessage(t){const e=t.data;e.config&&this.onConfig(e.config)}onConfig(t){this.ring=new e(t.ring)}process(t,e,i){if(!this.ring)return!0;if(1!=t.length&&1!=e.length)throw new Error("only a single track is supported");if(this.ring.size()==this.ring.capacity)return console.warn("resyncing ring buffer"),this.ring.clear(),!0;const r=e[0];return this.ring.read(r),r.length,!0}}';
  const optimizedAudioWorkletProcessorSnippet =
    'class i extends AudioWorkletProcessor{ring;base;prebufferFrames;buffering;constructor(){super(),this.base=0,this.prebufferFrames=0,this.buffering=!1,this.port.onmessage=this.onMessage.bind(this)}onMessage(t){const e=t.data;e.config&&this.onConfig(e.config)}onConfig(t){this.ring=new e(t.ring),this.prebufferFrames=Math.max(0,Math.min(this.ring.capacity,Math.round(t.prebufferFrames??0))),this.buffering=this.prebufferFrames>0}process(t,e,i){if(!this.ring)return!0;if(1!=t.length&&1!=e.length)throw new Error("only a single track is supported");if(this.ring.size()==this.ring.capacity)return console.warn("resyncing ring buffer"),this.ring.clear(),this.buffering=this.prebufferFrames>0,!0;const r=e[0],s=r[0]?.length??0;for(const t of r)t.fill(0);if(this.buffering&&this.ring.size()<Math.max(this.prebufferFrames,s))return!0;this.buffering=!1;const n=this.ring.read(r);return n<s&&(this.buffering=this.prebufferFrames>0),!0}}';
  const segmentQueueSnippet =
    'class t{audio;video;constructor(){this.audio=new e,this.video=new e}}class e{#t;#s;frames;#e;constructor(){this.frames=new ReadableStream({pull:this.#i.bind(this),cancel:this.#r.bind(this)}),this.#e=new TransformStream({},{highWaterMark:100})}get segments(){return this.#e.writable}async#i(t){for(;;){if(!this.#t&&this.#s){this.#t=this.#s,this.#s=void 0}const e=this.#e.readable.getReader();let i;if(this.#t){const t=this.#t.frames.getReader();i=await Promise.race([t.read(),e.read()]),t.releaseLock()}else i=await e.read();e.releaseLock();const{value:s,done:n}=i;if(n){if(this.#t){if(this.#t=void 0,this.#s){this.#t=this.#s,this.#s=void 0;continue}}else this.#s=void 0}else{if(!r(s))return void t.enqueue(s);if(this.#t){if(s.sequence<this.#t.sequence){await s.frames.cancel("skipping segment; too old");continue}if(this.#s){if(s.sequence<=this.#s.sequence){await s.frames.cancel("skipping segment; too old");continue}await this.#s.frames.cancel("skipping segment; superseded")}this.#s=s;continue}this.#t=s}}}async#r(t){this.#t&&await this.#t.frames.cancel(t),this.#s&&await this.#s.frames.cancel(t);const e=this.#e.readable.getReader();for(;;){const{value:i,done:r}=await e.read();if(r)break;await i.frames.cancel(t)}}}';
  const optimizedSegmentQueueSnippet =
    'class t{audio;video;constructor(){this.audio=new e,this.video=new e}}class e{#t;#s;frames;#e;constructor(){this.#s=[],this.frames=new ReadableStream({pull:this.#i.bind(this),cancel:this.#r.bind(this)}),this.#e=new TransformStream({},{highWaterMark:100})}get segments(){return this.#e.writable}#n(t){for(;this.#s.length;){const e=this.#s.at(-1);if(!e)break;if(t.sequence>e.sequence)break;this.#s.pop(),t.sequence===e.sequence?e.frames.cancel("skipping segment; superseded"):t.sequence<e.sequence&&e.frames.cancel("skipping segment; too old")}this.#s.push(t)}async#i(t){for(;;){!this.#t&&this.#s.length&&(this.#t=this.#s.shift());const e=this.#e.readable.getReader();let i;if(this.#t){const t=this.#t.frames.getReader();i=await Promise.race([t.read(),e.read()]),t.releaseLock()}else i=await e.read();e.releaseLock();const{value:s,done:n}=i;if(n){if(this.#t){this.#t=void 0;continue}if(this.#s.length)continue;return}else{if(!r(s))return void t.enqueue(s);if(this.#t&&s.sequence<this.#t.sequence){await s.frames.cancel("skipping segment; too old");continue}this.#n(s)}}}async#r(t){this.#t&&await this.#t.frames.cancel(t);for(const e of this.#s)await e.frames.cancel(t);this.#s.length=0;const e=this.#e.readable.getReader();for(;;){const{value:i,done:r}=await e.read();if(r)break;await i.frames.cancel(t)}}}';
  const segmentDispatchSnippet =
    'const[n,a]=s.stream.release();this.#bt.segment({init:t.initTrack,kind:e,header:s.header,buffer:n,stream:a})';
  const optimizedSegmentDispatchSnippet =
    'const[n,a]=s.stream.release();this.#bt.segment({init:t.initTrack,kind:e,header:s.header,buffer:n,stream:a})';
  const setVolumeSnippet =
    'async setVolume(t){this.#bt.setVolume(t),0!=t||this.#Tt?t>0&&this.#Tt&&await this.mute(!1):await this.mute(!0)}';
  const optimizedSetVolumeSnippet =
    'async setVolume(t){this.#bt.setVolume(t),super.dispatchEvent(new CustomEvent("volumechange",{detail:{muted:t<=.001,volume:t}}))}';

  return {
    name: "optimize-moq-player-canvas",
    transform(code, id) {
      if (!id.endsWith(moqPlayerModulePath)) {
        return null;
      }

      let nextCode = code;
      const replacements = [
        [privateFieldSnippet, optimizedPrivateFieldSnippet],
        [constructorSnippet, optimizedConstructorSnippet],
        [frameRenderSnippet, optimizedFrameRenderSnippet],
        [audioRingWriteSnippetWorklet, optimizedAudioRingWriteSnippetWorklet],
        [audioRingWriteSnippetWorker, optimizedAudioRingWriteSnippetWorker],
        [audioConfigSnippet, optimizedAudioConfigSnippet],
        [playerConstructorSnippet, optimizedPlayerConstructorSnippet],
        [audioWorkletProcessorSnippet, optimizedAudioWorkletProcessorSnippet],
        [segmentQueueSnippet, optimizedSegmentQueueSnippet],
        [segmentDispatchSnippet, optimizedSegmentDispatchSnippet],
        [setVolumeSnippet, optimizedSetVolumeSnippet],
      ];

      for (const [from, to] of replacements) {
        if (!nextCode.includes(from)) {
          throw new Error(
            `Missing moq-player optimization target: ${from.slice(0, 48)}...`,
          );
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
    plugins: [injectSiteTitle(siteTitle), optimizeMoqPlayerCanvas(), preact()],
    define: {
      __APP_TITLE__: JSON.stringify(siteTitle),
      __BUILD_HASH__: JSON.stringify(buildHash),
    },
    server: {
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
