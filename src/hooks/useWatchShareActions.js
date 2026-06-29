import { useEffect, useRef, useState } from "react";
import { buildShareImageFileName } from "../lib/shareDownload.js";
import { buildLiveScreenshotShareImage, buildWatchShareImage } from "../lib/shareImage.js";
import { useImageShareActions } from "./useImageShareActions.js";

const IMAGE_SHARE_EXIT_MS = 180;

async function writeClipboardText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function useWatchShareActions({
  hostAvatarUrl,
  hostDisplayName,
  onCloseMoreSheet,
  playerRef,
  roomCoverUrl,
  roomLabel,
  roomTitle,
  siteIconUrl,
  siteTitle,
  showToast,
  watchLink,
}) {
  const [imageShareMounted, setImageShareMounted] = useState(false);
  const [imageShareClosing, setImageShareClosing] = useState(false);
  const [shareImageKind, setShareImageKind] = useState("poster");
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareImageLoading, setShareImageLoading] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const imageCloseTimerRef = useRef(null);
  const shareButtonRef = useRef(null);
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const imageShareReady = Boolean(shareImageUrl && !shareImageLoading);

  function openShareMenu() {
    setShareMenuOpen(true);
  }

  function closeShareMenu() {
    setShareMenuOpen(false);
  }

  async function copyWatchLink() {
    if (!watchLink) {
      closeShareMenu();
      return;
    }
    const copied = await writeClipboardText(watchLink);
    if (copied) {
      showToast("复制成功");
    }
    closeShareMenu();
  }

  async function shareWatchLink() {
    if (!watchLink || !shareSupported) {
      closeShareMenu();
      return;
    }
    try {
      await navigator.share({
        title: roomTitle || roomLabel,
        text: `${hostDisplayName || roomLabel}的直播间`,
        url: watchLink
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("watch room share failed", error);
      }
    } finally {
      closeShareMenu();
    }
  }

  function getShareImageFileName() {
    return buildShareImageFileName({
      subject: `${hostDisplayName || roomLabel || "主播"}的直播间`,
      suffix: shareImageKind === "screenshot" ? "截屏分享图" : "分享图",
    });
  }

  const {
    copyImage: copyWatchImage,
    saveImage: saveWatchImage,
    shareImage: shareWatchImage,
  } = useImageShareActions({
    getFileName: getShareImageFileName,
    getShareText: () => `${hostDisplayName || roomLabel}的直播间`,
    getShareTitle: () => roomTitle || roomLabel,
    logLabel: "watch room share image",
    onFallbackShare: shareWatchLink,
    shareImageUrl,
  });

  function closeImageShareModal() {
    if (imageCloseTimerRef.current) {
      clearTimeout(imageCloseTimerRef.current);
    }
    setImageShareClosing(true);
    imageCloseTimerRef.current = window.setTimeout(() => {
      setImageShareMounted(false);
      setImageShareClosing(false);
      imageCloseTimerRef.current = null;
    }, IMAGE_SHARE_EXIT_MS);
  }

  async function openImageShareModal() {
    if (!watchLink) {
      closeShareMenu();
      onCloseMoreSheet?.();
      return;
    }

    closeShareMenu();
    onCloseMoreSheet?.();
    if (imageCloseTimerRef.current) {
      clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
    }
    setImageShareMounted(true);
    setImageShareClosing(false);
    setShareImageKind("poster");
    setShareImageUrl("");
    setShareImageLoading(true);

    try {
      const imageUrl = await buildWatchShareImage({
        watchLink,
        roomLabel,
        roomTitle,
        hostDisplayName,
        hostAvatarUrl,
        roomCoverUrl,
        siteIconUrl,
        siteTitle,
      });
      setShareImageUrl(imageUrl);
    } catch (error) {
      console.error("watch room share image failed", error);
      setImageShareMounted(false);
      showToast("生成失败");
    } finally {
      setShareImageLoading(false);
    }
  }

  async function openScreenshotShareModal() {
    if (!watchLink) {
      closeShareMenu();
      onCloseMoreSheet?.();
      return;
    }

    closeShareMenu();
    onCloseMoreSheet?.();
    if (imageCloseTimerRef.current) {
      clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
    }
    setImageShareMounted(true);
    setImageShareClosing(false);
    setShareImageKind("screenshot");
    setShareImageUrl("");
    setShareImageLoading(true);

    try {
      const imageUrl = await buildLiveScreenshotShareImage({
        watchLink,
        videoElement: playerRef?.current,
        hostAvatarUrl,
        siteIconUrl,
        siteTitle,
        delayMs: 0,
      });
      setShareImageUrl(imageUrl);
    } catch (error) {
      console.error("watch room screenshot share image failed", error);
      setImageShareMounted(false);
      showToast("生成失败");
    } finally {
      setShareImageLoading(false);
    }
  }

  useEffect(() => () => {
    if (imageCloseTimerRef.current) {
      clearTimeout(imageCloseTimerRef.current);
    }
  }, []);

  return {
    closeImageShareModal,
    closeShareMenu,
    copyWatchImage,
    copyWatchLink,
    imageShareClosing,
    imageShareMounted,
    imageShareReady,
    openImageShareModal,
    openScreenshotShareModal,
    openShareMenu,
    saveWatchImage,
    shareButtonRef,
    shareImageLoading,
    shareImageKind,
    shareImageUrl,
    shareMenuOpen,
    shareSupported,
    shareWatchImage,
    shareWatchLink,
  };
}
