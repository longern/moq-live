const PLAYER_BADGES = {
  idle: { label: "未开播", state: "idle" },
  connecting: { label: "连接中", state: "warm" },
  live: { label: "直播中", state: "live" },
  buffering: { label: "缓冲中", state: "warm" },
  paused: { label: "已暂停", state: "idle" },
  offair: { label: "未推流", state: "idle" },
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

export const RETAINED_PLAYER_LAYOUT_STATES = new Set(["ended", "error", "left", "offair"]);

export function describePlayerState(kind = "idle", t = null) {
  const badge = PLAYER_BADGES[kind] || PLAYER_BADGES.idle;
  return {
    ...badge,
    label: t?.(`status.player.${kind}`) || badge.label,
  };
}

export function describePublishState(kind = "idle", t = null) {
  const badge = PUBLISH_BADGES[kind] || PUBLISH_BADGES.idle;
  return {
    ...badge,
    label: t?.(`status.publish.${kind}`) || badge.label,
  };
}
