import fs from "node:fs";
import path from "node:path";

const APP_URL = "http://127.0.0.1:4173/";
const CDP_PORT = 9237;
const dragX = Number(process.argv[2] || 300);
const outputName = process.argv[3] || "material-side.png";
const finish = process.argv[4] || "night-sky";
const pose = process.argv[5] || "closed";
const outputPath = path.resolve("qa", outputName);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((response) => response.json());
const pageTarget = targets.find((target) => target.type === "page" && target.url.startsWith(APP_URL));

if (!pageTarget) throw new Error("No local preview page is connected");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result || {});
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

await Promise.all([send("Page.enable"), send("Runtime.enable")]);
await send("Emulation.setDeviceMetricsOverride", {
  width: 1000,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1000,
  screenHeight: 900,
});
await send("Page.navigate", { url: APP_URL });
await waitFor(`document.querySelector('.duo-device')?.dataset.ready === 'true'`);
await sleep(850);
await evaluate(`document.querySelector('[aria-label="${finish === 'night-sky' ? 'Night Sky' : 'Star White'}"]')?.click()`);
if (pose === 'closed') await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Closed'))?.click()`);
await sleep(450);

const bounds = await evaluate(`(() => {
  const rect = document.querySelector('.duo-device-target').getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
})()`);
const center = {
  x: bounds.left + bounds.width * 0.5,
  y: bounds.top + bounds.height * 0.49,
};

await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: center.x,
  y: center.y,
  button: "left",
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseMoved",
  x: center.x + dragX,
  y: center.y,
  button: "left",
  buttons: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: center.x + dragX,
  y: center.y,
  button: "left",
  clickCount: 1,
});
await sleep(900);

const result = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: false,
});
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(result.data, "base64"));
socket.close();

console.log(outputPath);
