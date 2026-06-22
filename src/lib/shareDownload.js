function getShortDownloadToken() {
  const timePart = Date.now().toString(36).slice(-4);
  const randomPart = Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
  return `${timePart}${randomPart}`;
}

function getSafeFileNameBase(value, fallback = "直播间") {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim() || fallback;
}

export function buildShareImageFileName({ subject, suffix = "分享图" }) {
  const safeSubject = getSafeFileNameBase(subject);
  const safeSuffix = getSafeFileNameBase(suffix, "分享图");
  return `${safeSubject}-${safeSuffix}-${getShortDownloadToken()}.png`;
}

export function downloadUrl(url, fileName) {
  if (!url) {
    return false;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export async function getUrlBlob(url) {
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return response.blob();
}

export async function sharePngUrl({
  url,
  fileName,
  title,
  text,
  fallback,
}) {
  const blob = await getUrlBlob(url);
  if (!blob) {
    return false;
  }

  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title,
      text,
    });
    return true;
  }

  await fallback?.();
  return true;
}

export async function copyPngUrl(url) {
  if (!url || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  const blob = await getUrlBlob(url);
  if (!blob) {
    return false;
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ]);
  return true;
}
