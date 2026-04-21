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
const AUDIO_SEGMENT_READ_TIMEOUT_MS = 4000;
const VIDEO_SEGMENT_READ_TIMEOUT_MS = 10000;

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
    "const i=this.channels[t],r=Math.min(t,e.numberOfChannels-1);if(a<o){const t=i.subarray(a,o);e.copyTo(t,{planeIndex:r,frameCount:o-a})}else{const t=i.subarray(a),s=i.subarray(0,o);e.copyTo(t,{planeIndex:r,frameCount:t.length}),s.length&&e.copyTo(s,{planeIndex:r,frameOffset:t.length,frameCount:s.length})}}";
  const optimizedAudioRingWriteSnippetWorklet =
    'const i=this.channels[t],r=Math.min(t,e.numberOfChannels-1),h="string"==typeof e.format&&!e.format.endsWith("-planar");if(h){const t=a<o?o-a:this.capacity-a+o,u=new Float32Array(t*e.numberOfChannels);try{e.copyTo(u,{planeIndex:0,frameCount:t,format:"f32"})}catch{e.copyTo(u,{planeIndex:0,frameCount:t})}for(let o=0;o<t;o+=1)i[(a+o)%this.capacity]=u[o*e.numberOfChannels+r]}else if(a<o){const t=i.subarray(a,o);e.copyTo(t,{planeIndex:r,frameCount:o-a})}else{const t=i.subarray(a),s=i.subarray(0,o);e.copyTo(t,{planeIndex:r,frameCount:t.length}),s.length&&e.copyTo(s,{planeIndex:r,frameOffset:t.length,frameCount:s.length})}}';
  const audioRingWriteSnippetWorker =
    "const i=this.channels[e],r=Math.min(e,t.numberOfChannels-1);if(a<o){const e=i.subarray(a,o);t.copyTo(e,{planeIndex:r,frameCount:o-a})}else{const e=i.subarray(a),s=i.subarray(0,o);t.copyTo(e,{planeIndex:r,frameCount:e.length}),s.length&&t.copyTo(s,{planeIndex:r,frameOffset:e.length,frameCount:s.length})}}";
  const optimizedAudioRingWriteSnippetWorker =
    'const i=this.channels[e],r=Math.min(e,t.numberOfChannels-1),h="string"==typeof t.format&&!t.format.endsWith("-planar");if(h){const e=a<o?o-a:this.capacity-a+o,u=new Float32Array(e*t.numberOfChannels);try{t.copyTo(u,{planeIndex:0,frameCount:e,format:"f32"})}catch{t.copyTo(u,{planeIndex:0,frameCount:e})}for(let o=0;o<e;o+=1)i[(a+o)%this.capacity]=u[o*t.numberOfChannels+r]}else if(a<o){const e=i.subarray(a,o);t.copyTo(e,{planeIndex:r,frameCount:o-a})}else{const e=i.subarray(a),s=i.subarray(0,o);t.copyTo(e,{planeIndex:r,frameCount:e.length}),s.length&&t.copyTo(s,{planeIndex:r,frameOffset:e.length,frameCount:s.length})}e===this.channels.length-1&&t.close&&t.close()}';
  const audioConfigSnippet =
    "const s={};i&&r&&(s.audio={channels:r,sampleRate:i,ring:new v(2,i)},this.#P=new f(s.audio)),s.video={canvas:t.canvas},this.send({config:s},s.video.canvas)";
  const optimizedAudioConfigSnippet = `const s={},n=${audioCapabilityExpression};i&&r&&n&&(s.audio={channels:r,sampleRate:i,ring:new v(2,Math.max(Math.round(i*${AUDIO_RING_CAPACITY_MS}/1e3),Math.round(i*${AUDIO_PREBUFFER_MS}/1e3)+128)),prebufferFrames:Math.max(128,Math.round(i*${AUDIO_PREBUFFER_MS}/1e3))},this.#P=new f(s.audio)),s.video={canvas:t.canvas},this.send({config:s},s.video.canvas)`;
  const playerConstructorSnippet =
    'constructor(t,e,i,r){super(),this.#wt=t,this.#vt=e,this.#xt=new Map(e.tracks.map(t=>[t.name,t])),this.#Ut=i,this.#St=e.tracks.find(t=>a(t))?.name??"",this.#Et=e.tracks.find(t=>n(t))?.name??"",this.#Tt=!1,this.#Bt=!1,this.#bt=new x({canvas:r,catalog:e},this),';
  const optimizedPlayerConstructorSnippet = `constructor(t,e,i,r){super(),this.#wt=t,this.#vt=e,this.#xt=new Map(e.tracks.map(t=>[t.name,t])),this.#Ut=i;const o=${audioCapabilityExpression};this.#St=o?e.tracks.find(t=>a(t))?.name??"":"",this.#Et=e.tracks.find(t=>n(t))?.name??"",this.#Tt=!o,this.#Bt=!1,this.#bt=new x({canvas:r,catalog:e},this),`;
  const audioRendererClassSnippet =
    'class f{context;worklet;volumeNode;constructor(t){this.context=new AudioContext({latencyHint:"interactive",sampleRate:t.sampleRate}),this.volumeNode=this.context.createGain(),this.volumeNode.gain.value=1,this.worklet=this.load(t)}async load(t){await p(this.context);this.context.createGain().gain.value=2;const e=new AudioWorkletNode(this.context,"renderer");return e.port.addEventListener("message",this.on.bind(this)),e.onprocessorerror=t=>{console.error("Audio worklet error:",t)},e.connect(this.volumeNode),this.volumeNode.connect(this.context.destination),e.port.postMessage({config:t}),e}on(t){}';
  const optimizedAudioRendererClassSnippet =
    'class f{context;worklet;volumeNode;lastRenderStats;constructor(t){this.context=new AudioContext({latencyHint:"interactive",sampleRate:t.sampleRate}),this.volumeNode=this.context.createGain(),this.volumeNode.gain.value=1,this.lastRenderStats=null,this.worklet=this.load(t)}async load(t){await p(this.context);this.context.createGain().gain.value=2;const e=new AudioWorkletNode(this.context,"renderer",{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[t.channels],channelCount:t.channels,channelCountMode:"explicit",channelInterpretation:"speakers"});return e.port.addEventListener("message",this.on.bind(this)),e.port.start&&e.port.start(),e.onprocessorerror=t=>{console.error("Audio worklet error:",t)},e.connect(this.volumeNode),this.volumeNode.connect(this.context.destination),e.port.postMessage({config:t}),e}on(t){}';
  const audioControllerOnSnippet = "on(t){}";
  const optimizedAudioControllerOnSnippet =
    'on(t){const e=t?.data;if(!e)return;"render_stats"===e.type&&(this.lastRenderStats={at:Date.now(),...e.payload})}';
  const audioWorkletProcessorSnippet =
    'class i extends AudioWorkletProcessor{ring;base;constructor(){super(),this.base=0,this.port.onmessage=this.onMessage.bind(this)}onMessage(t){const e=t.data;e.config&&this.onConfig(e.config)}onConfig(t){this.ring=new e(t.ring)}process(t,e,i){if(!this.ring)return!0;if(1!=t.length&&1!=e.length)throw new Error("only a single track is supported");if(this.ring.size()==this.ring.capacity)return console.warn("resyncing ring buffer"),this.ring.clear(),!0;const r=e[0];return this.ring.read(r),r.length,!0}}';
  const optimizedAudioWorkletProcessorSnippet =
    'class i extends AudioWorkletProcessor{ring;base;prebufferFrames;rebufferFrames;buffering;started;statsCountdown;constructor(){super(),this.base=0,this.prebufferFrames=0,this.rebufferFrames=128,this.buffering=!1,this.started=!1,this.statsCountdown=0,this.port.onmessage=this.onMessage.bind(this)}onMessage(t){const e=t.data;e.config&&this.onConfig(e.config)}onConfig(t){this.ring=new e(t.ring),this.prebufferFrames=Math.max(0,Math.min(this.ring.capacity,Math.round(t.prebufferFrames??0))),this.rebufferFrames=Math.max(128,Math.min(this.ring.capacity,Math.round((t.prebufferFrames??0)/4)||128)),this.buffering=this.prebufferFrames>0,this.started=!1,this.statsCountdown=0}process(t,e,i){if(!this.ring)return!0;if(1!=t.length&&1!=e.length)throw new Error("only a single track is supported");if(this.ring.size()==this.ring.capacity)return this.ring.clear(),this.buffering=this.started,this.started=!1,!0;const r=e[0],s=r[0]?.length??0;for(const t of r)t.fill(0);const n=this.started?Math.max(this.rebufferFrames,s):Math.max(this.prebufferFrames,s);if(this.buffering&&this.ring.size()<n)return this.statsCountdown<=0&&(this.statsCountdown=120,this.port.postMessage({type:"render_stats",payload:{read:0,size:this.ring.size(),required:n,capacity:this.ring.capacity,started:this.started,buffering:this.buffering,level:0}})),this.statsCountdown-=1,!0;this.buffering=!1;const o=this.ring.read(r),a=this.ring.size();let h=0;if(o>0){for(const t of r)for(let e=0;e<o;e+=1){const i=t[e];h+=i*i}h=Math.sqrt(h/(o*Math.max(1,r.length)))}return this.statsCountdown<=0&&(this.statsCountdown=120,this.port.postMessage({type:"render_stats",payload:{read:o,size:a,required:s,capacity:this.ring.capacity,started:this.started,buffering:this.buffering,level:h}})),this.statsCountdown-=1,o>0&&(this.started=!0),o<s&&(this.buffering=!0),!0}}';
  const segmentQueueSnippet =
    'class t{audio;video;constructor(){this.audio=new e,this.video=new e}}class e{#t;#s;frames;#e;constructor(){this.frames=new ReadableStream({pull:this.#i.bind(this),cancel:this.#r.bind(this)}),this.#e=new TransformStream({},{highWaterMark:100})}get segments(){return this.#e.writable}async#i(t){for(;;){if(!this.#t&&this.#s){this.#t=this.#s,this.#s=void 0}const e=this.#e.readable.getReader();let i;if(this.#t){const t=this.#t.frames.getReader();i=await Promise.race([t.read(),e.read()]),t.releaseLock()}else i=await e.read();e.releaseLock();const{value:s,done:n}=i;if(n){if(this.#t){if(this.#t=void 0,this.#s){this.#t=this.#s,this.#s=void 0;continue}}else this.#s=void 0}else{if(!r(s))return void t.enqueue(s);if(this.#t){if(s.sequence<this.#t.sequence){await s.frames.cancel("skipping segment; too old");continue}if(this.#s){if(s.sequence<=this.#s.sequence){await s.frames.cancel("skipping segment; too old");continue}await this.#s.frames.cancel("skipping segment; superseded")}this.#s=s;continue}this.#t=s}}}async#r(t){this.#t&&await this.#t.frames.cancel(t),this.#s&&await this.#s.frames.cancel(t);const e=this.#e.readable.getReader();for(;;){const{value:i,done:r}=await e.read();if(r)break;await i.frames.cancel(t)}}}';
  const optimizedSegmentQueueSnippet =
    'class t{audio;video;constructor(){this.audio=new e,this.video=new e}}class e{#t;#s;frames;#e;constructor(){this.#s=[],this.frames=new ReadableStream({pull:this.#i.bind(this),cancel:this.#r.bind(this)}),this.#e=new TransformStream({},{highWaterMark:100})}get segments(){return this.#e.writable}async#n(t){const e=this.#s.at(-1);if(e&&t.sequence<=e.sequence){await t.frames.cancel(t.sequence===e.sequence?"skipping segment; superseded":"skipping segment; too old");return}this.#s.push(t)}async#i(t){for(;;){if(this.#t){const e=this.#t.frames.getReader(),{value:i,done:s}=await e.read();if(e.releaseLock(),s){this.#t=this.#s.shift();continue}t.enqueue(i);return}if(this.#s.length){this.#t=this.#s.shift();continue}const e=this.#e.readable.getReader(),{value:i,done:s}=await e.read();if(e.releaseLock(),s)return;if(!r(i)){t.enqueue(i);return}await this.#n(i)}}async#r(t){this.#t&&await this.#t.frames.cancel(t);for(const e of this.#s)await e.frames.cancel(t);this.#s.length=0;const e=this.#e.readable.getReader();for(;;){const{value:i,done:r}=await e.read();if(r)break;await i.frames.cancel(t)}}}';
  const segmentDispatchSnippet =
    "const[n,a]=s.stream.release();this.#bt.segment({init:t.initTrack,kind:e,header:s.header,buffer:n,stream:a})";
  const optimizedSegmentDispatchSnippet =
    "const[n,a]=s.stream.release();this.#bt.segment({init:t.initTrack,kind:e,header:s.header,buffer:n,stream:a})";
  const segmentHandlerSnippet =
    "else if(e.segment)this.#A(e.segment).catch(console.warn);";
  const optimizedSegmentHandlerSnippet =
    "else if(e.segment)this.#A(e.segment).catch(console.warn);";
  const segmentWriteSnippet =
    'const i=new c(await e.promise),r="audio"===t.kind?this.#h.audio:this.#h.video,s=new L(t.header,new v(t.stream,t.buffer)),n=new TransformStream({}),a=n.writable.getWriter(),o=r.segments.getWriter();for(await o.write({sequence:t.header.group_id,frames:n.readable}),o.releaseLock();;){const t=await s.read();if(!t)break;if(!(t.object_payload instanceof Uint8Array))throw new Error(`invalid payload: ${t.object_payload}`);const e=i.decode(t.object_payload);for(const t of e)await a.write(t)}await a.close()}';
  const optimizedSegmentWriteSnippet =
    `const i=new c(await e.promise),r="audio"===t.kind?this.#h.audio:this.#h.video,s=new L(t.header,new v(t.stream,t.buffer)),n=new TransformStream({}),a=n.writable.getWriter(),o="audio"===t.kind?${AUDIO_SEGMENT_READ_TIMEOUT_MS}:"video"===t.kind?${VIDEO_SEGMENT_READ_TIMEOUT_MS}:0,h=t.header.group_id,l={payloads:0,frames:0,reason:"eof"};r._writeTask=(r._writeTask??Promise.resolve()).catch(()=>{}).then(async()=>{const e=r.segments.getWriter();try{await e.write({sequence:h,frames:n.readable})}finally{e.releaseLock()}});await r._writeTask;try{for(;;){const t=o>0?await Promise.race([s.read(),new Promise(e=>setTimeout(()=>e("__timeout__"),o))]):await s.read();if("__timeout__"===t){l.reason="timeout";break}if(!t){l.reason="eof";break}if(!(t.object_payload instanceof Uint8Array)){if(void 0!==t.status){l.reason=\`status:\${t.status}\`;break}throw new Error(\`invalid payload: \${t.object_payload}\`)}l.payloads+=1;const e=i.decode(t.object_payload);l.frames+=e.length;for(const t of e)await a.write(t)}}finally{void s.close().catch(()=>{});await a.close()}}`;
  const audioDecodeChunkSnippet =
    'const e=new EncodedAudioChunk({type:t.sample.is_sync?"key":"delta",timestamp:t.sample.dts/t.track.timescale,duration:t.sample.duration,data:t.sample.data});this.#c.decode(e)';
  const optimizedAudioDecodeChunkSnippet =
    'const e=Math.round(1e6*t.sample.dts/t.track.timescale),i=Math.max(1,Math.round(1e6*t.sample.duration/t.track.timescale)),r=new EncodedAudioChunk({type:t.sample.is_sync?"key":"delta",timestamp:e,duration:i,data:t.sample.data});this.#c.decode(r)';
  const videoDecodeChunkSnippet =
    'const e=new EncodedVideoChunk({type:t.sample.is_sync?"key":"delta",data:t.sample.data,timestamp:t.sample.dts/t.track.timescale});(()=>{})(`[VideoWorker] Decoding chunk, type: ${e.type}, size: ${e.byteLength}`);try{this.#c.decode(e)}catch(t){console.error("[VideoWorker] FAILED to decode chunk:",t)}}}';
  const optimizedVideoDecodeChunkSnippet =
    'const e=Math.round(1e6*t.sample.dts/t.track.timescale),i=t.sample.duration?Math.max(1,Math.round(1e6*t.sample.duration/t.track.timescale)):void 0,r=new EncodedVideoChunk({type:t.sample.is_sync?"key":"delta",data:t.sample.data,timestamp:e,duration:i});(()=>{})(`[VideoWorker] Decoding chunk, type: ${r.type}, size: ${r.byteLength}`);try{this.#c.decode(r)}catch(t){console.error("[VideoWorker] FAILED to decode chunk:",t)}}}';
  const rendererVolumeSnippet =
    "setVolume(t){this.#P?.setVolume(t)}getVolume(){return this.#P?this.#P.getVolume():0}async close(){this.#z.terminate(),await(this.#P?.context.close())}";
  const optimizedRendererVolumeSnippet =
    'setVolume(t){this.#P?.setVolume(t)}getVolume(){return this.#P?this.#P.getVolume():0}getAudioContextState(){return this.#P?.context?.state??"none"}getAudioRenderStats(){return this.#P?.lastRenderStats??null}async close(){this.#z.terminate(),await(this.#P?.context.close())}';
  const playerMuteSnippet =
    'async mute(t){this.#Tt=t,t?((()=>{})("Unsubscribing from audio track: ",this.#St),await this.unsubscribeFromTrack(this.#St),await this.#bt.mute()):((()=>{})("Subscribing to audio track: ",this.#St),this.subscribeFromTrackName(this.#St),await this.#bt.unmute()),super.dispatchEvent(new CustomEvent("volumechange",{detail:{muted:t}}))}async unsubscribeFromTrack(t){';
  const optimizedPlayerMuteSnippet =
    'async mute(t){this.#Tt=t,t?((()=>{})("Unsubscribing from audio track: ",this.#St),await this.unsubscribeFromTrack(this.#St),await this.#bt.mute()):((()=>{})("Subscribing to audio track: ",this.#St),this.subscribeFromTrackName(this.#St),await this.#bt.unmute()),super.dispatchEvent(new CustomEvent("volumechange",{detail:{muted:t}}))}getAudioContextState(){return this.#bt.getAudioContextState?.()??"none"}getAudioRenderStats(){return this.#bt.getAudioRenderStats?.()??null}async resumeAudioContext(){await this.#bt.unmute()}async restartAudioTrack(){if(!this.#St)return;await this.unsubscribeFromTrack(this.#St),this.#Tt||(this.subscribeFromTrackName(this.#St),await this.#bt.unmute())}async unsubscribeFromTrack(t){';
  const audioRendererLevelSnippet =
    "setVolume(t){this.volumeNode.gain.setTargetAtTime(t,this.context.currentTime,.01)}getVolume(){return this.volumeNode.gain.value}}";
  const optimizedAudioRendererLevelSnippet =
    "setVolume(t){this.volumeNode.gain.setTargetAtTime(t,this.context.currentTime,.01)}getVolume(){return this.volumeNode.gain.value}}";
  const setVolumeSnippet =
    "async setVolume(t){this.#bt.setVolume(t),0!=t||this.#Tt?t>0&&this.#Tt&&await this.mute(!1):await this.mute(!0)}";
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
        [audioRendererClassSnippet, optimizedAudioRendererClassSnippet],
        [audioControllerOnSnippet, optimizedAudioControllerOnSnippet],
        [audioWorkletProcessorSnippet, optimizedAudioWorkletProcessorSnippet],
        [segmentQueueSnippet, optimizedSegmentQueueSnippet],
        [segmentDispatchSnippet, optimizedSegmentDispatchSnippet],
        [segmentHandlerSnippet, optimizedSegmentHandlerSnippet],
        [segmentWriteSnippet, optimizedSegmentWriteSnippet],
        [audioDecodeChunkSnippet, optimizedAudioDecodeChunkSnippet],
        [videoDecodeChunkSnippet, optimizedVideoDecodeChunkSnippet],
        [rendererVolumeSnippet, optimizedRendererVolumeSnippet],
        [playerMuteSnippet, optimizedPlayerMuteSnippet],
        [audioRendererLevelSnippet, optimizedAudioRendererLevelSnippet],
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
