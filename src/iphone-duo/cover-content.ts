import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

type ImageElement = {
  type: 'image'
  id: string
  name: string
  src: string
  x: number
  y: number
  width: number
  height: number
  radius?: number
}

type PanelElement = {
  type: 'panel'
  id: string
  x: number
  y: number
  width: number
  height: number
  radius: number
  color: string
}

type DotElement = {
  type: 'dot'
  id: string
  x: number
  y: number
  radius: number
  color: string
}

type GlassElement = {
  type: 'glass'
  id: string
  x: number
  y: number
  width: number
  height: number
  radius: number
}

type ScreenLayout = {
  width: number
  height: number
  elements: Array<ImageElement | PanelElement | DotElement | GlassElement>
}

type ScreenElement = ScreenLayout['elements'][number]
type QuarterTurnVariant = 'default' | 'seated'

function adaptQuarterTurnLayout(layout: ScreenLayout, variant: QuarterTurnVariant = 'default'): ScreenLayout {
  const elements = new Map(layout.elements.map(element => [element.id, element]))
  const place = (id: string, patch: Partial<ScreenElement>) => {
    const element = elements.get(id)
    if (!element) return
    elements.set(id, { ...element, ...patch } as ScreenElement)
  }

  if (layout.width > layout.height) {
    // The unfolded display becomes a 1120 x 1600 portrait canvas. Widgets stay
    // grouped at the top, apps reflow to a square grid, and the dock moves to
    // the bottom so no element is stretched by the quarter turn.
    place('photo', variant === 'seated'
      ? { x: 162, y: 120, width: 641 * 608 / 1056, height: 641, radius: 36 }
      : { x: 56, y: 110, width: 500, height: 760, radius: 40 })
    place('weather', { x: 620, y: 120, width: 210, height: 210, radius: 32 })
    place('map', { x: 860, y: 120, width: 210, height: 210, radius: 32 })
    place('status', { x: 1004, y: 350, width: 58, height: 93 })

    const appIds = ['facetime', 'calendar', 'photos', 'camera', 'mail', 'notes', 'clock', 'maps', 'tv', 'news', 'app-store', 'rocket', 'health', 'wallet', 'siri', 'settings']
    const appStartY = variant === 'seated' ? 350 : 400
    const appRowGap = variant === 'seated' ? 105 : 120
    appIds.forEach((id, index) => place(id, {
      x: 610 + (index % 4) * 120,
      y: appStartY + Math.floor(index / 4) * appRowGap,
      width: 96,
      height: 96,
      radius: 22,
    }))

    if (variant === 'seated') {
      const groupIds = ['photo', 'weather', 'map', ...appIds]
      const group = groupIds.map(id => elements.get(id)).filter((element): element is ImageElement => element?.type === 'image')
      const left = Math.min(...group.map(element => element.x))
      const right = Math.max(...group.map(element => element.x + element.width))
      const offset = (layout.height - left - right) / 2
      for (const element of group) place(element.id, { x: element.x + offset })
    }

    place('dock-glass', { x: 290, y: 1412, width: 440, height: 112, radius: 28 })
    ;['phone', 'safari', 'messages', 'music'].forEach((id, index) => place(id, {
      x: 306 + index * 108,
      y: 1424,
      width: 88,
      height: 88,
      radius: 20,
    }))
    place('page-current', { x: 548, y: 1366 })
    place('page-next', { x: 580, y: 1366 })
    place('search-glass', { x: 780, y: 1429, width: 78, height: 78, radius: 39 })
    place('search', { x: 800, y: 1449, width: 38, height: 38 })

    return { width: layout.height, height: layout.width, elements: layout.elements.map(element => elements.get(element.id) ?? element) }
  }

  // The cover display becomes landscape. Its widgets stack on the left while
  // the app grid, vertical dock, status control, and search retain clear zones.
  place('weather', { x: 55, y: 75, width: 230, height: 220, radius: 34 })
  place('map', { x: 55, y: 330, width: 230, height: 220, radius: 34 })
  place('status', { x: 956, y: 60, width: 60, height: 96 })
  const appIds = ['facetime', 'calendar', 'photos', 'camera', 'mail', 'notes', 'clock', 'maps', 'tv', 'news', 'app-store', 'rocket', 'health', 'wallet', 'siri', 'settings']
  appIds.forEach((id, index) => place(id, {
    x: 350 + (index % 4) * 130,
    y: 70 + Math.floor(index / 4) * 120,
    width: 100,
    height: 100,
    radius: 23,
  }))
  place('dock-glass', { x: 930, y: 160, width: 112, height: 410, radius: 28 })
  ;['phone', 'safari', 'messages', 'music'].forEach((id, index) => place(id, {
    x: 942,
    y: 176 + index * 98,
    width: 88,
    height: 88,
    radius: 20,
  }))
  place('page-current', { x: 585, y: 700 })
  place('page-next', { x: 617, y: 700 })
  place('search-glass', { x: 947, y: 650, width: 78, height: 78, radius: 39 })
  place('search', { x: 967, y: 670, width: 38, height: 38 })
  return { width: layout.height, height: layout.width, elements: layout.elements.map(element => elements.get(element.id) ?? element) }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load cover content: ${src}`))
    image.src = src
  })
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2))
}

function drawLiquidGlass(context: CanvasRenderingContext2D, element: GlassElement) {
  context.save()
  roundedRect(context, element.x, element.y, element.width, element.height, element.radius)
  context.shadowColor = 'rgba(27, 31, 38, 0.22)'
  context.shadowBlur = Math.max(12, element.width * 0.13)
  context.shadowOffsetY = Math.max(4, element.width * 0.04)
  const fill = context.createLinearGradient(element.x, element.y, element.x + element.width, element.y + element.height)
  fill.addColorStop(0, 'rgba(255,255,255,0.48)')
  fill.addColorStop(0.46, 'rgba(244,242,236,0.26)')
  fill.addColorStop(1, 'rgba(210,205,194,0.34)')
  context.fillStyle = fill
  context.fill()
  context.shadowColor = 'transparent'

  const edge = context.createLinearGradient(element.x, element.y, element.x + element.width, element.y + element.height)
  edge.addColorStop(0, 'rgba(255,255,255,0.92)')
  edge.addColorStop(0.45, 'rgba(255,255,255,0.3)')
  edge.addColorStop(1, 'rgba(120,116,109,0.22)')
  context.strokeStyle = edge
  context.lineWidth = Math.max(1.5, element.width * 0.014)
  context.stroke()

  roundedRect(context, element.x + 3, element.y + 3, element.width - 6, element.height - 6, Math.max(0, element.radius - 3))
  context.strokeStyle = 'rgba(255,255,255,0.2)'
  context.lineWidth = 1
  context.stroke()
  context.restore()
}

export async function createScreenContentTexture(src: string, anisotropy = 1, maxTextureSize = 8192, quarterTurn = false, quarterTurnVariant: QuarterTurnVariant = 'default') {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Could not load cover layout: ${src}`)
  const sourceLayout = await response.json() as ScreenLayout
  const layout = quarterTurn ? adaptQuarterTurnLayout(sourceLayout, quarterTurnVariant) : sourceLayout
  const images = new Map<string, HTMLImageElement>()
  const imageElements = layout.elements.filter((element): element is ImageElement => element.type === 'image')

  await Promise.all(imageElements.map(async element => {
    images.set(element.id, await loadImage(element.src))
  }))

  const renderScale = Math.max(1, Math.min(3, Math.floor(maxTextureSize / Math.max(layout.width, layout.height))))
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * renderScale
  canvas.height = layout.height * renderScale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.scale(renderScale, renderScale)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  for (const element of layout.elements) {
    if (element.type === 'glass') {
      drawLiquidGlass(context, element)
      continue
    }

    if (element.type === 'panel') {
      roundedRect(context, element.x, element.y, element.width, element.height, element.radius)
      context.fillStyle = element.color
      context.fill()
      continue
    }

    if (element.type === 'dot') {
      context.beginPath()
      context.arc(element.x, element.y, element.radius, 0, Math.PI * 2)
      context.fillStyle = element.color
      context.fill()
      continue
    }

    const image = images.get(element.id)
    if (!image) continue
    context.save()
    if (element.radius) {
      roundedRect(context, element.x, element.y, element.width, element.height, element.radius)
      context.clip()
    }
    context.drawImage(image, element.x, element.y, element.width, element.height)
    context.restore()
  }

  const texture = new CanvasTexture(canvas)
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = anisotropy
  texture.name = 'screen-content-composite'
  texture.userData.renderScale = renderScale
  texture.needsUpdate = true
  return texture
}
