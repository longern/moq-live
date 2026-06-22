import { copyPngUrl, downloadUrl, sharePngUrl } from "../lib/shareDownload.js";
import { useToast } from "../components/primitives/FloatingToast.jsx";

export function useImageShareActions({
  getFileName,
  getShareText,
  getShareTitle,
  onFallbackShare,
  shareImageUrl,
  logLabel = "share image",
}) {
  const { showToast } = useToast();

  async function shareImage() {
    if (!shareImageUrl) {
      return;
    }

    try {
      await sharePngUrl({
        url: shareImageUrl,
        fileName: getFileName(),
        title: getShareTitle?.(),
        text: getShareText?.(),
        fallback: onFallbackShare,
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error(`${logLabel} failed`, error);
        showToast?.("分享失败");
      }
    }
  }

  async function copyImage() {
    try {
      const copied = await copyPngUrl(shareImageUrl);
      showToast?.(copied ? "复制成功" : "复制失败");
    } catch (error) {
      console.error(`${logLabel} copy failed`, error);
      showToast?.("复制失败");
    }
  }

  function saveImage() {
    if (downloadUrl(shareImageUrl, getFileName())) {
      showToast?.("保存成功");
    }
  }

  return {
    copyImage,
    saveImage,
    shareImage,
  };
}
