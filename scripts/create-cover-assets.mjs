import { readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'public/screen-content/icons')

const sources = {
  facetime: 'public/app-icons/facetime.jpg',
  calendar: 'public/app-icons/calendar.jpg',
  photos: 'public/app-icons/photos.jpg',
  camera: 'public/app-icons/camera.jpg',
  mail: 'public/app-icons/mail.jpg',
  notes: 'public/app-icons/notes.jpg',
  clock: 'public/app-icons/clock.jpg',
  'apple-maps': 'public/app-icons/apple-maps.jpg',
  'apple-tv': 'public/app-icons/apple-tv.jpg',
  news: 'public/screen-content/icons/news.png',
  'app-store': 'public/screen-content/icons/app-store.png',
  rocket: 'public/screen-content/icons/rocket.png',
  'apple-health': 'public/app-icons/apple-health.jpg',
  'apple-wallet': 'public/app-icons/apple-wallet.jpg',
  siri: 'public/screen-content/icons/siri.png',
  settings: 'public/screen-content/icons/settings.png',
  phone: 'public/app-icons/phone.jpg',
  safari: 'public/app-icons/safari.jpg',
  messages: 'public/app-icons/messages.jpg',
  'apple-music': 'public/app-icons/apple-music.jpg',
}

for (const [name, source] of Object.entries(sources)) {
  const path = resolve(root, source)
  const mime = extname(path) === '.png' ? 'image/png' : 'image/jpeg'
  const data = readFileSync(path).toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${name}"><title>${name}</title><image width="512" height="512" href="data:${mime};base64,${data}" preserveAspectRatio="xMidYMid slice"/></svg>`
  writeFileSync(resolve(output, `${name}.svg`), svg)
}
