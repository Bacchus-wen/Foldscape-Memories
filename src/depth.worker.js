import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

let estimatorPromise;
let activeJobId = 0;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function percentile(values, ratio) {
  const stride = Math.max(1, Math.floor(values.length / 50_000));
  const sample = [];
  for (let index = 0; index < values.length; index += stride) {
    const value = values[index];
    if (Number.isFinite(value)) sample.push(value);
  }
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.max(0, Math.round((sample.length - 1) * ratio)))] || 0;
}

function resizeDepth(values, sourceWidth, sourceHeight, maxDimension = 768) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(64, Math.round(sourceWidth * scale));
  const height = Math.max(64, Math.round(sourceHeight * scale));
  if (width === sourceWidth && height === sourceHeight) {
    return { values: new Float32Array(values), width, height };
  }

  const output = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = (y + 0.5) * sourceHeight / height - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = clamp(sourceY - y0);
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) * sourceWidth / width - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = clamp(sourceX - x0);
      const top = values[y0 * sourceWidth + x0] * (1 - fx) + values[y0 * sourceWidth + x1] * fx;
      const bottom = values[y1 * sourceWidth + x0] * (1 - fx) + values[y1 * sourceWidth + x1] * fx;
      output[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { values: output, width, height };
}

async function loadGuidePixels(source, width, height) {
  const response = await fetch(source);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
}

function guidedRefineDepth(values, guide, width, height) {
  let input = values;
  const spatial = [1, 2, 1];

  for (let pass = 0; pass < 2; pass += 1) {
    const output = new Float32Array(input.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const centerIndex = y * width + x;
        const centerDepth = input[centerIndex];
        const guideOffset = centerIndex * 4;
        let weightedDepth = 0;
        let totalWeight = 0;

        for (let oy = -1; oy <= 1; oy += 1) {
          const sampleY = Math.min(height - 1, Math.max(0, y + oy));
          for (let ox = -1; ox <= 1; ox += 1) {
            const sampleX = Math.min(width - 1, Math.max(0, x + ox));
            const sampleIndex = sampleY * width + sampleX;
            const sampleDepth = input[sampleIndex];
            let guideWeight = 1;
            if (guide) {
              const sampleOffset = sampleIndex * 4;
              const colorDifference = (
                Math.abs(guide[guideOffset] - guide[sampleOffset]) +
                Math.abs(guide[guideOffset + 1] - guide[sampleOffset + 1]) +
                Math.abs(guide[guideOffset + 2] - guide[sampleOffset + 2])
              ) / 765;
              guideWeight = Math.exp(-colorDifference * 13);
            }
            const depthWeight = Math.exp(-Math.abs(centerDepth - sampleDepth) * 8);
            const weight = spatial[ox + 1] * spatial[oy + 1] * guideWeight * depthWeight;
            weightedDepth += sampleDepth * weight;
            totalWeight += weight;
          }
        }
        output[centerIndex] = totalWeight > 0 ? weightedDepth / totalWeight : centerDepth;
      }
    }
    input = output;
  }

  return input;
}

async function createZoeStyleDepth(predictedDepth, source, sourceWidth, sourceHeight) {
  const low = percentile(predictedDepth, 0.02);
  const high = percentile(predictedDepth, 0.98);
  const range = Math.max(1e-6, high - low);
  const robustRelative = new Float32Array(predictedDepth.length);
  for (let index = 0; index < predictedDepth.length; index += 1) {
    robustRelative[index] = clamp((predictedDepth[index] - low) / range);
  }

  const resized = resizeDepth(robustRelative, sourceWidth, sourceHeight);
  let guide = null;
  try {
    guide = await loadGuidePixels(source, resized.width, resized.height);
  } catch {
    guide = null;
  }

  const refined = guidedRefineDepth(resized.values, guide, resized.width, resized.height);
  const refinedLow = percentile(refined, 0.015);
  const refinedHigh = percentile(refined, 0.985);
  const refinedRange = Math.max(1e-6, refinedHigh - refinedLow);
  const bytes = new Uint8Array(refined.length);
  const dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  for (let y = 0; y < resized.height; y += 1) {
    for (let x = 0; x < resized.width; x += 1) {
      const index = y * resized.width + x;
      const normalized = clamp((refined[index] - refinedLow) / refinedRange);
      const noise = (dither[(y % 4) * 4 + (x % 4)] / 16 - 0.46875) * 0.7;
      bytes[index] = Math.round(clamp(normalized * 255 + noise, 0, 255));
    }
  }

  return { bytes, width: resized.width, height: resized.height };
}

function getEstimator() {
  if (!estimatorPromise) {
    const device = self.navigator?.gpu ? "webgpu" : "wasm";
    estimatorPromise = pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
      device,
      dtype: "q8",
      progress_callback: (event) => {
        if (event.status === "progress") {
          self.postMessage({
            type: "progress",
            id: activeJobId,
            progress: Number.isFinite(event.progress) ? event.progress : 0,
            file: event.file || "",
          });
        } else if (event.status === "ready") {
          self.postMessage({ type: "model-ready", id: activeJobId });
        }
      },
    });
  }
  return estimatorPromise;
}

self.addEventListener("message", async (event) => {
  const { id, image } = event.data || {};
  if (!id || !image) return;
  activeJobId = id;

  try {
    self.postMessage({ type: "status", id, label: "正在载入 AI 深度模型" });
    const estimator = await getEstimator();
    self.postMessage({ type: "status", id, label: "正在分析画面空间" });
    const result = await estimator(image);
    self.postMessage({ type: "status", id, label: "正在进行 ZoeDepth 式层次精修" });
    const tensor = result.predicted_depth;
    const [height, width] = tensor.dims.slice(-2);
    const refined = await createZoeStyleDepth(tensor.data, image, width, height);
    self.postMessage(
      {
        type: "complete",
        id,
        width: refined.width,
        height: refined.height,
        bytes: refined.bytes,
      },
      [refined.bytes.buffer],
    );
  } catch (error) {
    estimatorPromise = undefined;
    self.postMessage({
      type: "error",
      id,
      message: error instanceof Error ? error.message : "AI 深度生成暂不可用",
    });
  }
});
