'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'atlas-pwa-install-dismissed'

// Minimal shape of the (non-standard) beforeinstallprompt event.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function AtlasMark() {
  return (
    <span className="pwa-install__mark" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="2.5" y1="18.5" x2="10" y2="2.5" />
        <line x1="17.5" y1="18.5" x2="10" y2="2.5" />
        <line x1="6.3" y1="11.5" x2="13.7" y2="11.5" />
      </svg>
    </span>
  )
}

/**
 * Registers the service worker and surfaces a brand-styled install prompt.
 *
 * - Android/desktop Chromium: captures `beforeinstallprompt` and offers a
 *   one-tap "Install" button.
 * - iOS Safari: shows manual "Add to Home Screen" instructions (no
 *   programmatic install API exists there).
 * - Hidden entirely once the app runs in standalone (already installed) or
 *   after the user dismisses it.
 */
export default function PWAManager() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissed] = useState(true) // assume hidden until checked

  // Register the service worker once on mount.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.error('SW registration failed:', err))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  // Decide whether the install prompt is eligible to show.
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari uses a non-standard navigator flag.
      (navigator as { standalone?: boolean }).standalone === true
    if (isStandalone) return

    const wasDismissed = localStorage.getItem(DISMISS_KEY) === '1'
    if (wasDismissed) return

    setDismissed(false)

    const isIOS =
      /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) &&
      !('MSStream' in window)
    if (isIOS) setShowIOS(true)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    const onInstalled = () => {
      setDeferredPrompt(null)
      setShowIOS(false)
      setDismissed(true)
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  // Nothing to show: dismissed/standalone, or no install path available.
  if (dismissed) return null
  if (!deferredPrompt && !showIOS) return null

  if (showIOS && !deferredPrompt) {
    return (
      <div className="pwa-install pwa-install--ios" role="dialog" aria-label="Pasang ATLAS">
        <AtlasMark />
        <div className="pwa-install__body">
          <span className="pwa-install__title">Pasang ATLAS</span>
          <span className="pwa-install__ios-hint">
            Ketuk <b>Bagikan</b> ⎋ lalu pilih <b>Add to Home Screen</b> ➕
          </span>
        </div>
        <button
          className="pwa-install__dismiss"
          onClick={dismiss}
          aria-label="Tutup"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="pwa-install" role="dialog" aria-label="Pasang ATLAS">
      <AtlasMark />
      <div className="pwa-install__body">
        <span className="pwa-install__title">Pasang ATLAS</span>
        <span className="pwa-install__desc">
          Akses cepat dari layar utama, tampil seperti aplikasi.
        </span>
      </div>
      <div className="pwa-install__actions">
        <button className="pwa-install__btn" onClick={install}>
          Pasang
        </button>
        <button
          className="pwa-install__dismiss"
          onClick={dismiss}
          aria-label="Tutup"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
