import { Segment } from "./segment"
import { Notify } from "../common/async"
import { Chunk } from "./chunk"
import { Container } from "./container"
import { BroadcastConfig } from "./broadcast"
import { FrameTrackSource, isFrameTrackSource } from "./source"

import * as Audio from "./audio"
import * as Video from "./video"

const AUDIO_SEGMENT_DURATION_US = 200_000

export class Track {
	name: string

	#init?: Uint8Array
	#segments: Segment[] = []
	#isAudioTrack = false
	#segmentStartTimestamp = 0

	#offset = 0 // number of segments removed from the front of the queue
	#closed = false
	#error?: Error
	#notify = new Notify()

	constructor(media: MediaStreamTrack | FrameTrackSource, config: BroadcastConfig) {
		this.name = media.name ?? media.kind
		this.#isAudioTrack = media.kind === "audio"

		// We need to split based on type because Typescript is hard
		if (isFrameTrackSource(media)) {
			if (media.kind === "audio") {
				if (!config.audio) throw new Error("no audio config")
				this.#runAudioFrames(media.readable, config.audio).catch((err) => this.#close(err))
			} else if (media.kind === "video") {
				if (!config.video) throw new Error("no video config")
				this.#runVideoFrames(media.readable, config.video).catch((err) => this.#close(err))
			} else {
				throw new Error(`unknown track type: ${media.kind}`)
			}
		} else if (isAudioTrack(media)) {
			if (!config.audio) throw new Error("no audio config")
			this.#runAudio(media, config.audio).catch((err) => this.#close(err))
		} else if (isVideoTrack(media)) {
			if (!config.video) throw new Error("no video config")
			this.#runVideo(media, config.video).catch((err) => this.#close(err))
		} else {
			throw new Error(`unknown track type: ${media.kind}`)
		}
	}

	async #runAudio(track: MediaStreamAudioTrack, config: AudioEncoderConfig) {
		const source = new MediaStreamTrackProcessor({ track })
		return this.#runAudioFrames(source.readable, config)
	}

	async #runAudioFrames(source: ReadableStream<AudioData>, config: AudioEncoderConfig) {
		const encoder = new Audio.Encoder(config)
		const container = new Container()

		// Split the container at keyframe boundaries
		const segments = new WritableStream({
			write: (chunk) => this.#write(chunk),
			close: () => this.#close(),
			abort: (e) => this.#close(e),
		})

		return source
			.pipeThrough(encoder.frames)
			.pipeThrough(container.encode)
			.pipeTo(segments)
			.catch((err) => {
				console.error("Audio pipeline error:", err)
				throw err
			})
	}

	async #runVideo(track: MediaStreamVideoTrack, config: VideoEncoderConfig) {
		const source = new MediaStreamTrackProcessor({ track })
		return this.#runVideoFrames(source.readable, config)
	}

	async #runVideoFrames(source: ReadableStream<VideoFrame>, config: VideoEncoderConfig) {
		const encoder = new Video.Encoder(config)
		const container = new Container()

		// Split the container at keyframe boundaries
		const segments = new WritableStream({
			write: (chunk) => this.#write(chunk),
			close: () => this.#close(),
			abort: (e) => this.#close(e),
		})

		return source.pipeThrough(encoder.frames).pipeThrough(container.encode).pipeTo(segments)
	}

	async #write(chunk: Chunk) {
		if (chunk.type === "init") {
			this.#init = chunk.data
			this.#notify.wake()
			return
		}

		let current = this.#segments.at(-1)
		const shouldStartAudioSegment = this.#isAudioTrack && (
			!current ||
			chunk.timestamp - this.#segmentStartTimestamp >= AUDIO_SEGMENT_DURATION_US
		)
		const shouldStartVideoSegment = !this.#isAudioTrack && chunk.type === "key"
		if (!current || shouldStartAudioSegment || shouldStartVideoSegment) {
			if (current) {
				await current.input.close()
			}

			const segment = new Segment(this.#offset + this.#segments.length)
			this.#segments.push(segment)
			this.#segmentStartTimestamp = chunk.timestamp

			this.#notify.wake()

			current = segment

			// Clear old segments
			while (this.#segments.length > 1) {
				const first = this.#segments[0]

				// Expire after 10s
				if (chunk.timestamp - first.timestamp < 10_000_000) break
				this.#segments.shift()
				this.#offset += 1

				await first.input.abort("expired")
			}
		}

		const writer = current.input.getWriter()

		if ((writer.desiredSize || 0) > 0) {
			await writer.write(chunk)
		} else {
			console.warn("dropping chunk", writer.desiredSize)
		}

		writer.releaseLock()
	}

	async #close(e?: Error) {
		this.#error = e

		const current = this.#segments.at(-1)
		if (current) {
			await current.input.close()
		}

		this.#closed = true
		this.#notify.wake()
	}

	async init(): Promise<Uint8Array> {
		while (!this.#init) {
			if (this.#closed) throw new Error("track closed")
			await this.#notify.wait()
		}

		return this.#init
	}

	// TODO generize this
	segments(): ReadableStream<Segment> {
		let pos = this.#offset

		return new ReadableStream({
			pull: async (controller) => {
				for (; ;) {
					let index = pos - this.#offset
					if (index < 0) index = 0

					if (index < this.#segments.length) {
						controller.enqueue(this.#segments[index])
						pos += 1
						return // Called again when more data is requested
					}

					if (this.#error) {
						controller.error(this.#error)
						return
					} else if (this.#closed) {
						controller.close()
						return
					}

					// Pull again on wakeup
					// NOTE: We can't return until we enqueue at least one segment.
					await this.#notify.wait()
				}
			},
		})
	}
}

function isAudioTrack(track: MediaStreamTrack): track is MediaStreamAudioTrack {
	return track.kind === "audio"
}

function isVideoTrack(track: MediaStreamTrack): track is MediaStreamVideoTrack {
	return track.kind === "video"
}
