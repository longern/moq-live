import { useEffect, useRef, useState } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LoginDrawer } from "./components/LoginDrawer.jsx";
import { UserAvatar } from "./components/UserAvatar.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";
import { useAuthController } from "./hooks/useAuthController.js";
import { useChatController } from "./hooks/useChatController.js";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { usePublisherController } from "./hooks/usePublisherController.js";
import { useRouteController } from "./hooks/useRouteController.js";
import { buildWatchLink, generateRoomId, getRelayHostValue, writeRoute } from "./lib/routeState.js";
import { clearWatchHistory, persistWatchHistoryEntry, readWatchHistory } from "./lib/watchHistory.js";
import { describePlayerState, describePublishState } from "./lib/status.js";
import { getPublishBlockReason, isPublishBlocked } from "./lib/roomPolicy.js";

const LivePage = lazy(() =>
  import("./components/LivePage.jsx").then((module) => ({ default: module.LivePage }))
);

function splitCameraOptions(cameraOptions) {
  const front = [];
  const rear = [];

  for (const option of cameraOptions) {
    const label = option.label.toLowerCase();
    if (/(back|rear|environment|world)/.test(label)) {
      rear.push(option);
      continue;
    }
    if (/(front|user|face|selfie)/.test(label)) {
      front.push(option);
      continue;
    }
    if (rear.length === 0) {
      front.push(option);
    } else {
      rear.push(option);
    }
  }

  return {
    front: front[0] ?? cameraOptions[0] ?? null,
    rear: rear[0] ?? cameraOptions.find((option) => option.value !== front[0]?.value) ?? null
  };
}

function getCameraMode(cameraOptions, selectedCameraId, cameraEnabled) {
  if (!cameraEnabled) {
    return "off";
  }

  const { front, rear } = splitCameraOptions(cameraOptions);
  if (rear && selectedCameraId === rear.value) {
    return "rear";
  }

  if (front) {
    return "front";
  }

  return cameraOptions.length ? "front" : "off";
}

function getAvatarLabel(authState) {
  if (!authState.user) {
    return "匿名";
  }

  return authState.user.displayName || authState.user.email || "用户";
}

function isNamespaceWatchTarget(value) {
  return value.trim().toLowerCase().startsWith("ns:");
}

function getNamespaceWatchValue(value) {
  if (!isNamespaceWatchTarget(value)) {
    return "";
  }

  return value.trim().slice(3).trim();
}

function getHandleWatchValue(value) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function LivePageFallback({ hidden }) {
  return (
    <section class="page" data-page="live" hidden={hidden}>
      <div class="page-grid live-layout">
        <section class="control-column" aria-busy="true">
          <div class="placeholder">
            <p>正在加载开播页。</p>
          </div>
        </section>
      </div>
    </section>
  );
}

