const PLAYER_BADGES = {
  idle: { label: "待收看", state: "idle" },
  connecting: { label: "连接中", state: "warm" },
  live: { label: "正在收看", state: "live" },
  buffering: { label: "连接中", state: "warm" },
  offair: { label: "未开播", state: "idle" },
  ended: { label: "已下播", state: "idle" },
  left: { label: "已离开", state: "idle" },
  error: { label: "收看异常", state: "error" },
};

const PUBLISH_BADGES = {
  idle: { label: "未开播", state: "idle" },
  preparing: { label: "准备中", state: "warm" },
  live: { label: "直播中", state: "live" },
  error: { label: "开播异常", state: "error" },
};

export function describePlayerState(kind = "idle") {
  return PLAYER_BADGES[kind] || PLAYER_BADGES.idle;
}

export function describePublishState(kind = "idle") {
  return PUBLISH_BADGES[kind] || PUBLISH_BADGES.idle;
}
