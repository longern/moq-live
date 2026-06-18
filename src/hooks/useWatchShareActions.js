import { useEffect, useRef, useState } from "react";
import { buildWatchShareImage } from "../lib/shareImage.js";

const IMAGE_SHARE_EXIT_MS = 180;
const SHARE_MENU_EXIT_MS = 180;

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
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareImageLoading, setShareImageLoading] = useState(false);
  const [shareMenuMounted, setShareMenuMounted] = useState(false);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState({ left: 0, top: 0 });
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const imageCloseTimerRef = useRef(null);
  const shareButtonRef = useRef(null);
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const imageShareReady = Boolean(shareImageUrl && !shareImageLoading);

  function clearShareTimers() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }

  function positionShareMenu() {
    const button = shareButtonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const panelWidth = 248;
    const panelHeight = 150;
    const gap = 8;
    const margin = 12;
    const left = Math.min(
      Math.max(rect.right - panelWidth, margin),
      window.innerWidth - panelWidth - margin
    );
    let top = rect.bottom + gap;
    if (top + panelHeight > window.innerHeight - margin) {
      top = rect.top - panelHeight - gap;
    }
    setShareMenuPosition({
      left,
      top: Math.max(margin, top)
    });
  }

  function openShareMenu() {
    clearShareTimers();
    positionShareMenu();
    setShareMenuMounted(true);
    setShareMenuVisible(false);
    openFrameRef.current = requestAnimationFrame(() => {
      positionShareMenu();
      setShareMenuVisible(true);
      openFrameRef.current = null;
    });
  }

  function closeShareMenu() {
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setShareMenuVisible(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setShareMenuMounted(false);
      closeTimerRef.current = null;
    }, SHARE_MENU_EXIT_MS);
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

  async function getShareImageBlob() {
    if (!shareImageUrl) {
      return null;
    }

    const response = await fetch(shareImageUrl);
    return response.blob();
  }

  function getShareImageFileName() {
    const name = (roomTitle || roomLabel || "直播间")
      .replace(/[\\/:*?"<>|]+/g, "")
      .trim();
    return `${name || "直播间"}分享图.png`;
  }

  async function shareWatchImage() {
    if (!shareImageUrl) {
      return;
    }

    try {
      const blob = await getShareImageBlob();
      if (!blob) {
        return;
      }
      const file = new File([blob], getShareImageFileName(), { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: roomTitle || roomLabel,
          text: `${hostDisplayName || roomLabel}的直播间`,
        });
        return;
      }
      await shareWatchLink();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("watch room share image failed", error);
        showToast("分享失败");
      }
    }
  }

  async function copyWatchImage() {
    if (!shareImageUrl || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      showToast("复制失败");
      return;
    }

    try {
      const blob = await getShareImageBlob();
      if (!blob) {
        showToast("复制失败");
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      showToast("复制成功");
    } catch (error) {
      console.error("watch room share image copy failed", error);
      showToast("复制失败");
    }
  }

  function saveWatchImage() {
    if (!shareImageUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = shareImageUrl;
    link.download = getShareImageFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

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

  useEffect(() => {
    if (!shareMenuMounted) {
      return undefined;
    }

    function updatePosition() {
      positionShareMenu();
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [shareMenuMounted]);

  useEffect(() => () => {
    clearShareTimers();
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
    openShareMenu,
    saveWatchImage,
    shareButtonRef,
    shareImageLoading,
    shareImageUrl,
    shareMenuMounted,
    shareMenuPosition,
    shareMenuVisible,
    shareSupported,
    shareWatchImage,
    shareWatchLink,
  };
}