export function App() {
  const siteTitle = __APP_TITLE__;
  const [logText, setLogText] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [settingsLoginPanelRequestKey, setSettingsLoginPanelRequestKey] = useState(0);
  const [watchHistoryItems, setWatchHistoryItems] = useState(() => readWatchHistory());
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [livePageMounted, setLivePageMounted] = useState(
    () => new URLSearchParams(window.location.search).get("p") === "l"
  );
  const [watchRouteCommitted, setWatchRouteCommitted] = useState(() => Boolean(new URLSearchParams(window.location.search).get("r")?.trim()));
  const logRef = useRef(null);
  const authMenuRef = useRef(null);
  const authMenuCloseTimerRef = useRef(null);
  const announcedLiveStateRef = useRef({ room: "", isLive: null });
  const handledWatchStreamStartRef = useRef({ roomId: "", startedAt: "" });
  const watchLiveSeenRef = useRef({ roomId: "", hasBeenLive: false });
  const pendingProtectedPageRef = useRef(null);
  const previousRouteRef = useRef({
    page: new URLSearchParams(window.location.search).get("p") === "l"
      ? "live"
      : new URLSearchParams(window.location.search).get("p") === "s"
        ? "settings"
        : "watch",
    watchRoom: new URLSearchParams(window.location.search).get("r")?.trim() ?? "",
    watchRouteCommitted: Boolean(new URLSearchParams(window.location.search).get("r")?.trim())
  });

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  const {
    initialAutorun,
    page,
    relayUrl,
    watchRoom,
    liveRoom,
    autorunRef,
    pageRef,
    relayUrlRef,
    watchRoomRef,
    liveRoomRef,
    setWatchRoomValue,
    setLiveRoomValue,
    setRelayUrlValue,
    selectPage
  } = useRouteController();

  const {
    authState,
    startMicrosoftLogin,
    logout,
    updateDisplayName,
    updateHandle,
    updateAvatar
  } = useAuthController({ log });

  const [watchRoomResolution, setWatchRoomResolution] = useState({
    loading: false,
    error: "",
    roomId: "",
    hostHandle: "",
    hostDisplayName: "",
    title: ""
  });
  const [liveChatRoomResolution, setLiveChatRoomResolution] = useState({
    loading: false,
    error: "",
    roomId: ""
  });
  const [watchStreamEnded, setWatchStreamEnded] = useState(false);

  const watchPlaybackRelayUrlRef = useRef("");
  const watchPlaybackNamespaceRef = useRef("");

  const normalizedWatchInput = watchRoom.trim();
  const watchingNamespace = isNamespaceWatchTarget(normalizedWatchInput);
  const directWatchNamespace = getNamespaceWatchValue(normalizedWatchInput);
  const watchHandle = watchingNamespace ? "" : getHandleWatchValue(normalizedWatchInput);
  const resolvedWatchRoomId = watchingNamespace ? "" : watchRoomResolution.roomId;
  const watchChatRoom = watchingNamespace ? directWatchNamespace : resolvedWatchRoomId;

  const publisher = usePublisherController({
    page,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    log
  });

  const player = usePlayerController({
    initialAutorun: false,
    relayUrlRef: watchPlaybackRelayUrlRef,
    roomRef: watchPlaybackNamespaceRef,
    setLogText,
    log,
    syntheticSessionRef: publisher.syntheticSessionRef
  });
  const watchChatEnabled = page === "watch" && Boolean(watchChatRoom) && !authState.loading;
  const liveChatEnabled = Boolean(authState.user?.id) && page === "live";
  const liveChatRoomId = authState.user?.id
    ? liveChatRoomResolution.roomId
    : "";

  const chat = useChatController({
    room: watchChatRoom,
    enabled: watchChatEnabled,
    authKey: authState.user?.id ?? "anonymous",
    role: "viewer",
    log
  });
  const liveChat = useChatController({
    room: liveChatRoomId,
    enabled: liveChatEnabled && Boolean(liveChatRoomId),
    authKey: authState.user?.id ?? "anonymous",
    role: "broadcaster",
    log
  });

  const resolvedWatchRelayUrl = watchingNamespace
    ? relayUrl
    : chat.roomMeta.stream.relayUrl || "";
  const resolvedWatchNamespace = watchingNamespace
    ? directWatchNamespace
    : chat.roomMeta.stream.namespace || "";
  const watchJoined = page === "watch" && watchRouteCommitted && Boolean(normalizedWatchInput);
  const watchStageMessage = watchingNamespace
    ? (directWatchNamespace ? "正在连接公共 namespace。" : "等待输入 namespace。")
    : watchRoomResolution.loading
      ? "正在进入直播间。"
      : watchRoomResolution.error
        ? `进入失败：${watchRoomResolution.error}`
        : resolvedWatchRoomId
          ? (watchStreamEnded ? "直播已结束" : "直播暂未开始")
          : "正在解析直播间。";

  watchPlaybackRelayUrlRef.current = resolvedWatchRelayUrl;
  watchPlaybackNamespaceRef.current = resolvedWatchNamespace;

  const watchRoomLabel = watchingNamespace
    ? (directWatchNamespace || "等待输入 namespace")
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || chat.roomMeta.title
      || watchRoomResolution.title
      || watchHandle
      || watchRoom
      || "等待输入主播号";
  const watchChatRoomLabel = watchingNamespace
    ? (directWatchNamespace || "")
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || watchHandle
      || "";
  const watchRoomTitle = watchingNamespace
    ? (directWatchNamespace || "公共 namespace")
    : chat.roomMeta.title
      || watchRoomResolution.title
      || (watchChatRoomLabel ? `${watchChatRoomLabel}的直播间` : watchRoomLabel);
  const watchHostDisplayName = watchingNamespace
    ? ""
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || watchHandle
      || "";
  const watchHostAvatarUrl = watchingNamespace ? "" : chat.roomMeta.host.avatarUrl || "";
  const liveRoomLabel = liveChat.roomMeta.host.displayName
    || authState.user?.displayName
    || authState.user?.email
    || liveRoom
    || "等待生成频道号";
  const watchShareTarget = watchingNamespace
    ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "")
    : watchRoomResolution.hostHandle || watchHandle || watchRoom;
  const liveShareTarget = authState.user?.handle?.trim() || (liveRoom ? `ns:${liveRoom}` : "");
  const watchPageLink = buildWatchLink(relayUrl, watchShareTarget);
  const liveWatchLink = buildWatchLink(relayUrl, liveShareTarget);
  const relayHost = getRelayHostValue(relayUrl);
  const playerBadge = describePlayerState(player.playerStatusKind);
  const publishBadge = describePublishState(publisher.publishStatusKind);
  const liveStreamActive = publisher.publisherIsPublishing || publisher.syntheticPublishing;
  const publishBlocked = isPublishBlocked(liveRoom);
  const publishBlockedReason = getPublishBlockReason(liveRoom);
  const cameraMode = getCameraMode(
    publisher.cameraOptions,
    publisher.selectedCameraId,
    publisher.cameraEnabled
  );
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const mobileWatchSessionActive = page === "watch" && Boolean(player.playerSession);
  const mobileWatchJoinedClass = mobileWatchSessionActive ? " app-container-watch-joined" : "";
  const requireLoginForLive = false;
  const avatarLabel = getAvatarLabel(authState);
  const avatarStateClass = authState.loading
    ? " is-loading"
    : authState.user
      ? " is-authenticated"
      : !authState.available
        ? " is-unavailable"
        : "";
  const avatarTitle = authState.loading
    ? "正在检查登录状态"
    : authState.user
      ? (authState.user.email || authState.user.displayName || "已登录")
      : !authState.available
        ? "Auth API 未连接"
        : "匿名用户";

  useEffect(() => {
    if (page === "live") {
      setLivePageMounted(true);
    }
  }, [page]);

  function openSettingsLogin(options) {
    setAuthMenuOpen(false);
    pendingProtectedPageRef.current = null;
    selectPage("settings", options);
    setSettingsLoginPanelRequestKey((current) => current + 1);
  }

  function returnToWatchHome() {
    pendingProtectedPageRef.current = null;
    autorunRef.current = false;
    setLoginPromptOpen(false);
    closeAuthMenu();
    setWatchRouteCommitted(false);
    setWatchRoomValue("");
    selectPage("watch", { updateAutorun: false });
    void player.stopPlayer();
  }

  function closeAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
      authMenuCloseTimerRef.current = null;
    }
    setAuthMenuOpen(false);
  }

  function openAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
      authMenuCloseTimerRef.current = null;
    }
    setAuthMenuOpen(true);
  }

  function scheduleCloseAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
    }
    authMenuCloseTimerRef.current = setTimeout(() => {
      authMenuCloseTimerRef.current = null;
      setAuthMenuOpen(false);
    }, 160);
  }

  function selectPageWithGuard(nextPage, options) {
    if (!requireLoginForLive || nextPage !== "live") {
      pendingProtectedPageRef.current = null;
      selectPage(nextPage, options);
      return;
    }

    if (authState.loading) {
      pendingProtectedPageRef.current = { nextPage, options };
      return;
    }

    if (!authState.user) {
      openSettingsLogin(options);
      return;
    }

    pendingProtectedPageRef.current = null;
    selectPage(nextPage, options);
  }

  function beginWatch(nextWatchTarget = watchRoom) {
    const normalizedTarget = nextWatchTarget.trim();
    if (!normalizedTarget) {
      return;
    }

    if (isNamespaceWatchTarget(normalizedTarget)) {
      if (!getNamespaceWatchValue(normalizedTarget)) {
        return;
      }
    } else if (!getHandleWatchValue(normalizedTarget)) {
      return;
    }

    if (nextWatchTarget !== watchRoom) {
      setWatchRoomValue(normalizedTarget);
    }

    autorunRef.current = true;
    setWatchRouteCommitted(true);
    selectPageWithGuard("watch", { updateAutorun: false });

    if (!isNamespaceWatchTarget(normalizedTarget)) {
      void player.stopPlayer();
    }
  }

  async function shareLiveRoom() {
    if (!liveWatchLink) {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      throw new Error("当前浏览器不支持系统分享");
    }

    try {
      await navigator.share({
        title: `${liveRoomLabel}的直播间`,
        text: `${liveRoomLabel}正在直播`,
        url: liveWatchLink
      });
      log("live room shared");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      throw error;
    }
  }

  function cycleCameraMode() {
    if (publisher.publisherIsPublishing) {
      publisher.setCameraEnabled(!publisher.cameraEnabled);
      return;
    }

    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    const currentMode = getCameraMode(
      publisher.cameraOptions,
      publisher.selectedCameraId,
      publisher.cameraEnabled
    );

    if (currentMode === "off") {
      const nextCamera = front ?? rear;
      if (nextCamera) {
        publisher.setSelectedCameraId(nextCamera.value);
        publisher.setCameraEnabled(true);
      }
      return;
    }

    if (currentMode === "front" && rear) {
      publisher.setSelectedCameraId(rear.value);
      publisher.setCameraEnabled(true);
      return;
    }

    publisher.setCameraEnabled(false);
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => () => {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (authState.user) {
      setLoginPromptOpen(false);
    }
  }, [authState.user]);

  useEffect(() => {
    const handlePopState = () => {
      const routeRoom = new URLSearchParams(window.location.search).get("r")?.trim() ?? "";
      setWatchRouteCommitted(Boolean(routeRoom));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const routeWatchRoom = page === "watch" && watchRouteCommitted ? watchRoom.trim() : "";
    const previousRoute = previousRouteRef.current;
    const historyMode = page === "watch"
      && watchRouteCommitted
      && Boolean(routeWatchRoom)
      && (
        previousRoute.page !== "watch"
        || !previousRoute.watchRouteCommitted
        || !previousRoute.watchRoom
      )
      ? "push"
      : "replace";

    writeRoute(
      {
        page,
        watchRoom: routeWatchRoom,
        liveRoom
      },
      { historyMode }
    );

    previousRouteRef.current = {
      page,
      watchRoom: routeWatchRoom,
      watchRouteCommitted
    };
  }, [liveRoom, page, watchRoom, watchRouteCommitted]);

  useEffect(() => {
    if (!initialAutorun) {
      return;
    }

    autorunRef.current = true;
    selectPage("watch", { updateAutorun: false });
  }, []);

  useEffect(() => {
    if (page !== "watch" || !watchRouteCommitted || watchingNamespace || !watchHandle) {
      setWatchRoomResolution({
        loading: false,
        error: "",
        roomId: "",
        hostHandle: "",
        hostDisplayName: "",
        title: ""
      });
      return;
    }

    let cancelled = false;

    async function resolveWatchRoom() {
      setWatchRoomResolution({
        loading: true,
        error: "",
        roomId: "",
        hostHandle: "",
        hostDisplayName: "",
        title: ""
      });

      try {
        const response = await fetch(`/api/rooms/resolve?handle=${encodeURIComponent(watchHandle)}`, {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `room resolve failed with ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setWatchRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || "",
          hostHandle: payload.room?.host?.handle || watchHandle,
          hostDisplayName: payload.room?.host?.displayName || "",
          title: payload.room?.title || ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setWatchRoomResolution({
          loading: false,
          error: message,
          roomId: "",
          hostHandle: "",
          hostDisplayName: "",
          title: ""
        });
        log(`watch resolve failed: ${message}`);
      }
    }

    void resolveWatchRoom();

    return () => {
      cancelled = true;
    };
  }, [page, watchHandle, watchRouteCommitted, watchingNamespace]);

  useEffect(() => {
    if (page !== "watch" || !watchRouteCommitted || watchingNamespace || !resolvedWatchRoomId) {
      watchLiveSeenRef.current = { roomId: "", hasBeenLive: false };
      setWatchStreamEnded(false);
      return;
    }

    watchLiveSeenRef.current = { roomId: resolvedWatchRoomId, hasBeenLive: false };
    setWatchStreamEnded(false);
  }, [page, resolvedWatchRoomId, watchRouteCommitted, watchingNamespace]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
    ) {
      return;
    }

    if (chat.streamState.isLive) {
      watchLiveSeenRef.current = {
        roomId: resolvedWatchRoomId,
        hasBeenLive: true
      };
      setWatchStreamEnded(false);
      return;
    }

    const current = watchLiveSeenRef.current;
    if (current.roomId === resolvedWatchRoomId && current.hasBeenLive) {
      setWatchStreamEnded(true);
    }
  }, [
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (page !== "live" || !authState.user?.id) {
      setLiveChatRoomResolution({
        loading: false,
        error: "",
        roomId: ""
      });
      return;
    }

    let cancelled = false;

    async function resolveLiveChatRoom() {
      setLiveChatRoomResolution({
        loading: true,
        error: "",
        roomId: ""
      });

      try {
        const response = await fetch("/api/me/room", {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `my room endpoint returned ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setLiveChatRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setLiveChatRoomResolution({
          loading: false,
          error: message,
          roomId: ""
        });
        log(`live room resolve failed: ${message}`);
      }
    }

    void resolveLiveChatRoom();

    return () => {
      cancelled = true;
    };
  }, [authState.user?.id, page]);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || !pendingProtectedPageRef.current) {
      return;
    }

    const pendingPage = pendingProtectedPageRef.current;
    pendingProtectedPageRef.current = null;
    selectPageWithGuard(pendingPage.nextPage, pendingPage.options);
  }, [authState.loading, authState.user, requireLoginForLive]);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || authState.user || page !== "live") {
      return;
    }

    openSettingsLogin({ updateAutorun: false });
  }, [authState.loading, authState.user, page, requireLoginForLive]);

  useEffect(() => {
    if (!player.playerSession) {
      return;
    }

    if (page === "watch" && watchRoom) {
      return;
    }

    void player.stopPlayer();
  }, [page, player.playerSession, watchRoom]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || !watchingNamespace
      || !directWatchNamespace
    ) {
      return;
    }

    if (
      !player.playerSession
      || player.playerSession.relayUrl !== resolvedWatchRelayUrl
      || player.playerSession.namespace !== resolvedWatchNamespace
    ) {
      void player.startPlayer();
    }
  }, [
    directWatchNamespace,
    page,
    player.playerSession,
    resolvedWatchNamespace,
    resolvedWatchRelayUrl,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
      || !chat.streamState.isLive
      || !chat.roomMeta.stream.relayUrl
      || !chat.roomMeta.stream.namespace
    ) {
      return;
    }

    if (
      !player.playerSession
      || player.playerSession.relayUrl !== chat.roomMeta.stream.relayUrl
      || player.playerSession.namespace !== chat.roomMeta.stream.namespace
    ) {
      void player.startPlayer();
    }
  }, [
    chat.roomMeta.stream.namespace,
    chat.roomMeta.stream.relayUrl,
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    player.playerSession,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.streamState.isLive
      || !chat.roomMeta.stream.relayUrl
      || !chat.roomMeta.stream.namespace
    ) {
      return;
    }

    const startedAt = chat.streamState.startedAt || "__live__";
    const current = handledWatchStreamStartRef.current;
    if (current.roomId === resolvedWatchRoomId && current.startedAt === startedAt) {
      return;
    }

    handledWatchStreamStartRef.current = {
      roomId: resolvedWatchRoomId,
      startedAt
    };
    void player.startPlayer();
  }, [
    chat.roomMeta.stream.namespace,
    chat.roomMeta.stream.relayUrl,
    chat.streamState.isLive,
    chat.streamState.startedAt,
    page,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
      || chat.streamState.isLive
      || !player.playerSession
    ) {
      return;
    }

    handledWatchStreamStartRef.current = { roomId: "", startedAt: "" };
    void player.stopPlayer({
      finalStatus: "直播已结束",
      finalKind: "ended",
      logMessage: "stopped player because stream ended",
    });
  }, [
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    player.playerSession,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (!liveRoom) {
      announcedLiveStateRef.current = { room: "", isLive: null };
      return;
    }

    if (liveChat.connectionState !== "connected") {
      return;
    }

    const current = announcedLiveStateRef.current;
    if (current.room === liveRoom && current.isLive === liveStreamActive) {
      return;
    }

    const sent = liveChat.sendEvent({
      type: liveStreamActive ? "stream.started" : "stream.stopped",
      stream: liveStreamActive
        ? { startedAt: new Date().toISOString() }
        : undefined
    });

    if (sent) {
      announcedLiveStateRef.current = {
        room: liveRoom,
        isLive: liveStreamActive
      };
    }
  }, [liveChat, liveChat.connectionState, liveRoom, liveStreamActive]);

  useEffect(() => {
    if (!liveRoom || liveChat.connectionState !== "connected") {
      return;
    }

    const nextStream = {
      relayUrl: relayUrl,
      namespace: liveRoom
    };
    const nextHost = {
      id: authState.user?.id || "",
      displayName: authState.user?.displayName || authState.user?.email || "",
      avatarUrl: authState.user?.avatarUrl || ""
    };
    if (
      liveChat.roomMeta.stream.relayUrl === nextStream.relayUrl
      && liveChat.roomMeta.stream.namespace === nextStream.namespace
      && liveChat.roomMeta.host.id === nextHost.id
      && liveChat.roomMeta.host.displayName === nextHost.displayName
      && liveChat.roomMeta.host.avatarUrl === nextHost.avatarUrl
    ) {
      return;
    }

    liveChat.sendEvent({
      type: "room.updated",
      roomMeta: {
        stream: nextStream,
        host: nextHost
      }
    });
  }, [
    authState.user?.avatarUrl,
    authState.user?.displayName,
    authState.user?.email,
    authState.user?.id,
    liveChat,
    liveChat.connectionState,
    liveChat.roomMeta.stream.namespace,
    liveChat.roomMeta.stream.relayUrl,
    liveChat.roomMeta.host.avatarUrl,
    liveChat.roomMeta.host.displayName,
    liveChat.roomMeta.host.id,
    relayUrl,
    liveRoom
  ]);

  useEffect(() => {
    window.__moqTest = {
      startPlayer: async () => {
        await player.startPlayer();
      },
      stopPlayer: async () => {
        await player.stopPlayer();
      },
      startSyntheticPublish: publisher.startSyntheticPublish,
      stopSyntheticPublish: publisher.stopSyntheticPublish,
      getState: () => ({
        playerStatus: player.playerStatus,
        publishStatus: publisher.publishStatus,
        namespace: pageRef.current === "live" ? liveRoomRef.current : watchRoomRef.current,
        watchNamespace: watchRoomRef.current,
        liveNamespace: liveRoomRef.current
      }),
      getSyntheticSignatures: publisher.getSyntheticSignatures,
      compareScreenshotSignature: async (dataUrl) => player.compareSyntheticPlaybackFromDataUrl(dataUrl)
    };

    return () => {
      delete window.__moqTest;
    };
  }, [player.playerStatus, publisher.publishStatus, watchRoom, liveRoom]);

  useEffect(() => {
    const watchTarget = watchRoom.trim();
    if (!player.playerSession?.namespace?.trim() || !watchTarget) {
      return;
    }

    setWatchHistoryItems(persistWatchHistoryEntry({
      room: watchTarget,
      relayUrl,
      relayHost
    }));
  }, [player.playerSession?.key, relayUrl, relayHost, watchRoom]);

  function openWatchHistoryItem(item) {
    setRelayUrlValue(item.relayUrl || relayUrl);
    beginWatch(item.room);
  }

  return (
    <>
      <div class={`app-container${mobileWatchJoinedClass}`}>
        <header class="topbar">
          <button
            type="button"
            class="brand brand-button"
            onClick={returnToWatchHome}
            aria-label={`返回${siteTitle}收看页`}
          >
            <span class="brand-title">{siteTitle}</span>
          </button>

          <div class="topbar-right">
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
            <div class="auth-toolbar">
              <div
                ref={authMenuRef}
                class="auth-menu-shell"
                onMouseEnter={openAuthMenu}
                onMouseLeave={scheduleCloseAuthMenu}
                onFocusIn={openAuthMenu}
                onFocusOut={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && authMenuRef.current?.contains(nextTarget)) {
                    return;
                  }
                  scheduleCloseAuthMenu();
                }}
              >
                <button
                  type="button"
                  class="auth-avatar-button"
                  aria-haspopup="menu"
                  aria-expanded={authMenuOpen ? "true" : "false"}
                  aria-label={authState.user ? `账户菜单：${avatarLabel}` : "账户菜单：匿名用户"}
                  title={avatarTitle}
                  onClick={() => {
                    setAuthMenuOpen((current) => !current);
                  }}
                >
                  <UserAvatar
                    avatarUrl={authState.user?.avatarUrl}
                    displayName={authState.user?.displayName}
                    email={authState.user?.email}
                    className={`auth-avatar${avatarStateClass}`}
                    imgAlt={authState.user?.displayName || "用户头像"}
                    imgWidth={40}
                    imgHeight={40}
                    loading={authState.loading}
                    loadingClassName="auth-avatar-spinner"
                    iconClassName="auth-avatar-icon"
                  />
                </button>

                <div class={`auth-menu-dropdown${authMenuOpen ? " is-open" : ""}`} role="menu" aria-label="账户">
                  {authState.user ? (
                    <>
                      <button
                        type="button"
                        class="auth-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeAuthMenu();
                          selectPage("settings", { updateAutorun: false });
                        }}
                      >
                        个人中心
                      </button>
                      <button
                        type="button"
                        class="auth-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeAuthMenu();
                          void logout();
                        }}
                      >
                        退出登录
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      class="auth-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeAuthMenu();
                        startMicrosoftLogin();
                      }}
                      disabled={authState.loading || !authState.available}
                      title={!authState.available ? "Auth API 未连接" : undefined}
                    >
                      立即登录
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main class="page-shell">
          <WatchPage
            hidden={page !== "watch"}
            watchJoined={watchJoined}
            roomLabel={watchRoomLabel}
            roomTitle={watchRoomTitle}
            hostDisplayName={watchHostDisplayName}
            hostAvatarUrl={watchHostAvatarUrl}
            watchLink={watchPageLink}
            stageMessage={watchStageMessage}
            chatRoom={watchChatRoom}
            chatRoomLabel={watchChatRoomLabel}
            playerStatus={player.playerStatus}
            playerBadge={playerBadge}
            fullscreenActive={player.fullscreenActive}
            playerPaused={player.playerPaused}
            playerMuted={player.playerMuted}
            showTapToUnmute={player.showTapToUnmute}
            playerOrientation={player.playerOrientation}
            room={watchRoom}
            onRoomInput={(event) => {
              setWatchRoomValue(event.currentTarget.value);
            }}
            onStart={() => {
              beginWatch();
            }}
            onOpenRoom={(nextRoom) => {
              beginWatch(nextRoom);
            }}
            onStop={() => {
              autorunRef.current = false;
              setWatchRouteCommitted(false);
              setWatchRoomValue("");
              selectPageWithGuard("watch", { updateAutorun: false });
              void player.stopPlayer();
            }}
            onTogglePlayback={() => {
              void player.togglePlayerPlayback().catch((error) => {
                log(`toggle playback failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onToggleMute={() => {
              void player.togglePlayerMute().catch((error) => {
                log(`toggle mute failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onDismissTapToUnmute={() => {
              void player.dismissTapToUnmute().catch((error) => {
                log(`tap to unmute failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onFullscreen={() => {
              void player.fullscreenPlayer().catch((error) => {
                log(`fullscreen failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            stageRef={player.watchStageRef}
            playerSession={player.playerSession}
            playerRef={player.playerRef}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            chatMessages={chat.messages}
            chatDraft={chat.draft}
            chatConnectionState={chat.connectionState}
            chatOnlineCount={chat.onlineCount}
            chatReadOnly={chat.readOnly}
            chatError={chat.chatError}
            onChatDraftChange={(event) => {
              chat.setDraft(event.currentTarget.value);
            }}
            onChatSend={() => {
              chat.sendMessage();
            }}
            onChatRequireLogin={() => {
              setLoginPromptOpen(true);
            }}
          />

          {livePageMounted ? (
            <Suspense fallback={<LivePageFallback hidden={page !== "live"} />}>
              <LivePage
                hidden={page !== "live"}
                room={liveRoom}
                roomLabel={liveRoomLabel}
                shareTarget={liveShareTarget}
                watchLink={liveWatchLink}
                publishBlocked={publishBlocked}
                publishBlockedReason={publishBlockedReason}
                publishStatus={publisher.publishStatus}
                publishBadge={publishBadge}
                cameraOptions={publisher.cameraOptions}
                microphoneOptions={publisher.microphoneOptions}
                selectedCameraId={publisher.selectedCameraId}
                selectedMicrophoneId={publisher.selectedMicrophoneId}
                cameraEnabled={publisher.cameraEnabled}
                microphoneEnabled={publisher.microphoneEnabled}
                cameraMode={cameraMode}
                isPublishing={publisher.publisherIsPublishing}
                previewActive={publisher.previewActive}
                previewHasVideo={publisher.previewHasVideo}
                syntheticPublishing={publisher.syntheticPublishing}
                previewVideoRef={publisher.previewVideoRef}
                onCameraChange={(event) => {
                  publisher.setSelectedCameraId(event.currentTarget.value);
                  publisher.setCameraEnabled(true);
                }}
                onMicrophoneChange={(event) => {
                  publisher.setSelectedMicrophoneId(event.currentTarget.value);
                  publisher.setMicrophoneEnabled(true);
                }}
                onCycleCamera={() => {
                  cycleCameraMode();
                }}
                onToggleMicrophone={() => {
                  publisher.setMicrophoneEnabled(!publisher.microphoneEnabled);
                }}
                onTogglePublish={() => {
                  if (publisher.publisherIsPublishing) {
                    void publisher.stopCameraPublish();
                    return;
                  }
                  void publisher.startCameraPublish().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log(`camera publish failed: ${message}`);
                  });
                }}
                onStartPublish={() => {
                  void publisher.startCameraPublish().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log(`camera publish failed: ${message}`);
                  });
                }}
                onStopPublish={() => {
                  void publisher.stopCameraPublish();
                }}
                onShare={() => {
                  void shareLiveRoom().catch((error) => {
                    log(`share failed: ${error instanceof Error ? error.message : String(error)}`);
                  });
                }}
                onStartSynthetic={() => {
                  selectPageWithGuard("live");
                  void publisher.startSyntheticPublish().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log(`synthetic publish failed: ${message}`);
                  });
                }}
                onStopSynthetic={() => {
                  selectPageWithGuard("live");
                  void publisher.stopSyntheticPublish();
                }}
                screenShareSupported={publisher.screenShareSupported}
                screenShareActive={publisher.screenShareActive}
                previewSourceType={publisher.previewSourceType}
                onStartScreenShare={() => {
                  void publisher.startScreenShare().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log(`screen share failed: ${message}`);
                  });
                }}
                onStopScreenShare={() => {
                  void publisher.stopScreenShare().catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    log(`screen share stop failed: ${message}`);
                  });
                }}
                chatMessages={liveChat.messages}
                chatDraft={liveChat.draft}
                chatConnectionState={liveChatEnabled ? liveChat.connectionState : "closed"}
                chatOnlineCount={liveChat.onlineCount}
                chatReadOnly={liveChat.readOnly}
                chatError={liveChatEnabled ? liveChat.chatError : ""}
                authAvailable={authState.available}
                authLoading={authState.loading}
                authUser={authState.user}
                onChatDraftChange={(event) => {
                  liveChat.setDraft(event.currentTarget.value);
                }}
                onChatSend={() => {
                  liveChat.sendMessage();
                }}
                onChatRequireLogin={() => {
                  setLoginPromptOpen(true);
                }}
              />
            </Suspense>
          ) : null}

          <SettingsPage
            hidden={page !== "settings"}
            relayUrl={relayUrl}
            relayHost={relayHost}
            buildLabel={buildLabel}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            onMicrosoftLogin={startMicrosoftLogin}
            onLogout={() => {
              void logout();
            }}
            onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
            onUpdateHandle={(handle) => updateHandle(handle)}
            onUpdateAvatar={(file) => updateAvatar(file)}
            onRelayUrlInput={(event) => {
              autorunRef.current = false;
              setRelayUrlValue(event.currentTarget.value);
            }}
            watchHistoryItems={watchHistoryItems}
            onOpenWatchHistoryItem={openWatchHistoryItem}
            onClearWatchHistory={() => {
              setWatchHistoryItems(clearWatchHistory());
            }}
            loginPanelRequestKey={settingsLoginPanelRequestKey}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      {mobileWatchSessionActive ? null : (
        <MobileNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
      )}
      {loginPromptOpen ? (
        <LoginDrawer
          authAvailable={authState.available}
          authLoading={authState.loading}
          onClose={() => {
            setLoginPromptOpen(false);
          }}
          onMicrosoftLogin={startMicrosoftLogin}
        />
      ) : null}
    </>
  );
}
