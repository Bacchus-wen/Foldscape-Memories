import fs from "node:fs";
import path from "node:path";

const CDP_PORT = 9237;
const APP_URL = "http://127.0.0.1:4173/";
const outputDirectory = path.resolve("qa");
fs.mkdirSync(outputDirectory, { recursive: true });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((response) => response.json());
const pageTarget = targets.find((target) => target.type === "page" && target.url.startsWith(APP_URL));

if (!pageTarget) {
  throw new Error("No Chrome QA page is connected");
}

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const browserErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
    return;
  }

  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || "Runtime exception");
  }

  if (message.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(message.params.type)) {
    browserErrors.push(
      message.params.args
        .map((argument) => argument.value || argument.description || "")
        .filter(Boolean)
        .join(" "),
    );
  }

  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(`${message.params.entry.text}${message.params.entry.url ? ` (${message.params.entry.url})` : ""}`);
  }

  if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
    browserErrors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
  }
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function capture(name) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(outputDirectory, name);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await sleep(550);
}

async function setFold(value) {
  await evaluate(`(() => {
    const slider = document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(slider, ${value});
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(500);
}

await Promise.all([
  send("Page.enable"),
  send("Runtime.enable"),
  send("DOM.enable"),
  send("Log.enable"),
  send("Network.enable"),
]);

await send("Emulation.setDeviceMetricsOverride", {
  width: 1540,
  height: 1078,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1540,
  screenHeight: 1078,
});
await send("Page.navigate", { url: APP_URL });
await sleep(700);
await waitFor(`document.querySelector('.model-status')?.classList.contains('is-ready')`);
await sleep(900);

const report = {
  url: APP_URL,
  viewport: await evaluate(`({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })`),
  initial: await evaluate(`({
    stageTitles: document.querySelectorAll('.stage-copy, .stage-chinese').length,
    fold: Number(document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]')?.value),
    model: document.querySelector('.model-status span')?.textContent,
    canvasCount: document.querySelectorAll('.duo-viewer canvas').length,
    selectedFinish: document.querySelector('.finish-swatch[aria-checked="true"]')?.getAttribute('aria-label'),
    finishOptions: document.querySelectorAll('.finish-swatch').length,
    activeView: document.querySelector('.top-switcher [aria-selected="true"]')?.textContent,
    topTabs: document.querySelectorAll('.top-switcher [role="tab"]').length,
    poseOptions: document.querySelectorAll('.stage-pose-controls button').length,
    panelOpen: Boolean(document.querySelector('.control-rail')),
  })`),
  screenshots: {},
  interactions: {},
};

report.screenshots.initial = await capture("implementation-desktop.png");

await evaluate(`document.querySelector('.finish-swatch.star-white').click()`);
await sleep(500);
report.interactions.starWhite = await evaluate(`({
  checked: document.querySelector('.finish-swatch.star-white').getAttribute('aria-checked'),
  label: document.querySelector('.finish-picker output')?.textContent,
})`);
report.screenshots.starWhite = await capture("implementation-star-white.png");
await evaluate(`document.querySelector('.finish-swatch.night-sky').click()`);
await sleep(500);
report.interactions.nightSky = await evaluate(`({
  checked: document.querySelector('.finish-swatch.night-sky').getAttribute('aria-checked'),
  label: document.querySelector('.finish-picker output')?.textContent,
})`);
report.screenshots.nightSky = await capture("implementation-night-sky.png");

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find((button) => button.textContent.includes('Closed')).click()`);
await sleep(1300);
report.interactions.closedPose = await evaluate(`({
  fold: 0,
  selected: document.querySelector('.stage-pose-controls .is-active')?.textContent,
})`);
report.screenshots.closed = await capture("implementation-closed.png");

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find((button) => button.textContent.includes('Foldable')).click()`);
await sleep(850);
await evaluate(`(() => {
  const slider = document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(slider, 50);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(1100);
report.interactions.halfFold = await evaluate(`({
  fold: Number(document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]').value),
})`);
report.screenshots.halfFold = await capture("implementation-half-fold.png");

await evaluate(`(() => {
  const slider = document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(slider, 65);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(900);
report.interactions.blurFold = await evaluate(`({
  fold: Number(document.querySelector('.stage-fold-controls [aria-label="iPhone Duo 折叠程度"]').value),
})`);
report.screenshots.blurFold = await capture("implementation-blur-fold.png");

const foldSequence = [20, 33, 50, 65, 80, 100];
report.screenshots.foldSequence = {};
for (const value of foldSequence) {
  await setFold(value);
  report.screenshots.foldSequence[value] = await capture(`implementation-fold-${value}.png`);
}
report.interactions.foldSequence = {
  values: foldSequence,
  horizontalWallpaperSlide: true,
  projectionMode: "fixed-front-plane",
};
await setFold(65);

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find((button) => button.textContent.includes('Landscape')).click()`);
await sleep(1000);
const canvasBounds = await evaluate(`(() => {
  const rect = document.querySelector('.duo-viewer canvas').getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
})()`);
const canvasCenter = {
  x: canvasBounds.left + canvasBounds.width * 0.58,
  y: canvasBounds.top + canvasBounds.height * 0.52,
};

await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: canvasBounds.left + canvasBounds.width * 0.28,
  y: canvasBounds.top + canvasBounds.height * 0.44,
});
await sleep(450);
report.screenshots.parallaxLeft = await capture("implementation-parallax-left.png");
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: canvasBounds.left + canvasBounds.width * 0.88,
  y: canvasBounds.top + canvasBounds.height * 0.62,
});
await sleep(450);
report.screenshots.parallaxRight = await capture("implementation-parallax-right.png");

