import { useEffect, useState } from "react";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";
import {
  FOLLOWS_PANEL_TYPES,
  readRouteSettingsPanelType,
  writeSettingsPanelRoute,
} from "../lib/settingsRouteState.js";

const FOLLOWS_PAGE_SIZE = 20;

function createEmptyFollowsState() {
  return {
    items: [],
    nextCursor: "",
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: "",
  };
}

export function useSettingsFollowsPanel({
  authPending,
  authUser,
  hidden,
  isMobilePanelViewport,
  onOpenFollowUserRoom,
  onRefreshAuth,
  openLoginPanel,
  routePanelType,
  setRoutePanelType,
  settingsPanelRoutePushedRef,
}) {
  const [followsPanelType, setFollowsPanelType] = useState(null);
  const [renderedFollowsPanelType, setRenderedFollowsPanelType] = useState(null);
  const [followsState, setFollowsState] = useState(() => ({
    following: createEmptyFollowsState(),
    followers: createEmptyFollowsState(),
  }));
  const [pendingUnfollowUser, setPendingUnfollowUser] = useState(null);
  const [unfollowBusy, setUnfollowBusy] = useState(false);
  const [unfollowError, setUnfollowError] = useState("");
  const [profileFollowingAdjustment, setProfileFollowingAdjustment] = useState(0);
  const followsPanelOpen = Boolean(followsPanelType);
  const visibleFollowsPanelType = followsPanelType || renderedFollowsPanelType;
  const activeFollowsState = visibleFollowsPanelType ? followsState[visibleFollowsPanelType] : createEmptyFollowsState();

  function resetFollowsState() {
    setFollowsPanelType(null);
    setRenderedFollowsPanelType(null);
    setFollowsState({
      following: createEmptyFollowsState(),
      followers: createEmptyFollowsState(),
    });
    setPendingUnfollowUser(null);
    setUnfollowBusy(false);
    setUnfollowError("");
    setProfileFollowingAdjustment(0);
  }

  async function loadFollows(type, { reset = false } = {}) {
    if (!authUser?.id || !type) {
      return;
    }

    const currentState = followsState[type] ?? createEmptyFollowsState();
    if (currentState.loading || currentState.loadingMore) {
      return;
    }
    if (!reset && !currentState.hasMore && currentState.items.length) {
      return;
    }

    setFollowsState((current) => ({
      ...current,
      [type]: {
        ...(current[type] ?? createEmptyFollowsState()),
        error: "",
        loading: reset,
        loadingMore: !reset,
      }
    }));

    try {
      const cursor = reset ? "" : currentState.nextCursor;
      const params = new URLSearchParams({
        type,
        limit: String(FOLLOWS_PAGE_SIZE),
      });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(`/api/me/follows?${params.toString()}`, {
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw createApiError(payload, "follows_list_failed", { status: response.status });
      }

      setFollowsState((current) => {
        const previousItems = reset ? [] : (current[type]?.items ?? []);
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        return {
          ...current,
          [type]: {
            items: previousItems.concat(nextItems),
            nextCursor: payload.nextCursor || "",
            hasMore: Boolean(payload.hasMore),
            loading: false,
            loadingMore: false,
            error: "",
          }
        };
      });
    } catch (error) {
      setFollowsState((current) => ({
        ...current,
        [type]: {
          ...(current[type] ?? createEmptyFollowsState()),
          loading: false,
          loadingMore: false,
          error: getAppErrorMessage(error),
        }
      }));
    }
  }

  function openFollowsPanel(type, { updateRoute = isMobilePanelViewport } = {}) {
    if (authPending) {
      return;
    }

    if (!authUser) {
      openLoginPanel();
      return;
    }

    if (updateRoute && isMobilePanelViewport) {
      writeSettingsPanelRoute(type, { historyMode: "push" });
      settingsPanelRoutePushedRef.current = type;
      setRoutePanelType(type);
    }

    setFollowsPanelType(type);
    setRenderedFollowsPanelType(type);
    const currentState = followsState[type] ?? createEmptyFollowsState();
    if (!currentState.items.length && !currentState.loading) {
      void loadFollows(type, { reset: true });
    }
  }

  function closeFollowsPanel({ updateRoute = true } = {}) {
    setPendingUnfollowUser(null);
    setFollowsPanelType(null);

    if (!updateRoute || !isMobilePanelViewport || !FOLLOWS_PANEL_TYPES.has(readRouteSettingsPanelType())) {
      return;
    }

    if (settingsPanelRoutePushedRef.current === followsPanelType) {
      settingsPanelRoutePushedRef.current = null;
      history.back();
      return;
    }

    writeSettingsPanelRoute(null, { historyMode: "replace" });
    setRoutePanelType(null);
  }

  function openFollowUserRoom(target) {
    const normalizedTarget = String(target || "").trim();
    if (!normalizedTarget) {
      return;
    }

    closeFollowsPanel({ updateRoute: false });
    setPendingUnfollowUser(null);
    onOpenFollowUserRoom?.(normalizedTarget);
  }

  function requestUnfollow(user) {
    if (!user?.id) {
      return;
    }

    setPendingUnfollowUser(user);
    setUnfollowError("");
  }

  function cancelUnfollow() {
    if (unfollowBusy) {
      return;
    }

    setPendingUnfollowUser(null);
    setUnfollowError("");
  }

  async function confirmUnfollow() {
    const targetUserId = pendingUnfollowUser?.id;
    if (!targetUserId || unfollowBusy) {
      return;
    }

    setUnfollowBusy(true);
    setUnfollowError("");

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(targetUserId)}/follow`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw createApiError(payload, "follow_update_failed", { status: response.status });
      }

      setFollowsState((current) => {
        const currentFollowing = current.following ?? createEmptyFollowsState();
        return {
          ...current,
          following: {
            ...currentFollowing,
            items: currentFollowing.items.filter((item) => item.user?.id !== targetUserId),
          }
        };
      });
      setProfileFollowingAdjustment((current) => current - 1);
      setPendingUnfollowUser(null);
      void onRefreshAuth?.();
    } catch (error) {
      setUnfollowError(getAppErrorMessage(error));
    } finally {
      setUnfollowBusy(false);
    }
  }

  useEffect(() => {
    resetFollowsState();
  }, [authUser?.id]);

  useEffect(() => {
    if (hidden || !isMobilePanelViewport) {
      return;
    }

    if (!FOLLOWS_PANEL_TYPES.has(routePanelType)) {
      if (followsPanelType) {
        setFollowsPanelType(null);
        setPendingUnfollowUser(null);
      }
      return;
    }

    if (authPending) {
      return;
    }

    if (!authUser) {
      setFollowsPanelType(null);
      setRenderedFollowsPanelType(null);
      return;
    }

    if (followsPanelType !== routePanelType) {
      setFollowsPanelType(routePanelType);
      setRenderedFollowsPanelType(routePanelType);

      const currentState = followsState[routePanelType] ?? createEmptyFollowsState();
      if (!currentState.items.length && !currentState.loading) {
        void loadFollows(routePanelType, { reset: true });
      }
    }
  }, [
    authPending,
    authUser,
    followsPanelType,
    followsState,
    hidden,
    isMobilePanelViewport,
    routePanelType,
  ]);

  return {
    activeFollowsState,
    cancelUnfollow,
    closeFollowsPanel,
    confirmUnfollow,
    followsPanelOpen,
    loadFollows,
    openFollowsPanel,
    openFollowUserRoom,
    pendingUnfollowUser,
    profileFollowingAdjustment,
    requestUnfollow,
    unfollowBusy,
    unfollowError,
    visibleFollowsPanelType,
  };
}
