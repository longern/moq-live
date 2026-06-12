import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Download, ScanQrCode } from "lucide-react";
import QRCode from "qrcode";

const SHARE_IMAGE_WIDTH = 960;
const SHARE_IMAGE_HEIGHT = 1280;
const SHARE_COVER_HEIGHT = 288;
const SHARE_CONTENT_X = 120;
const SHARE_CONTENT_WIDTH = SHARE_IMAGE_WIDTH - SHARE_CONTENT_X * 2;
const SHARE_TITLE_Y = 372;
const SHARE_TITLE_LINE_HEIGHT = 62;
const SHARE_TITLE_MAX_LINES = 2;
const SHARE_ASSUMED_TITLE_HEIGHT = SHARE_TITLE_LINE_HEIGHT * SHARE_TITLE_MAX_LINES;
const SHARE_SUBTITLE_LINE_HEIGHT = 40;
const SHARE_SUBTITLE_TO_QR_GAP = 34;
const SHARE_QR_TO_HINT_GAP = 72;
const SHARE_QR_CARD_X = 218;
const SHARE_QR_CARD_SIZE = 524;
const SHARE_QR_IMAGE_X = 260;
const SHARE_QR_IMAGE_SIZE = 440;
const SHARE_HINT_Y_MAX = 1120;
const SHARE_BRAND_Y = 1240;
const LIVE_SCREENSHOT_DELAY_MS = 2_000;