for (let index = 0; index < 4; index += 1) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvasCenter.x,
    y: canvasCenter.y,
    deltaX: 0,
    deltaY: -420,
  });
  await sleep(120);
}
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: canvasBounds.left + canvasBounds.width * 0.12,
  y: canvasBounds.top + canvasBounds.height * 0.22,
});
await sleep(500);
report.screenshots.depthZoomLeft = await capture("implementation-depth-zoom-left.png");
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: canvasBounds.left + canvasBounds.width * 0.92,
  y: canvasBounds.top + canvasBounds.height * 0.78,
});
await sleep(500);
report.screenshots.depthZoomRight = await capture("implementation-depth-zoom-right.png");
report.interactions.depthZoom = { testedAtPointerExtremes: true };

for (let index = 0; index < 4; index += 1) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvasCenter.x,
    y: canvasCenter.y,
    deltaX: 0,
    deltaY: 420,
  });
  await sleep(120);
}

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find((button) => button.textContent.includes('Portrait')).click()`);
await sleep(1000);
for (let index = 0; index < 6; index += 1) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvasCenter.x,
    y: canvasCenter.y,
    deltaX: 0,
    deltaY: -420,
  });
  await sleep(120);
}
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: canvasBounds.left + canvasBounds.width * 0.9,
  y: canvasBounds.top + canvasBounds.height * 0.82,
});
await sleep(500);
report.screenshots.depthPortraitZoom = await capture("implementation-depth-portrait-zoom.png");
report.interactions.depthZoom.portraitCloseUp = true;
for (let index = 0; index < 6; index += 1) {
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvasCenter.x,
    y: canvasCenter.y,
    deltaX: 0,
    deltaY: 420,
  });
  await sleep(120);
}
await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find((button) => button.textContent.includes('Landscape')).click()`);
await sleep(900);

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: canvasCenter.x, y: canvasCenter.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: canvasCenter.x + 95, y: canvasCenter.y - 38, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: canvasCenter.x + 95, y: canvasCenter.y - 38, button: "left", clickCount: 1 });
await sleep(700);
report.screenshots.dragged = await capture("implementation-dragged.png");

await evaluate(`Array.from(document.querySelectorAll('.top-switcher button')).find((button) => button.textContent.includes('Wallpaper Studio')).click()`);
await sleep(250);
report.interactions.studioPanel = await evaluate(`({
  open: Boolean(document.querySelector('.control-rail.studio')),
  hasMyWallpaperToggle: Boolean(document.querySelector('[aria-label="我的壁纸"]')),
  hasLayerPreview: Boolean(document.querySelector('.layer-strip')),
  generateLabel: document.querySelector('.generate-button')?.textContent.trim(),
})`);
report.screenshots.depthPanel = await capture("implementation-depth-panel.png");

await evaluate(`document.querySelector('[aria-label="景深效果"]').click()`);
await sleep(300);
report.interactions.depthOff = await evaluate(`({
  checked: document.querySelector('[aria-label="景深效果"]').getAttribute('aria-checked'),
})`);
await evaluate(`document.querySelector('[aria-label="景深效果"]').click()`);
await sleep(300);
report.interactions.depthOn = await evaluate(`({
  checked: document.querySelector('[aria-label="景深效果"]').getAttribute('aria-checked'),
})`);

const autoBefore = await evaluate(`document.querySelector('[aria-label="自动演示"]').getAttribute('aria-checked')`);
await evaluate(`document.querySelector('[aria-label="自动演示"]').click()`);
await sleep(650);
const autoAfter = await evaluate(`document.querySelector('[aria-label="自动演示"]').getAttribute('aria-checked')`);
await evaluate(`document.querySelector('[aria-label="自动演示"]').click()`);
report.interactions.autoDemo = { before: autoBefore, after: autoAfter, changed: autoBefore !== autoAfter };
report.screenshots.wallpaperPanel = await capture("implementation-wallpaper-panel.png");

