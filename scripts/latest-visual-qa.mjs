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
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text || 'Runtime exception')
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
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  await fs.writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function setAngle(angle) {
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="iPhone Duo 开合角度"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '${angle}')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(100)
  return evaluate(`({
    angle: document.querySelector('.stage-fold-scrubber output')?.textContent,
    fill: document.querySelector('.stage-fold-scrubber')?.style.getPropertyValue('--fold-progress'),
  })`)
}

await Promise.all([send('Page.enable'), send('Runtime.enable')])
await send('Emulation.setDeviceMetricsOverride', {
  width: 1000,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1000,
  screenHeight: 900,
})
await send('Page.navigate', { url: APP_URL })
for (let attempt = 0; attempt < 80; attempt += 1) {
  if (await evaluate(`document.querySelector('.duo-device')?.dataset.ready === 'true'`)) break
  await sleep(250)
}
await sleep(700)

await capture('qa/latest-star-white-default.png')
const starWhite = await evaluate(`({
  finish: document.querySelector('.duo-device')?.dataset.finish,
  wallpaper: document.querySelector('.stage')?.dataset.wallpaperPreset,
  modelSource: document.querySelector('.duo-device')?.dataset.modelSource,
  dragOutline: getComputedStyle(document.querySelector('.duo-device-target')).outlineStyle,
})`)

await evaluate(`document.querySelector('[aria-label="Night Sky"]')?.click()`)
await sleep(500)
await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Durability'))?.click()`)
await sleep(1300)
await capture('qa/latest-night-sky-back.png')
const nightSky = await evaluate(`({
  finish: document.querySelector('.duo-device')?.dataset.finish,
  wallpaper: document.querySelector('.stage')?.dataset.wallpaperPreset,
  rotationY: document.querySelector('.duo-device')?.dataset.rotationY,
})`)

const progress = []
for (const angle of [0, 90, 180]) progress.push(await setAngle(angle))

await evaluate(`Array.from(document.querySelectorAll('.stage-pose-controls button')).find(button => button.textContent.includes('Portrait'))?.click()`)
await sleep(1300)
await capture('qa/latest-portrait-orientation.png')
const portrait = await evaluate(`({
  rotationZ: document.querySelector('.duo-device')?.dataset.rotationZ,
  screenOrientation: document.querySelector('.duo-device')?.dataset.screenOrientation,
  angle: document.querySelector('.stage-fold-scrubber output')?.textContent,
})`)

console.log(JSON.stringify({ starWhite, nightSky, progress, portrait, browserErrors: errors }, null, 2))
socket.close()
