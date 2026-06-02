const TEST_WATCH_CHANNELS = {
  "test:landscape": {
    id: "test:landscape",
    sessionKey: "test-watch-landscape",
    label: "横屏测试频道",
    title: "横屏测试视频",
    hostDisplayName: "本地测试源",
    statusMessage: "播放中（本地测试视频）。",
    orientation: "landscape",
    width: 1280,
    height: 720,
  },
  "test:portrait": {
    id: "test:portrait",
    sessionKey: "test-watch-portrait",
    label: "竖屏测试频道",
    title: "竖屏测试视频",
    hostDisplayName: "本地测试源",
    statusMessage: "播放中（本地测试视频）。",
    orientation: "portrait",
    width: 720,
    height: 1280,
  },
};

export function getWatchTestChannel(value) {
  if (!import.meta.env.DEV) {
    return null;
  }

  const key = String(value ?? "").trim().toLowerCase();
  return TEST_WATCH_CHANNELS[key] ?? null;
}