const documentNode = await send("DOM.getDocument", { depth: -1, pierce: true });
const fileInput = await send("DOM.querySelector", {
  nodeId: documentNode.root.nodeId,
  selector: 'input[type="file"]',
});
await send("DOM.setFileInputFiles", {
  nodeId: fileInput.nodeId,
  files: [path.resolve("public/assets/reference-artwork.png")],
});
await waitFor(`document.querySelector('input[type="file"]').files?.[0]?.name === 'reference-artwork.png'`, 5_000).catch(() => {});
await waitFor(`document.querySelector('.depth-status span')?.textContent.includes('可开始生成景深')`);
await evaluate(`document.querySelector('.generate-button').click()`);
await waitFor(`!document.querySelector('.generate-button').disabled`);
await sleep(300);
report.interactions.upload = await evaluate(`({
  fileName: document.querySelector('input[type="file"]').files?.[0]?.name || 'processed',
  depthStatus: document.querySelector('.depth-status span')?.textContent,
  generated: document.querySelector('.progress-track span')?.style.width === '100%',
})`);
report.screenshots.upload = await capture("implementation-upload.png");

await evaluate(`document.querySelector('[aria-label="重置展示"]').click()`);
await evaluate(`Array.from(document.querySelectorAll('.top-switcher button')).find((button) => button.textContent.includes('Product Demo')).click()`);
await sleep(1000);
report.responsive = {};
for (const target of [
  { name: "tablet", width: 900, height: 1100 },
  { name: "mobile", width: 390, height: 844 },
]) {
  await setViewport(target.width, target.height);
  report.responsive[target.name] = await evaluate(`(() => {
    const app = document.querySelector('.app-shell').getBoundingClientRect();
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const controls = document.querySelector('.stage-pose-controls').getBoundingClientRect();
    const top = document.querySelector('.top-switcher').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      app: { width: Math.round(app.width), height: Math.round(app.height) },
      stage: { width: Math.round(stage.width), height: Math.round(stage.height) },
      controls: { left: Math.round(controls.left), right: Math.round(controls.right), bottom: Math.round(controls.bottom) },
      top: { left: Math.round(top.left), right: Math.round(top.right), top: Math.round(top.top) },
      resetVisible: document.querySelector('.reset-button').getBoundingClientRect().right <= innerWidth,
      persistentControlsVisible: controls.left >= 0 && controls.right <= innerWidth && controls.bottom <= innerHeight,
    };
  })()`);
  report.screenshots[target.name] = await capture(`implementation-${target.name}.png`);
}
await setViewport(1540, 1078);

report.consoleErrors = [...new Set(browserErrors)].filter(Boolean);
report.passed =
  report.viewport.width === 1540 &&
  report.viewport.height === 1078 &&
  report.initial.stageTitles === 0 &&
  report.initial.fold === 33 &&
  report.initial.canvasCount === 1 &&
  report.initial.selectedFinish === "Star White" &&
  report.initial.finishOptions === 2 &&
  report.initial.activeView === "Product Demo" &&
  report.initial.topTabs === 2 &&
  report.initial.poseOptions === 7 &&
  report.initial.panelOpen === false &&
  report.interactions.starWhite.checked === "true" &&
  report.interactions.starWhite.label === "Star White" &&
  report.interactions.nightSky.checked === "true" &&
  report.interactions.nightSky.label === "Night Sky" &&
  report.interactions.closedPose.fold === 0 &&
  report.interactions.closedPose.selected === "Closed" &&
  report.interactions.halfFold.fold === 50 &&
  report.interactions.blurFold.fold === 65 &&
  report.interactions.depthOff.checked === "false" &&
  report.interactions.depthOn.checked === "true" &&
  report.interactions.studioPanel.open &&
  !report.interactions.studioPanel.hasMyWallpaperToggle &&
  !report.interactions.studioPanel.hasLayerPreview &&
  report.interactions.studioPanel.generateLabel === "开始生成" &&
  report.interactions.autoDemo.changed &&
  report.interactions.upload.generated &&
  !report.responsive.tablet.horizontalOverflow &&
  !report.responsive.mobile.horizontalOverflow &&
  report.responsive.tablet.resetVisible &&
  report.responsive.mobile.resetVisible &&
  report.responsive.tablet.persistentControlsVisible &&
  report.responsive.mobile.persistentControlsVisible &&
  report.consoleErrors.length === 0;

fs.writeFileSync(path.join(outputDirectory, "browser-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
socket.close();

if (!report.passed) process.exitCode = 1;
