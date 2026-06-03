const APP_ERROR_MESSAGES = {
  "zh-CN": {
    auth_endpoint_failed: "暂时无法检查登录状态",
    avatar_delete_failed: "头像删除失败，请稍后再试",
    avatar_file_too_large: "头像文件不能超过 5MB",
    avatar_image_process_failed: "头像图片处理失败",
    avatar_image_unreadable: "头像图片无法读取",
    avatar_resize_unsupported: "浏览器不支持头像缩放",
    avatar_upload_failed: "头像上传失败，请稍后再试",
    broadcast_control_channel_unavailable: "直播间控制通道尚未连接",
    broadcast_control_check_cancelled: "直播间控制检查已取消",
    broadcast_control_check_timeout: "直播间控制检查超时",
    broadcast_control_connection_closed: "直播间控制连接已断开",
    broadcast_control_read_only: "当前账号已在另一客户端开播",
    cover_file_too_large: "封面文件不能超过 5MB",
    cover_upload_failed: "封面上传失败，请稍后再试",
    display_name_change_cooldown: "显示名 7 天内只能修改一次",
    display_name_taken: "显示名已被占用",
    empty_avatar_file: "头像文件为空",
    empty_cover_file: "封面文件为空",
    handle_change_cooldown: "自定义 Handle 30 天内只能修改一次",
    handle_taken: "Handle 已被占用",
    invalid_avatar_type: "仅支持 JPG、PNG、WebP、AVIF 格式",
    invalid_cover_type: "仅支持 JPG、PNG、WebP、AVIF 格式",
    invalid_display_name: "显示名不能为空，且长度需在 2-24 个字符之间",
    invalid_handle: "Handle 只能包含小写字母、数字、下划线，长度 6-24，不能为纯数字，且不能以下划线开头或结尾",
    invalid_profile_update: "没有可更新的账号信息",
    live_preview_unavailable: "未获取到直播预览",
    logout_failed: "退出登录失败，请稍后再试",
    media_devices_unavailable: "未检测到可用的摄像头或麦克风",
    microphone_unavailable: "未获取到可用的麦克风",
    missing_avatar_file: "缺少头像文件",
    missing_app_media_binding: "媒体服务暂时不可用",
    missing_cover_file: "缺少封面文件",
    moq_watch_load_failed: "播放器加载失败，请刷新页面重试",
    namespace_required: "Namespace 不能为空",
    profile_update_failed: "账号信息更新失败，请稍后再试",
    publish_blocked_room: ({ room } = {}) => `频道 ${room || ""} 禁止开播`,
    publish_connect_timeout: "连接 relay 超时",
    publish_source_not_camera: "当前直播源不是摄像头",
    publish_tracks_unavailable: "未获取到可推流的音视频轨",
    room_creation_failed: "直播间创建失败，请稍后再试",
    room_list_failed: "直播间列表加载失败",
    room_not_found: "直播间不存在",
    room_resolve_failed: "直播间解析失败，请稍后再试",
    screen_share_no_tracks: "未获取到可推流的屏幕共享轨道",
    screen_share_not_supported: "当前浏览器不支持屏幕共享",
    screen_share_unavailable: "未获取到可共享的屏幕画面",
    share_not_supported: "当前浏览器不支持系统分享",
    synthetic_audio_source_unsupported: "当前浏览器不支持基于帧生成的合成音频源",
    synthetic_canvas_context_unavailable: "无法创建 canvas 上下文",
    synthetic_video_track_unavailable: "无法创建合成视频轨",
    unauthorized: "请先登录",
    user_not_found: "用户不存在",
    video_track_unavailable: "无法获取新摄像头画面"
  },
  en: {
    auth_endpoint_failed: "Unable to check sign-in status.",
    avatar_delete_failed: "Avatar deletion failed. Try again later.",
    avatar_file_too_large: "Avatar file must be 5MB or smaller.",
    avatar_image_process_failed: "Avatar image processing failed.",
    avatar_image_unreadable: "Avatar image could not be read.",
    avatar_resize_unsupported: "This browser cannot resize avatars.",
    avatar_upload_failed: "Avatar upload failed. Try again later.",
    broadcast_control_channel_unavailable: "Live room control channel is not connected.",
    broadcast_control_check_cancelled: "Live room control check was cancelled.",
    broadcast_control_check_timeout: "Live room control check timed out.",
    broadcast_control_connection_closed: "Live room control connection closed.",
    broadcast_control_read_only: "This account is live from another client.",
    cover_file_too_large: "Cover file must be 5MB or smaller.",
    cover_upload_failed: "Cover upload failed. Try again later.",
    display_name_change_cooldown: "Display name can only be changed once every 7 days.",
    display_name_taken: "Display name is already taken.",
    empty_avatar_file: "Avatar file is empty.",
    empty_cover_file: "Cover file is empty.",
    handle_change_cooldown: "Custom handle can only be changed once every 30 days.",
    handle_taken: "Handle is already taken.",
    invalid_avatar_type: "Only JPG, PNG, WebP, and AVIF are supported.",
    invalid_cover_type: "Only JPG, PNG, WebP, and AVIF are supported.",
    invalid_display_name: "Display name is required and must be 2-24 characters.",
    invalid_handle: "Handle must be 6-24 lowercase letters, numbers, or underscores; not all numbers; and not start or end with an underscore.",
    invalid_profile_update: "No profile fields were provided.",
    live_preview_unavailable: "Live preview is unavailable.",
    logout_failed: "Sign out failed. Try again later.",
    media_devices_unavailable: "No available camera or microphone was detected.",
    microphone_unavailable: "No available microphone was found.",
    missing_avatar_file: "Missing avatar file.",
    missing_app_media_binding: "Media service is temporarily unavailable.",
    missing_cover_file: "Missing cover file.",
    moq_watch_load_failed: "Player failed to load. Refresh the page and try again.",
    namespace_required: "Namespace is required.",
    profile_update_failed: "Profile update failed. Try again later.",
    publish_blocked_room: ({ room } = {}) => `Channel ${room || ""} cannot go live.`,
    publish_connect_timeout: "Relay connection timed out.",
    publish_source_not_camera: "The current live source is not a camera.",
    publish_tracks_unavailable: "No publishable audio or video tracks were found.",
    room_creation_failed: "Live room creation failed. Try again later.",
    room_list_failed: "Live room list failed to load.",
    room_not_found: "Room not found.",
    room_resolve_failed: "Live room lookup failed. Try again later.",
    screen_share_no_tracks: "No publishable screen share tracks were found.",
    screen_share_not_supported: "This browser does not support screen sharing.",
    screen_share_unavailable: "No shareable screen source was selected.",
    share_not_supported: "This browser does not support system sharing.",
    synthetic_audio_source_unsupported: "This browser does not support frame-generated synthetic audio.",
    synthetic_canvas_context_unavailable: "Unable to create canvas context.",
    synthetic_video_track_unavailable: "Unable to create synthetic video track.",
    unauthorized: "Please sign in first.",
    user_not_found: "User not found.",
    video_track_unavailable: "Unable to get a new camera frame."
  }
};

