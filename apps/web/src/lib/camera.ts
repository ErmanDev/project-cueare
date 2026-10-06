export function cameraBlockedReason(): string | null {
  if (!window.isSecureContext) {
    return (
      'Browsers only allow the camera on HTTPS or http://localhost. ' +
      'Open this site with https://, or type the student code.'
    )
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser cannot open a camera. Use Chrome or Edge, or type the student code.'
  }
  return null
}

export function explainCameraFailure(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const text = `${name} ${message}`.toLowerCase()
  if (name === 'NotAllowedError' || text.includes('permission') || text.includes('notallowed')) {
    return 'Camera permission was blocked. Allow camera for this site, then tap Turn on camera.'
  }
  if (name === 'NotFoundError' || text.includes('requested device not found')) {
    return 'No camera was found on this device.'
  }
  if (name === 'NotReadableError' || text.includes('could not start video source')) {
    return 'The camera is already in use by another app. Close it and tap Turn on camera.'
  }
  if (name === 'OverconstrainedError' || text.includes('overconstrained')) {
    return 'Could not open the rear camera. Tap Turn on camera to try another one.'
  }
  if (text.includes('https') || text.includes('secure context') || text.includes('secure origin')) {
    return 'Browsers only allow the camera on HTTPS or http://localhost.'
  }
  return message.trim() || 'Camera unavailable.'
}

export function pickCameraId(cameras: { id: string; label: string }[]): string | undefined {
  return cameras.find((c) => /back|rear|environment|world/i.test(c.label))?.id ?? cameras[0]?.id
}
