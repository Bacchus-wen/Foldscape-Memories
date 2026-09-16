import { useEffect, useState } from 'react'

export const LIGHTHOUSE_PHOTO = '/scenes/lighthouse/reference.jpg'
export const SEA_SCREEN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1120"><rect width="1600" height="1120" fill="#7186bb"/></svg>')

export function useLighthousePhoto() {
  const [cover, setCover] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      // The native cover is portrait. Pre-rotate the photograph to compensate
      // for the memory device's 90-degree landscape pose without UV stretching.
      canvas.width = 800
      canvas.height = Math.round(800 * 11.18277 / 7.732398)
      const height = image.naturalHeight / 2
      const width = Math.min(image.naturalWidth, height * canvas.height / canvas.width)
      const left = (image.naturalWidth - width) / 2
      const context = canvas.getContext('2d')
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate(Math.PI / 2)
      context.drawImage(image, left, 0, width, height, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width)
      if (!cancelled) setCover(canvas.toDataURL('image/jpeg', .95))
    }
    image.onerror = () => { if (!cancelled) setError(true) }
    image.src = LIGHTHOUSE_PHOTO
    return () => { cancelled = true }
  }, [])
  return { cover, error }
}