function loadImage(src, { crossOrigin = "" } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function loadOptionalImage(src) {
  if (!src) {
    return null;
  }

  try {
    return await loadImage(src, { crossOrigin: "anonymous" });
  } catch {
    return null;
  }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.lineTo(x + width - nextRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
  ctx.lineTo(x + width, y + height - nextRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - nextRadius, y + height);
  ctx.lineTo(x + nextRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
  ctx.lineTo(x, y + nextRadius);
  ctx.quadraticCurveTo(x, y, x + nextRadius, y);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = Array.from(text);
  const lines = [];
  let line = "";

  for (const char of chars) {
    const nextLine = `${line}${char}`;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) {
        break;
      }
      continue;
    }
    line = nextLine;
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  lines.forEach((lineText, index) => {
    const isLast = index === maxLines - 1 && chars.join("") !== lines.join("");
    const displayText = isLast && lineText.length > 1 ? `${lineText.slice(0, -1)}...` : lineText;
    ctx.fillText(displayText, x, y + index * lineHeight);
  });

  return lines.length * lineHeight;
}

function drawCircleImage(ctx, image, centerX, centerY, size) {
  const radius = size / 2;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (imageRatio > 1) {
    sourceWidth = image.naturalHeight;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (imageRatio < 1) {
    sourceHeight = image.naturalWidth;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    centerX - radius,
    centerY - radius,
    size,
    size
  );
  ctx.restore();
}

function drawRoundedImage(ctx, image, x, y, width, height, radius) {
  ctx.save();
  drawRoundRect(ctx, x, y, width, height, radius);
  ctx.clip();
  drawImageCover(ctx, image, x, y, width, height);
  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const targetRatio = width / height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (imageRatio < targetRatio) {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawCoverBanner(ctx, image, { x, y, width, height, radius = 0 }) {
  ctx.save();
  if (radius > 0) {
    drawRoundRect(ctx, x, y, width, height, radius);
    ctx.clip();
  }
  drawImageCover(ctx, image, x, y, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.66)";
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function truncateText(ctx, text, maxWidth) {
  if (!maxWidth || ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const chars = Array.from(text);
  let nextText = "";

  for (const char of chars) {
    const candidate = `${nextText}${char}`;
    if (ctx.measureText(`${candidate}...`).width > maxWidth) {
      break;
    }
    nextText = candidate;
  }

  return nextText ? `${nextText}...` : "";
}

function drawSiteBrand(ctx, {
  siteTitle,
  siteIcon,
  centerX = SHARE_IMAGE_WIDTH / 2,
  x,
  y = 178,
  font = "500 32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color = "#5f6f7f",
  iconSize = 32,
  iconGap = 10,
  iconRadius = 8,
  iconPadding = 5,
  maxWidth = 0,
}) {
  const title = siteTitle || "MoQ Live";
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const actualIconSize = siteIcon ? iconSize : 0;
  const actualGap = siteIcon ? iconGap : 0;
  const maxTextWidth = maxWidth
    ? Math.max(0, maxWidth - actualIconSize - actualGap)
    : 0;
  const displayTitle = truncateText(ctx, title, maxTextWidth);
  const textWidth = ctx.measureText(displayTitle).width;
  const startX = typeof x === "number"
    ? x
    : centerX - (actualIconSize + actualGap + textWidth) / 2;

  if (siteIcon) {
    const iconX = startX;
    const iconY = y - actualIconSize / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.76)";
    drawRoundRect(
      ctx,
      iconX - iconPadding,
      iconY - iconPadding,
      actualIconSize + iconPadding * 2,
      actualIconSize + iconPadding * 2,
      iconRadius + iconPadding
    );
    ctx.fill();
    drawRoundedImage(ctx, siteIcon, iconX, iconY, actualIconSize, actualIconSize, iconRadius);
    ctx.fillStyle = color;
  }

  ctx.fillText(displayTitle, startX + actualIconSize + actualGap, y + 1);
  ctx.restore();
}

async function getLucideIconDataUrl(IconComponent, size) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(createElement(IconComponent, {
        absoluteStrokeWidth: true,
        color: "#667085",
        size,
        strokeWidth: 3.4,
      }));
    });

    const svg = host.querySelector("svg");
    if (!svg) {
      throw new Error("lucide_icon_render_failed");
    }

    const markup = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  } finally {
    root.unmount();
    host.remove();
  }
}

function drawShareHint(ctx, { x, y, width, text, iconImage }) {
  const iconSize = 64;
  ctx.save();
  ctx.drawImage(iconImage, x, y + 2, iconSize, iconSize);

  ctx.fillStyle = "#475467";
  ctx.font = "500 32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawWrappedText(ctx, text, x + 84, y + 30, width - 84, 34, 2);
  ctx.restore();
}

export async function buildWatchShareImage({
  watchLink,
  roomLabel,
  roomTitle,
  hostDisplayName,
  hostAvatarUrl,
  roomCoverUrl,
  siteIconUrl,
  siteTitle,
}) {
  const qrDataUrl = await QRCode.toDataURL(watchLink, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 440,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });
  const qrImage = await loadImage(qrDataUrl);
  const [saveIconUrl, scanIconUrl] = await Promise.all([
    getLucideIconDataUrl(Download, 64),
    getLucideIconDataUrl(ScanQrCode, 64),
  ]);
  const [saveHintIcon, scanHintIcon] = await Promise.all([
    loadImage(saveIconUrl),
    loadImage(scanIconUrl),
  ]);
  const hostAvatar = await loadOptionalImage(hostAvatarUrl);
  const roomCover = await loadOptionalImage(roomCoverUrl);
  const siteIcon = await loadOptionalImage(siteIconUrl);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  if (roomCover) {
    drawCoverBanner(ctx, roomCover, {
      x: 0,
      y: 0,
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_COVER_HEIGHT,
    });
  }

  ctx.fillStyle = "#101828";
  ctx.font = "700 54px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  const title = roomTitle || roomLabel || "直播间";
  const titleHeight = drawWrappedText(
    ctx,
    title,
    SHARE_CONTENT_X,
    SHARE_TITLE_Y,
    SHARE_CONTENT_WIDTH,
    SHARE_TITLE_LINE_HEIGHT,
    SHARE_TITLE_MAX_LINES
  );
  const subtitleY = SHARE_TITLE_Y + titleHeight;
  const qrCardY = SHARE_TITLE_Y + SHARE_ASSUMED_TITLE_HEIGHT + SHARE_SUBTITLE_TO_QR_GAP;

  ctx.fillStyle = "#667085";
  ctx.font = "400 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const hostId = hostDisplayName || roomLabel;
  const subtitle = hostId ? `@${hostId.replace(/^@+/, "")}` : "正在直播";
  drawWrappedText(
    ctx,
    subtitle,
    SHARE_CONTENT_X,
    subtitleY,
    SHARE_CONTENT_WIDTH,
    SHARE_SUBTITLE_LINE_HEIGHT,
    1
  );

  ctx.fillStyle = "#ffffff";
  drawRoundRect(ctx, SHARE_QR_CARD_X, qrCardY, SHARE_QR_CARD_SIZE, SHARE_QR_CARD_SIZE, 28);
  ctx.fill();
  ctx.strokeStyle = "#e4e7ec";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.drawImage(qrImage, SHARE_QR_IMAGE_X, qrCardY + 42, SHARE_QR_IMAGE_SIZE, SHARE_QR_IMAGE_SIZE);

  if (hostAvatar) {
    const avatarSize = 92;
    const avatarCenterX = SHARE_IMAGE_WIDTH / 2;
    const avatarCenterY = qrCardY + SHARE_QR_CARD_SIZE / 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e4e7ec";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCircleImage(ctx, hostAvatar, avatarCenterX, avatarCenterY, avatarSize);
  }

  const hintY = Math.min(qrCardY + SHARE_QR_CARD_SIZE + SHARE_QR_TO_HINT_GAP, SHARE_HINT_Y_MAX);

  drawShareHint(ctx, {
    x: 116,
    y: hintY,
    width: 362,
    text: "保存图片到相册",
    iconImage: saveHintIcon,
  });
  drawShareHint(ctx, {
    x: 524,
    y: hintY,
    width: 340,
    text: "打开系统扫码应用扫一扫",
    iconImage: scanHintIcon,
  });

  drawSiteBrand(ctx, { siteTitle, siteIcon, y: SHARE_BRAND_Y });

  return canvas.toDataURL("image/png");
}

export async function buildLiveScreenshotShareImage({
  watchLink,
  videoElement,
  hostAvatarUrl,
  siteIconUrl,
  siteTitle,
  mirrorPreview = false,
  delayMs = LIVE_SCREENSHOT_DELAY_MS,
}) {
  if (!watchLink || !videoElement) {
    throw new Error("live_screenshot_unavailable");
  }

  await wait(delayMs);

  const sourceWidth = videoElement.videoWidth;
  const sourceHeight = videoElement.videoHeight;

  if (!sourceWidth || !sourceHeight || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("live_screenshot_video_not_ready");
  }

  const qrDataUrl = await QRCode.toDataURL(watchLink, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 320,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });
  const [qrImage, hostAvatar, siteIcon] = await Promise.all([
    loadImage(qrDataUrl),
    loadOptionalImage(hostAvatarUrl),
    loadOptionalImage(siteIconUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#050d14";
  ctx.fillRect(0, 0, sourceWidth, sourceHeight);

  ctx.save();
  if (mirrorPreview) {
    ctx.translate(sourceWidth, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(videoElement, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();

  const shortSide = Math.min(sourceWidth, sourceHeight);
  const qrSize = Math.max(96, Math.min(168, Math.round(shortSide * 0.18)));
  const qrPadding = Math.max(8, Math.round(qrSize * 0.08));
  const brandFontSize = Math.max(12, Math.min(16, Math.round(shortSide * 0.022)));
  const brandIconSize = Math.max(14, Math.min(20, Math.round(shortSide * 0.026)));
  const brandLineHeight = Math.max(18, brandIconSize + 4);
  const scanFontSize = brandFontSize;
  const scanLineHeight = Math.ceil(scanFontSize * 1.25);
  const qrToBrandGap = Math.max(6, Math.round(qrSize * 0.06));
  const brandToScanGap = Math.max(3, Math.round(qrSize * 0.03));
  const cardWidth = Math.min(sourceWidth - qrPadding * 2, qrSize + qrPadding * 2);
  const cardHeight = qrPadding
    + qrSize
    + qrToBrandGap
    + brandLineHeight
    + brandToScanGap
    + scanLineHeight
    + qrPadding;
  const cardRadius = Math.max(10, Math.round(cardWidth * 0.12));
  const edgeInset = Math.max(16, Math.round(shortSide * 0.035));
  const cardX = sourceWidth - cardWidth - edgeInset;
  const cardY = sourceHeight - cardHeight - edgeInset;
  const qrX = cardX + (cardWidth - qrSize) / 2;
  const qrY = cardY + qrPadding;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = Math.round(cardWidth * 0.14);
  ctx.shadowOffsetY = Math.round(cardWidth * 0.04);
  ctx.fillStyle = "#ffffff";
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, cardRadius);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  if (hostAvatar) {
    const avatarSize = Math.max(28, Math.round(qrSize * 0.24));
    const avatarCenterX = qrX + qrSize / 2;
    const avatarCenterY = qrY + qrSize / 2;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + Math.max(4, Math.round(avatarSize * 0.12)), 0, Math.PI * 2);
    ctx.fill();
    drawCircleImage(ctx, hostAvatar, avatarCenterX, avatarCenterY, avatarSize);
    ctx.restore();
  }

  const brandCenterY = qrY + qrSize + qrToBrandGap + brandLineHeight / 2;
  drawSiteBrand(ctx, {
    siteTitle,
    siteIcon,
    centerX: cardX + cardWidth / 2,
    y: brandCenterY,
    font: `600 ${brandFontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
    color: "#344054",
    iconSize: brandIconSize,
    iconGap: Math.max(4, Math.round(brandIconSize * 0.32)),
    iconRadius: Math.max(3, Math.round(brandIconSize * 0.22)),
    iconPadding: Math.max(2, Math.round(brandIconSize * 0.12)),
    maxWidth: cardWidth - qrPadding * 2,
  });

  ctx.save();
  ctx.fillStyle = "#667085";
  ctx.font = `500 ${scanFontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    "扫码看直播",
    cardX + cardWidth / 2,
    brandCenterY + brandLineHeight / 2 + brandToScanGap + scanFontSize
  );
  ctx.restore();

  return canvas.toDataURL("image/png");
}
