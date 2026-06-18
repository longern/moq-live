import { useEffect, useRef, useState } from "react";

function copyStyleSheetsToPictureInPicture(pipWindow) {
  const pipHead = pipWindow.document.head;
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    pipHead.appendChild(node.cloneNode(true));
  });
}

export function useWatchPictureInPicture({
  onCloseMoreSheet,
  playerRef,
  stageRef,
}) {
  const [elementPipSupported, setElementPipSupported] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);
  const [videoPipSupported, setVideoPipSupported] = useState(false);
  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);
  const pipPlaceholderRef = useRef(null);
  const pipWindowRef = useRef(null);
  const pipVideoRef = useRef(null);
  const pipVideoStreamRef = useRef(null);

  function restoreElementPictureInPicture() {
    const pipWindow = pipWindowRef.current;
    const placeholder = pipPlaceholderRef.current;
    const stageEl = stageRef?.current;

    if (placeholder?.parentNode && stageEl) {
      placeholder.parentNode.insertBefore(stageEl, placeholder);
      placeholder.remove();
    }

    pipPlaceholderRef.current = null;
    pipWindowRef.current = null;
    setPipWindow(null);
    setPictureInPictureActive(false);

    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
  }

  function handleElementPictureInPictureClosed() {
    const placeholder = pipPlaceholderRef.current;
    const stageEl = stageRef?.current;

    if (placeholder?.parentNode && stageEl) {
      placeholder.parentNode.insertBefore(stageEl, placeholder);
      placeholder.remove();
    }

    pipPlaceholderRef.current = null;
    pipWindowRef.current = null;
    setPipWindow(null);
    setPictureInPictureActive(false);
  }

  function cleanupVideoPictureInPicture() {
    const pipVideo = pipVideoRef.current;
    const pipVideoStream = pipVideoStreamRef.current;

    if (pipVideoStream) {
      pipVideoStream.getTracks().forEach((track) => track.stop());
    }

    if (pipVideo) {
      pipVideo.pause();
      pipVideo.removeAttribute("src");
      pipVideo.srcObject = null;
      pipVideo.remove();
    }

    pipVideoRef.current = null;
    pipVideoStreamRef.current = null;
    setPictureInPictureActive(false);
  }

  async function restoreVideoPictureInPicture() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.error("video picture-in-picture restore failed", error);
    }

    cleanupVideoPictureInPicture();
  }

  function createCanvasPictureInPictureVideo(canvasEl) {
    if (typeof canvasEl.captureStream !== "function") {
      return null;
    }

    const stream = canvasEl.captureStream(30);
    const pipVideo = document.createElement("video");
    pipVideo.autoplay = true;
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    pipVideo.srcObject = stream;
    pipVideo.style.position = "fixed";
    pipVideo.style.left = "0";
    pipVideo.style.bottom = "0";
    pipVideo.style.width = "1px";
    pipVideo.style.height = "1px";
    pipVideo.style.opacity = "0";
    pipVideo.style.pointerEvents = "none";
    document.body.appendChild(pipVideo);
    pipVideoRef.current = pipVideo;
    pipVideoStreamRef.current = stream;
    return pipVideo;
  }

  function getVideoPictureInPictureElement() {
    const playerEl = playerRef?.current;

    if (typeof HTMLVideoElement !== "undefined" && playerEl instanceof HTMLVideoElement) {
      return playerEl;
    }

    if (typeof HTMLCanvasElement !== "undefined" && playerEl instanceof HTMLCanvasElement) {
      return createCanvasPictureInPictureVideo(playerEl);
    }

    return null;
  }

  async function openVideoPictureInPicture() {
    if (
      !document.pictureInPictureEnabled ||
      typeof HTMLVideoElement === "undefined" ||
      typeof HTMLVideoElement.prototype.requestPictureInPicture !== "function"
    ) {
      return false;
    }

    try {
      const pipVideo = getVideoPictureInPictureElement();
      if (!pipVideo) {
        return false;
      }
      await pipVideo.play();
      pipVideo.addEventListener("leavepictureinpicture", cleanupVideoPictureInPicture, { once: true });
      await pipVideo.requestPictureInPicture();
      setPictureInPictureActive(true);
      return true;
    } catch (error) {
      console.error("video picture-in-picture failed", error);
      cleanupVideoPictureInPicture();
      return false;
    }
  }

  async function openElementPictureInPicture() {
    const stageEl = stageRef?.current;
    const requestWindow = window.documentPictureInPicture?.requestWindow;

    if (!stageEl || typeof requestWindow !== "function") {
      return false;
    }

    try {
      const rect = stageEl.getBoundingClientRect();
      const pipWindow = await requestWindow.call(window.documentPictureInPicture, {
        width: Math.round(Math.min(Math.max(rect.width || 360, 320), 720)),
        height: Math.round(Math.min(Math.max(rect.height || 240, 240), 540)),
      });
      const placeholder = document.createComment("watch-stage-picture-in-picture-placeholder");
      stageEl.parentNode?.insertBefore(placeholder, stageEl);

      pipWindowRef.current = pipWindow;
      pipPlaceholderRef.current = placeholder;

      copyStyleSheetsToPictureInPicture(pipWindow);
      pipWindow.document.body.className = "watch-element-pip-body";
      pipWindow.document.body.appendChild(stageEl);
      pipWindow.addEventListener("pagehide", handleElementPictureInPictureClosed, { once: true });
      setPipWindow(pipWindow);
      setPictureInPictureActive(true);
      return true;
    } catch (error) {
      console.error("element picture-in-picture failed", error);
      restoreElementPictureInPicture();
      return false;
    }
  }

  async function openPictureInPicture() {
    if (pictureInPictureActive) {
      restoreElementPictureInPicture();
      await restoreVideoPictureInPicture();
      onCloseMoreSheet?.();
      return;
    }

    try {
      const openedElementPip = await openElementPictureInPicture();
      if (!openedElementPip) {
        await openVideoPictureInPicture();
      }
    } finally {
      onCloseMoreSheet?.();
    }
  }

  useEffect(() => {
    setElementPipSupported(
      typeof window.documentPictureInPicture?.requestWindow === "function"
    );
    setVideoPipSupported(
      Boolean(
        document.pictureInPictureEnabled &&
        typeof HTMLVideoElement !== "undefined" &&
        typeof HTMLVideoElement.prototype.requestPictureInPicture === "function"
      )
    );
  }, []);

  useEffect(() => () => {
    restoreElementPictureInPicture();
    void restoreVideoPictureInPicture();
  }, []);

  return {
    elementPipSupported,
    openPictureInPicture,
    pipWindow,
    pictureInPictureActive,
    videoPipSupported,
  };
}
