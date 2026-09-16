import fs from 'node:fs/promises'

const CDP_URL = 'http://127.0.0.1:9237'
const APP_URL = 'http://127.0.0.1:4173/'
const angles = [0, 45, 90, 135, 180]
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
await sleep(600)

const states = []
for (const angle of angles) {
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="iPhone Duo 开合角度"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '${angle}')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(700)
  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  const path = `qa/hinge-follow-${angle}.png`
  await fs.writeFile(path, Buffer.from(screenshot.data, 'base64'))
  states.push(await evaluate(`({
    angle: document.querySelector('.stage-fold-scrubber output')?.textContent,
    progress: document.querySelector('.duo-device')?.dataset.progress,
    ready: document.querySelector('.duo-device')?.dataset.ready,
    screenshot: '${path}',
  })`))
}

console.log(JSON.stringify({ states, browserErrors: errors }, null, 2))
socket.close()