function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase();
  if (value.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function createAppError(code, details = undefined) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

export function createApiError(payload = {}, fallbackCode, details = {}) {
  return createAppError(payload.code || fallbackCode, {
    ...details,
    serverMessage: payload.error || ""
  });
}

export function getAppErrorMessage(errorLike = {}, locale = undefined) {
  if (typeof errorLike === "string") {
    return errorLike;
  }

  const resolvedLocale = normalizeLocale(
    locale
      ?? (typeof document !== "undefined" ? document.documentElement.lang : "")
      ?? (typeof navigator !== "undefined" ? navigator.language : "")
  );
  const dictionary = APP_ERROR_MESSAGES[resolvedLocale] ?? APP_ERROR_MESSAGES.en;
  const code = typeof errorLike.code === "string" && errorLike.code
    ? errorLike.code
    : typeof errorLike.message === "string" && dictionary[errorLike.message]
      ? errorLike.message
      : "";
  const template = code ? dictionary[code] : null;

  if (typeof template === "function") {
    return template(errorLike.details);
  }
  if (typeof template === "string") {
    return template;
  }
  if (typeof errorLike.details?.serverMessage === "string" && errorLike.details.serverMessage) {
    return errorLike.details.serverMessage;
  }
  if (typeof errorLike.message === "string" && errorLike.message) {
    return errorLike.message;
  }
  return dictionary.unknown ?? "Unknown error";
}
