export interface BaseFrameTrackSource {
	name?: string
	kind: "audio" | "video"
	settings: MediaTrackSettings
}

export interface AudioFrameTrackSource extends BaseFrameTrackSource {
	kind: "audio"
	readable: ReadableStream<AudioData>
}

export interface VideoFrameTrackSource extends BaseFrameTrackSource {
	kind: "video"
	readable: ReadableStream<VideoFrame>
}

export type FrameTrackSource = AudioFrameTrackSource | VideoFrameTrackSource

export function isFrameTrackSource(source: MediaStreamTrack | FrameTrackSource): source is FrameTrackSource {
	return "readable" in source
}
