// Turn an uploaded image/video file into a small base64 JPEG thumbnail.
// Everything is kept in localStorage, so we downscale aggressively to stay
// well under the ~5MB quota.
const MAX_SIZE = 640

export async function fileToThumbnail(file) {
  if (!file) return null
  if (file.type.startsWith('image/')) return imageToThumbnail(file, MAX_SIZE)
  if (file.type.startsWith('video/')) return videoToThumbnail(file, MAX_SIZE)
  throw new Error('이미지 또는 영상 파일만 업로드할 수 있어요')
}

// Scale an image to a larger size (default 1280) for AI vision, where text
// needs to stay legible. Returns the data URL plus the bare base64 for the API.
export async function fileToScaledImage(file, maxSize = 1280) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 분석할 수 있어요')
  }
  const dataUrl = await imageToThumbnail(file, maxSize)
  return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' }
}

// Draw a source (image/video element) onto a downscaled canvas and export JPEG
function drawToDataUrl(source, w, h, maxSize) {
  if (!w || !h) throw new Error('미디어 크기를 읽을 수 없어요')
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function imageToThumbnail(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try { resolve(drawToDataUrl(img, img.naturalWidth, img.naturalHeight, maxSize)) }
      catch (e) { reject(e) }
      finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러올 수 없어요')) }
    img.src = url
  })
}

function videoToThumbnail(file, maxSize) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    const cleanup = () => URL.revokeObjectURL(url)

    video.onloadeddata = () => {
      // Grab a representative frame: ~1s in, or the middle of very short clips
      const t = Math.min(1, (video.duration || 2) / 2)
      video.currentTime = Number.isFinite(t) ? t : 0
    }
    video.onseeked = () => {
      try { resolve(drawToDataUrl(video, video.videoWidth, video.videoHeight, maxSize)) }
      catch (e) { reject(e) }
      finally { cleanup() }
    }
    video.onerror = () => { cleanup(); reject(new Error('영상을 불러올 수 없어요')) }

    video.src = url
  })
}
