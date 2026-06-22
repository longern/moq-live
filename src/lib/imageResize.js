import { createAppError } from "./appErrors.js";

function loadImageFromFile(file, errorCode) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(createAppError(errorCode));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality, errorCode) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(createAppError(errorCode));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function getImageDimensions(image) {
  return {
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0,
  };
}

function drawCroppedImage({ context, image, outputWidth, outputHeight }) {
  const { width, height } = getImageDimensions(image);
  if (!width || !height) {
    throw createAppError("image_process_failed");
  }

  const outputRatio = outputWidth / outputHeight;
  const sourceRatio = width / height;
  const sourceWidth = sourceRatio > outputRatio ? height * outputRatio : width;
  const sourceHeight = sourceRatio > outputRatio ? height : width / outputRatio;
  const sourceX = Math.max(0, (width - sourceWidth) / 2);
  const sourceY = Math.max(0, (height - sourceHeight) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );
}

export async function resizeImageFile({
  file,
  outputWidth,
  outputHeight,
  outputName,
  outputType = "image/webp",
  quality = 0.86,
  unreadableErrorCode = "image_unreadable",
  processErrorCode = "image_process_failed",
  unsupportedErrorCode = "image_resize_unsupported",
}) {
  const image = await loadImageFromFile(file, unreadableErrorCode);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw createAppError(unsupportedErrorCode);
  }

  try {
    drawCroppedImage({ context, image, outputWidth, outputHeight });
  } catch (error) {
    if (error?.code) {
      throw error;
    }
    throw createAppError(processErrorCode);
  }

  const blob = await canvasToBlob(canvas, outputType, quality, processErrorCode);
  return new File([blob], outputName, { type: outputType });
}

export function resizeAvatarFile(file, size = 192) {
  return resizeImageFile({
    file,
    outputWidth: size,
    outputHeight: size,
    outputName: "avatar.webp",
    quality: 0.9,
    unreadableErrorCode: "avatar_image_unreadable",
    processErrorCode: "avatar_image_process_failed",
    unsupportedErrorCode: "avatar_resize_unsupported",
  });
}

export function resizeRoomCoverFile(file, options = {}) {
  return resizeImageFile({
    file,
    outputWidth: options.width || 1280,
    outputHeight: options.height || 720,
    outputName: "room-cover.webp",
    quality: options.quality || 0.86,
    unreadableErrorCode: "cover_image_unreadable",
    processErrorCode: "cover_image_process_failed",
    unsupportedErrorCode: "cover_resize_unsupported",
  });
}
