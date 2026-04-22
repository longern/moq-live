import { Connection, SubscribeRecv } from "../transport";
import { Status } from "../transport/objects";
import { SubgroupType } from "../transport/subgroup";
import { Segment } from "./segment";
import { Track } from "./track";
import { FrameTrackSource, isFrameTrackSource } from "./source";
import * as Catalog from "../media/catalog";

import { asError } from "../common/error";
import { isAudioTrackSettings, isVideoTrackSettings } from "../common/settings";
import { sleep } from "../transport/utils";

export interface BroadcastConfig {
  namespace: string[];
  connection: Connection;
  media?: MediaStream;
  sources?: FrameTrackSource[];

  audio?: AudioEncoderConfig;
  video?: VideoEncoderConfig;
}

export interface BroadcastConfigTrack {
  codec: string;
  bitrate: number;
}

export class Broadcast {
  #tracks = new Map<string, Track>();
  #trackKinds = new Map<string, "audio" | "video">();
  #isClosed = false;
  #pendingAsyncSubgroupCloses = new Set<{
    promise: Promise<void>;
    release: () => void;
  }>();

  static readonly MAX_PENDING_ASYNC_SUBGROUP_CLOSES = 2;
  static readonly SUBGROUP_WRITE_WARN_TIMEOUT_MS = 4_000;
  static readonly SUBGROUP_CLOSE_TIMEOUT_MS = 2_000;
  static readonly AUDIO_MAX_SEGMENT_BACKLOG = 2;
  static readonly VIDEO_MAX_SEGMENT_BACKLOG = 1;

  readonly config: BroadcastConfig;
  readonly catalog: Catalog.Root;
  readonly connection: Connection;
  readonly namespace: string[];

  #running: Promise<void>;

  constructor(config: BroadcastConfig) {
    this.connection = config.connection;
    this.config = config;
    this.namespace = config.namespace;

    const tracks: Catalog.Track[] = [];

    const mediaTracks = [
      ...(this.config.media?.getTracks() ?? []),
      ...(this.config.sources ?? []),
    ];
    for (const media of mediaTracks) {
      const track = new Track(media, config);
      this.#tracks.set(track.name, track);
      this.#trackKinds.set(track.name, media.kind);

      const settings = isFrameTrackSource(media)
        ? { ...media.settings }
        : media.getSettings();

      if (media.kind === "audio" && !isFrameTrackSource(media)) {
        const audioContext = new AudioContext();
        audioContext.createMediaStreamSource(new MediaStream([media]));
        const sampleRate = audioContext.sampleRate;
        Object.assign(settings, {
          sampleRate,
        });
        audioContext.close();
      }

      console.log("track settings", settings, media, mediaTracks);

      if (isVideoTrackSettings(settings)) {
        if (!config.video) {
          throw new Error("no video configuration provided");
        }

        const video: Catalog.VideoTrack = {
          namespace: this.namespace,
          name: `${track.name}.m4s`,
          initTrack: `${track.name}.mp4`,
          selectionParams: {
            mimeType: "video/mp4",
            codec: config.video.codec,
            width: settings.width,
            height: settings.height,
            framerate: settings.frameRate,
            bitrate: config.video.bitrate,
          },
        };

        tracks.push(video);
      } else if (isAudioTrackSettings(settings)) {
        if (!config.audio) {
          throw new Error("no audio configuration provided");
        }

        const audio: Catalog.AudioTrack = {
          namespace: this.namespace,
          name: `${track.name}.m4s`,
          initTrack: `${track.name}.mp4`,
          selectionParams: {
            mimeType: "audio/mp4",
            codec: config.audio.codec,
            samplerate: settings.sampleRate,
            //sampleSize: settings.sampleSize,
            channelConfig: `${settings.channelCount}`,
            bitrate: config.audio.bitrate,
          },
        };

        tracks.push(audio);
      } else {
        throw new Error(`unknown track type: ${media.kind}`);
      }
    }

    this.catalog = {
      version: 1,
      streamingFormat: 1,
      streamingFormatVersion: "0.2",
      supportsDeltaUpdates: false,
      commonTrackFields: {
        packaging: "cmaf",
        renderGroup: 1,
      },
      tracks,
    };

    this.#running = this.#run();
  }

  async #run() {
    console.log("[Broadcast] #run loop started");
    await this.connection.publish_namespace(this.namespace);

    for (;;) {
      const subscriber = await this.connection.subscribed();
      if (!subscriber) break;

      // Run an async task to serve each subscription.
      this.#serveSubscribe(subscriber).catch((e) => {
        const err = asError(e);
        console.warn("failed to serve subscribe", err);
      });
    }
  }

  async #serveSubscribe(subscriber: SubscribeRecv) {
    try {
      const [base, ext] = splitExt(subscriber.track);
      console.log(
        "serving subscribe",
        subscriber.track,
        subscriber.namespace,
        base,
        ext,
      );
      if (ext === "catalog") {
        await this.#serveCatalog(subscriber, base);
      } else if (ext === "mp4") {
        await this.#serveInit(subscriber, base);
      } else if (ext === "m4s") {
        await this.#serveTrack(subscriber, base);
      } else {
        throw new Error(`unknown subscription: ${subscriber.track}`);
      }
    } catch (e) {
      console.error("failed to serve subscribe", e);
      const err = asError(e);
      // TODO(itzmanish): should check if the error is not found and send appropriate error code
      await subscriber.close({
        code: 0n,
        reason: `failed to process subscribe: ${err.message}`,
      });
    } finally {
      // TODO we can't close subscribers because there's no support for clean termination
      // await subscriber.close()
    }
  }

  async #serveCatalog(subscriber: SubscribeRecv, name: string) {
    // We only support ".catalog"
    if (name !== "") throw new Error(`unknown catalog: ${name}`);

    const bytes = Catalog.encode(this.catalog);

    await subscriber.ack();
    await sleep(500);

    const stream = await subscriber.subgroup({ group: 0, subgroup: 0 });
    await stream.write({ object_id: 0, object_payload: bytes });
    await stream.close();
  }

  async #serveInit(subscriber: SubscribeRecv, name: string) {
    const track = this.#tracks.get(name);
    if (!track) throw new Error(`no track with name ${subscriber.track}`);

    await subscriber.ack();
    await sleep(500);

    const init = await track.init();

    const stream = await subscriber.subgroup({ group: 0, subgroup: 0 });
    await stream.write({ object_id: 0, object_payload: init });
    await stream.close();
  }

  async #serveTrack(subscriber: SubscribeRecv, name: string) {
    const track = this.#tracks.get(name);
    if (!track) throw new Error(`no track with name ${subscriber.track}`);
    const kind = this.#trackKinds.get(name);
    if (!kind) throw new Error(`no track kind for ${subscriber.track}`);

    // Send a SUBSCRIBE_OK
    await subscriber.ack();

    // NOTE(itzmanish): hack to make sure subscribe ok reaches before the segement object
    await sleep(500);

    const segments = track.segments().getReader();
    try {
      for (;;) {
        const { value: segment, done } = await segments.read();
        if (done) break;

        const latestSegmentId = track.latestSegmentId();
        const maxBacklog = kind === "audio"
          ? Broadcast.AUDIO_MAX_SEGMENT_BACKLOG
          : Broadcast.VIDEO_MAX_SEGMENT_BACKLOG;
        if (
          latestSegmentId !== undefined &&
          latestSegmentId - segment.id > maxBacklog
        ) {
          continue;
        }

        // Keep subgroup creation serialized per subscribed track.
        // Unbounded parallel segment sends can exhaust the relay's stream budget,
        // leaving viewers stuck in the "connecting" state while send-stream creation fails.
        await this.#serveSegment(subscriber, segment, kind);
      }
    } finally {
      await segments.cancel("subscription ended").catch(() => {});
      segments.releaseLock();
    }
  }

  async #closeSubgroup(
    stream: {
      close(): Promise<void>;
      abort?(reason?: unknown): Promise<unknown>;
    },
    allowBoundedWait: boolean,
  ) {
    const closePromise = stream.close().catch(() => {});

    if (Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS > 0) {
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => resolve(), Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS);
      });

      if (!allowBoundedWait) {
        const completedInTime = await Promise.race([
          closePromise.then(() => true),
          timeoutPromise.then(() => false),
        ]);
        if (!completedInTime) {
          this.#logPublisherEvent("warn", "[Broadcast] subgroup close timeout", {
            timeoutMs: Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS,
          });
          await stream.abort?.(
            new Error("[Broadcast] subgroup close timeout"),
          ).catch(() => {});
          this.#logPublisherEvent("warn", "[Broadcast] subgroup close reclaimed", {
            timeoutMs: Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS,
          });
        }
        return;
      }
    }

    if (!allowBoundedWait) {
      await closePromise;
      return;
    }

    let released = false;
    let resolvePending!: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    const pendingEntry = {
      promise: pendingPromise,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#pendingAsyncSubgroupCloses.delete(pendingEntry);
        resolvePending();
      },
    };

    this.#pendingAsyncSubgroupCloses.add(pendingEntry);
    void closePromise.finally(() => {
      pendingEntry.release();
    });

    if (Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS > 0) {
      setTimeout(() => {
        if (released) {
          return;
        }
        this.#logPublisherEvent("warn", "[Broadcast] subgroup close timeout", {
          timeoutMs: Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS,
          pendingCloses: this.#pendingAsyncSubgroupCloses.size,
        });
        void stream.abort?.(
          new Error("[Broadcast] subgroup close timeout"),
        ).catch(() => {});
        pendingEntry.release();
        this.#logPublisherEvent("warn", "[Broadcast] subgroup close reclaimed", {
          timeoutMs: Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS,
          pendingCloses: this.#pendingAsyncSubgroupCloses.size,
        });
      }, Broadcast.SUBGROUP_CLOSE_TIMEOUT_MS);
    }

    while (
      this.#pendingAsyncSubgroupCloses.size >
      Broadcast.MAX_PENDING_ASYNC_SUBGROUP_CLOSES
    ) {
      await Promise.race(
        Array.from(this.#pendingAsyncSubgroupCloses, (entry) => entry.promise),
      );
    }
  }

  #logPublisherEvent(
    level: "log" | "warn" | "error",
    message: string,
    details?: Record<string, unknown>,
  ) {
    const logger = (
      globalThis as typeof globalThis & {
        __MOQ_PUBLISHER_LOG__?: (payload: {
          level?: "log" | "warn" | "error";
          message?: string;
          details?: Record<string, unknown>;
        }) => void;
      }
    ).__MOQ_PUBLISHER_LOG__;
    if (logger) {
      logger({ level, message, details });
      return;
    }
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    method(message, details);
  }

  async #writeSubgroupObject(
    stream: {
      write(chunk: {
        object_id: number;
        object_payload: Uint8Array;
      }): Promise<unknown>;
      abort?(reason?: unknown): Promise<unknown>;
    },
    chunk: { object_id: number; object_payload: Uint8Array },
    context: { track: "audio" | "video"; segmentId: number },
  ): Promise<boolean> {
    const startedAt = Date.now();
    const writePromise = stream.write(chunk);
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (Broadcast.SUBGROUP_WRITE_WARN_TIMEOUT_MS <= 0) {
        await writePromise;
        return true;
      }

      const result = await Promise.race([
        writePromise,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => {
            const details = {
              track: context.track,
              segmentId: context.segmentId,
              objectId: chunk.object_id,
              payloadBytes: chunk.object_payload.byteLength,
              timeoutMs: Broadcast.SUBGROUP_WRITE_WARN_TIMEOUT_MS,
              elapsedMs: Date.now() - startedAt,
            };
            const logger = (
              globalThis as typeof globalThis & {
                __MOQ_PUBLISHER_LOG__?: (payload: {
                  level?: "log" | "warn" | "error";
                  message?: string;
                  details?: Record<string, unknown>;
                }) => void;
              }
            ).__MOQ_PUBLISHER_LOG__;
            if (logger) {
              logger({
                level: "warn",
                message: "[Broadcast] subgroup write timeout",
                details,
              });
            } else {
              console.warn("[Broadcast] subgroup write timeout", details);
            }
            resolve(false);
          }, Broadcast.SUBGROUP_WRITE_WARN_TIMEOUT_MS);
        }),
      ]);
      return result !== false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async #serveSegment(
    subscriber: SubscribeRecv,
    segment: Segment,
    kind: "audio" | "video",
  ) {
    // Create a new stream for each segment.
    const stream = await subscriber.subgroup({
      group: segment.id,
      subgroup: 0, // @todo: figure out the right way to do this
      priority: 127, // TODO,default to mid value, see: https://github.com/moq-wg/moq-transport/issues/504
      endOfGroup: true,
    });

    let object = 0;
    let skipSubgroup = false;

    // Pipe the segment to the stream.
    const chunks = segment.chunks().getReader();
    try {
      for (;;) {
        const { value, done } = await chunks.read();
        if (done) break;

        const wrote = await this.#writeSubgroupObject(
          stream,
          {
            object_id: object,
            object_payload: value,
          },
          {
            track: kind,
            segmentId: segment.id,
          },
        );

        if (!wrote) {
          skipSubgroup = true;
          break;
        }

        object += 1;
      }

      if (!skipSubgroup) {
        await this.#closeSubgroup(stream, true);
      } else {
        if (typeof stream.abort === "function") {
          await stream.abort(
            new Error(
              `[Broadcast] subgroup aborted after stalled write: track=${kind} segment=${segment.id}`,
            ),
          ).catch(() => {});
        } else {
          void this.#closeSubgroup(stream, true);
        }
      }
    } finally {
      await chunks.cancel("segment send ended").catch(() => {});
      chunks.releaseLock();
    }
  }

  // Attach the captured video stream to the given video element.
  attach(video: HTMLVideoElement) {
    video.srcObject = this.config.media ?? null;
  }

  close() {
    if (this.#isClosed) return;
    this.#isClosed = true;
    this.config.media?.getTracks().forEach((track) => track.stop());
    this.connection.close();
  }

  // Returns the error message when the connection is closed
  async closed(): Promise<Error> {
    try {
      await this.#running;
      return new Error("closed"); // clean termination
    } catch (e) {
      return asError(e);
    }
  }
}

function splitExt(s: string): [string, string] {
  const i = s.lastIndexOf(".");
  if (i < 0) throw new Error(`no extension found`);
  return [s.substring(0, i), s.substring(i + 1)];
}
