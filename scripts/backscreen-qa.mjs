import fs from 'node:fs/promises'

const CDP_URL = 'http://127.0.0.1:9237'
const APP_URL = 'http://127.0.0.1:4173/'
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const targets = await fetch(`${CDP_URL}/json`).then(response => response.json())
const page = targets.find(target => target.type === 'page' && target.url.startsWith(APP_URL))
if (!page) throw new Error('No iPhone Duo QA page is connected')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let id = 0
const pending = new Map()
const errors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (message.id) {
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result || {})
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception')
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type)) {
    errors.push(message.params.args.map(argument => argument.value || argument.description || '').join(' '))
  }
})

function send(method, params = {}) {
  const commandId = ++id
  socket.send(JSON.stringify({ id: commandId, method, params }))
  return new Promise((resolve, reject) => pending.set(commandId, { resolve, reject }))
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result?.value
}

async function capture(path) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

await Promise.all([send('Page.enable'), send('Runtime.enable')])
await send('Emulation.setDeviceMetricsOverride', {
  width: 1540,
  height: 1078,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1540,
  screenHeight: 1078,
})
await send('Page.navigate', { url: APP_URL })

for (let attempt = 0; attempt < 80; attempt += 1) {
  if (await evaluate(`document.querySelector('.duo-device')?.dataset.ready === 'true'`)) break
  await sleep(250)
}
await sleep(600)

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Landscape'))?.click()`)
await sleep(1200)
await capture('qa/implementation-screen-landscape.png')
const landscape = await evaluate(`({
  pose: Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.getAttribute('aria-pressed') === 'true')?.textContent,
  orientation: document.querySelector('.duo-device')?.dataset.screenOrientation,
  screenOverlay: document.querySelector('.duo-device')?.dataset.screenOverlay,
  coverOverlay: document.querySelector('.duo-device')?.dataset.coverOverlay,
  screenContentResolution: document.querySelector('.duo-device')?.dataset.screenContentResolution,
  coverContentResolution: document.querySelector('.duo-device')?.dataset.coverContentResolution,
})`)

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Portrait'))?.click()`)
await sleep(1200)
await capture('qa/implementation-screen-portrait.png')
const portrait = await evaluate(`({
  pose: Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.getAttribute('aria-pressed') === 'true')?.textContent,
  orientation: document.querySelector('.duo-device')?.dataset.screenOrientation,
  screenOverlay: document.querySelector('.duo-device')?.dataset.screenOverlay,
  coverOverlay: document.querySelector('.duo-device')?.dataset.coverOverlay,
  screenContentResolution: document.querySelector('.duo-device')?.dataset.screenContentResolution,
  coverContentResolution: document.querySelector('.duo-device')?.dataset.coverContentResolution,
})`)

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Closed'))?.click()`)
await sleep(900)
const frontBounds = await evaluate(`(() => {
  const rect = document.querySelector('.duo-device-target').getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
})()`)
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: frontBounds.x, y: frontBounds.y, deltaX: 0, deltaY: -500 })
await sleep(500)
await capture('qa/implementation-cover-front.png')
const front = await evaluate(`({
  modelReady: document.querySelector('.duo-device')?.dataset.ready,
  foldProgress: document.querySelector('.duo-device')?.dataset.progress,
  rotationY: document.querySelector('.duo-device')?.dataset.rotationY,
  coverOverlay: document.querySelector('.duo-device')?.dataset.coverOverlay,
  screenContentResolution: document.querySelector('.duo-device')?.dataset.screenContentResolution,
  coverContentResolution: document.querySelector('.duo-device')?.dataset.coverContentResolution,
})`)

await evaluate(`document.querySelector('[aria-label="展开 180°"]')?.click()`)
await sleep(900)

const bounds = await evaluate(`(() => {
  const rect = document.querySelector('.duo-device-target').getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
})()`)
const start = { x: bounds.left + bounds.width * 0.18, y: bounds.top + bounds.height * 0.5 }
const end = { x: Math.min(bounds.left + bounds.width - 20, start.x + 818), y: start.y }
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 })
await sleep(900)

await capture('qa/implementation-open-back-screen.png')

const rear = await evaluate(`({
  hasContent: document.body.innerText.trim().length > 0,
  errorOverlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')),
  modelReady: document.querySelector('.duo-device')?.dataset.ready,
  foldProgress: document.querySelector('.duo-device')?.dataset.progress,
  rotationY: document.querySelector('.duo-device')?.dataset.rotationY,
  coverOverlay: document.querySelector('.duo-device')?.dataset.coverOverlay,
  keyControls: document.querySelectorAll('.viewer-panel button, .viewer-panel input').length,
})`)

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Closed'))?.click()`)
await sleep(900)
const sideBounds = await evaluate(`(() => {
  const rect = document.querySelector('.duo-device-target').getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
})()`)
const sideStart = { x: sideBounds.left + sideBounds.width * 0.28, y: sideBounds.top + sideBounds.height * 0.5 }
const sideEnd = { x: sideStart.x + 291, y: sideStart.y }
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sideStart.x, y: sideStart.y, button: 'left', buttons: 1, clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sideEnd.x, y: sideEnd.y, button: 'left', buttons: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sideEnd.x, y: sideEnd.y, button: 'left', buttons: 0, clickCount: 1 })
await sleep(900)
await capture('qa/implementation-closed-side-screen.png')
const side = await evaluate(`({
  modelReady: document.querySelector('.duo-device')?.dataset.ready,
  foldProgress: document.querySelector('.duo-device')?.dataset.progress,
  rotationY: document.querySelector('.duo-device')?.dataset.rotationY,
  screenOverlay: document.querySelector('.duo-device')?.dataset.screenOverlay,
  coverOverlay: document.querySelector('.duo-device')?.dataset.coverOverlay,
})`)

await evaluate(`document.querySelector('[aria-label="半开 90°"]')?.click()`)
await sleep(900)
await capture('qa/implementation-half-hinge.png')
const half = await evaluate(`({
  modelReady: document.querySelector('.duo-device')?.dataset.ready,
  foldProgress: document.querySelector('.duo-device')?.dataset.progress,
  rotationY: document.querySelector('.duo-device')?.dataset.rotationY,
})`)

console.log(JSON.stringify({
  landscape: { ...landscape, screenshot: 'qa/implementation-screen-landscape.png' },
  portrait: { ...portrait, screenshot: 'qa/implementation-screen-portrait.png' },
  front: { ...front, screenshot: 'qa/implementation-cover-front.png' },
  rear: { ...rear, screenshot: 'qa/implementation-open-back-screen.png' },
  side: { ...side, screenshot: 'qa/implementation-closed-side-screen.png' },
  half: { ...half, screenshot: 'qa/implementation-half-hinge.png' },
  browserErrors: errors,
}, null, 2))
socket.close()
