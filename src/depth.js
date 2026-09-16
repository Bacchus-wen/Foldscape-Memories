const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = source;
  });
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export async function normalizeImageForGpu(source, maxDimension = 2048) {
  const image = await loadImage(source);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const isTemporaryObjectUrl = typeof source === "string" && source.startsWith("blob:");
  if (longestEdge <= maxDimension && !isTemporaryObjectUrl) return source;

  const scale = Math.min(1, maxDimension / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.92);
}

function coverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const sourceCropWidth = sourceHeight * targetRatio;
    return {
      sx: (sourceWidth - sourceCropWidth) / 2,
      sy: 0,
      sw: sourceCropWidth,
      sh: sourceHeight,
    };
  }

  const sourceCropHeight = sourceWidth / targetRatio;
  return {
    sx: 0,
    sy: (sourceHeight - sourceCropHeight) / 2,
    sw: sourceWidth,
    sh: sourceCropHeight,
  };
}

function boxBlur(values, width, height, radius) {
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      sum += values[y * width + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / (radius * 2 + 1);
      const leaving = Math.max(0, x - radius);
      const entering = Math.min(width - 1, x + radius + 1);
      sum += values[y * width + entering] - values[y * width + leaving];
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / (radius * 2 + 1);
      const leaving = Math.max(0, y - radius);
      const entering = Math.min(height - 1, y + radius + 1);
      sum += horizontal[entering * width + x] - horizontal[leaving * width + x];
    }
  }

  return output;
}

export async function createFastDepthMap(source, maxDimension = 512) {
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(64, Math.round(image.naturalWidth * scale));
  const height = Math.max(64, Math.round(image.naturalHeight * scale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  const luminance = new Float32Array(width * height);
  const saturation = new Float32Array(width * height);

  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const red = pixels.data[offset] / 255;
    const green = pixels.data[offset + 1] / 255;
    const blue = pixels.data[offset + 2] / 255;
    luminance[index] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    saturation[index] = Math.max(red, green, blue) - Math.min(red, green, blue);
  }

  const localMean = boxBlur(luminance, width, height, Math.max(7, Math.round(Math.min(width, height) * 0.045)));
  const edgeDetail = new Float32Array(width * height);
  for (let index = 0; index < edgeDetail.length; index += 1) {
    edgeDetail[index] = clamp(Math.abs(luminance[index] - localMean[index]) * 3.2);
  }
  const broadContrast = boxBlur(
    edgeDetail,
    width,
    height,
    Math.max(5, Math.round(Math.min(width, height) * 0.018)),
  );
  const rawDepth = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const normalizedY = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const normalizedX = x / Math.max(1, width - 1);
      const centerX = (normalizedX - 0.5) / 0.62;
      const centerY = (normalizedY - 0.48) / 0.7;
      const centerPrior = Math.exp(-(centerX * centerX + centerY * centerY) * 1.7);
      const foregroundPrior = clamp(normalizedY * 0.58 + centerPrior * 0.42);

      rawDepth[index] =
        0.12 +
        centerPrior * 0.34 +
        broadContrast[index] * 0.1 +
        saturation[index] * 0.12 +
        luminance[index] * 0.08 +
        foregroundPrior * 0.09;
    }
  }

  let smoothDepth = boxBlur(rawDepth, width, height, 5);
  smoothDepth = boxBlur(smoothDepth, width, height, 3);

  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of smoothDepth) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = Math.max(0.0001, maximum - minimum);
  const depthPixels = context.createImageData(width, height);

  for (let index = 0; index < smoothDepth.length; index += 1) {
    const value = Math.round(clamp((smoothDepth[index] - minimum) / range) * 255);
    const offset = index * 4;
    depthPixels.data[offset] = value;
    depthPixels.data[offset + 1] = value;
    depthPixels.data[offset + 2] = value;
    depthPixels.data[offset + 3] = 255;
  }

  context.putImageData(depthPixels, 0, 0);
  return canvas.toDataURL("image/png");
}

export function depthBytesToDataUrl(bytes, width, height) {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(width, height);

  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    const offset = index * 4;
    pixels.data[offset] = value;
    pixels.data[offset + 1] = value;
    pixels.data[offset + 2] = value;
    pixels.data[offset + 3] = 255;
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function createLayerPreviews(imageSource, depthSource, layerCount = 5) {
  const [image, depth] = await Promise.all([loadImage(imageSource), loadImage(depthSource)]);
  const width = 180;
  const height = 112;
  const imageCanvas = makeCanvas(width, height);
  const depthCanvas = makeCanvas(width, height);
  const imageContext = imageCanvas.getContext("2d", { willReadFrequently: true });
  const depthContext = depthCanvas.getContext("2d", { willReadFrequently: true });
  const imageCrop = coverRect(image.naturalWidth, image.naturalHeight, width, height);
  const depthCrop = coverRect(depth.naturalWidth, depth.naturalHeight, width, height);

  imageContext.drawImage(image, imageCrop.sx, imageCrop.sy, imageCrop.sw, imageCrop.sh, 0, 0, width, height);
  depthContext.drawImage(depth, depthCrop.sx, depthCrop.sy, depthCrop.sw, depthCrop.sh, 0, 0, width, height);

  const imagePixels = imageContext.getImageData(0, 0, width, height);
  const depthPixels = depthContext.getImageData(0, 0, width, height);
  const previews = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const layerCanvas = makeCanvas(width, height);
    const layerContext = layerCanvas.getContext("2d");
    const layerPixels = layerContext.createImageData(width, height);
    const layerCenter = (layerIndex + 0.5) / layerCount;

    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      const depthValue = depthPixels.data[offset] / 255;
      const weight = clamp(1 - Math.abs(depthValue - layerCenter) * layerCount * 1.15);
      layerPixels.data[offset] = imagePixels.data[offset];
      layerPixels.data[offset + 1] = imagePixels.data[offset + 1];
      layerPixels.data[offset + 2] = imagePixels.data[offset + 2];
      layerPixels.data[offset + 3] = Math.round((0.18 + weight * 0.82) * 255);
    }

    layerContext.fillStyle = "#101010";
    layerContext.fillRect(0, 0, width, height);
    const colorCanvas = makeCanvas(width, height);
    colorCanvas.getContext("2d").putImageData(layerPixels, 0, 0);
    layerContext.drawImage(colorCanvas, 0, 0);
    previews.push(layerCanvas.toDataURL("image/jpeg", 0.78));
  }

  return previews;
}
