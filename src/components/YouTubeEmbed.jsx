import { useEffect, useRef, useState } from 'react'
import styles from './YouTubeEmbed.module.css'

// Load the YouTube IFrame Player API once and resolve when it's ready.
let apiPromise = null
function loadYouTubeApi() {
  if (apiPromise) return apiPromise
  apiPromise = new Promise(resolve => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev && prev()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

// Inline YouTube player. If the owner disabled embedding (error 101/150) or the
// video can't be played here (100), we surface a confirm dialog that jumps to
// the original YouTube page instead.
export default function YouTubeEmbed({ videoId, videoUrl, title }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBlocked(false)

    loadYouTubeApi().then(YT => {
      if (cancelled || !hostRef.current) return
      // YT replaces the target node with an iframe, so give it a fresh child
      // div (the outer host stays under React's control for safe unmounting).
      const mount = document.createElement('div')
      hostRef.current.innerHTML = ''
      hostRef.current.appendChild(mount)

      playerRef.current = new YT.Player(mount, {
        videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onError: e => {
            if ([100, 101, 150].includes(e.data)) setBlocked(true)
          },
        },
      })
    })

    return () => {
      cancelled = true
      try { playerRef.current?.destroy?.() } catch { /* already gone */ }
      playerRef.current = null
    }
  }, [videoId])

  function goToYouTube() {
    window.open(videoUrl, '_blank', 'noopener')
    setBlocked(false)
  }

  return (
    <>
      <div ref={hostRef} className={styles.host} title={title} />

      {blocked && (
        <div className={styles.overlay} onClick={() => setBlocked(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <p className={styles.modalText}>
              공유가 비활성화 된 영상입니다.<br />유튜브로 이동하시겠습니까?
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setBlocked(false)}>취소</button>
              <button className={styles.confirmBtn} onClick={goToYouTube}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
