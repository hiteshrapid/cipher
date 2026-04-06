import { useEffect, useRef, useState } from 'react'

export interface CameraCapture {
  videoRef: React.RefObject<HTMLVideoElement | null>
  streamRef: React.RefObject<MediaStream | null>
  ready: boolean
  error: string | null
}

export function useCameraCapture(): CameraCapture {
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.onloadedmetadata = () => {
            video.play().then(() => { if (mounted) setReady(true) })
          }
        }
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Camera access denied'
          setError(msg)
        }
      }
    }

    start()
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  return { videoRef, streamRef, ready, error }
}
