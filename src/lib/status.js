export function describePlayerState(message = "") {
  if (message.includes("播放中")) {
    return { label: "正在收看", state: "live" };
  }
  if (message.includes("缓冲") || message.includes("连接")) {
    return { label: "连接中", state: "warm" };
  }
  if (message.includes("失败")) {
    return { label: "收看异常", state: "error" };
  }
  if (message.includes("离开") || message.includes("停止")) {
    return { label: "已离开", state: "idle" };
  }
  return { label: "待收看", state: "idle" };
}

export function describePublishState(message = "") {
  if (message.includes("已启动")) {
    return { label: "直播中", state: "live" };
  }
  if (message.includes("正在启动") || message.includes("正在停止")) {
    return { label: "准备中", state: "warm" };
  }
  if (message.includes("失败")) {
    return { label: "开播异常", state: "error" };
  }
  return { label: "未开播", state: "idle" };
}
