'use client'

import { useEffect, useState } from 'react'
import {
  savePushSubscription,
  removePushSubscription,
  sendTestNotification,
} from '@/app/(app)/settings/notifications/actions'

// Convert a base64url VAPID key into the Uint8Array the Push API expects.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

type Status = 'idle' | 'working'

export default function NotificationSettings() {
  const [supported, setSupported] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    const ok =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    setSupported(ok)
    if (!ok) return
    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {})
  }, [])

  async function subscribe() {
    if (!vapidKey) {
      setMessage('VAPID public key belum dikonfigurasi di server.')
      return
    }
    setStatus('working')
    setMessage(null)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setMessage('Izin notifikasi ditolak.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      await savePushSubscription(
        JSON.parse(JSON.stringify(sub)),
        navigator.userAgent
      )
      setSubscribed(true)
      setMessage('Notifikasi diaktifkan untuk perangkat ini.')
    } catch (err) {
      console.error(err)
      setMessage('Gagal mengaktifkan notifikasi.')
    } finally {
      setStatus('idle')
    }
  }

  async function unsubscribe() {
    setStatus('working')
    setMessage(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await removePushSubscription(sub.endpoint)
      }
      setSubscribed(false)
      setMessage('Notifikasi dinonaktifkan untuk perangkat ini.')
    } catch (err) {
      console.error(err)
      setMessage('Gagal menonaktifkan notifikasi.')
    } finally {
      setStatus('idle')
    }
  }

  async function test() {
    setStatus('working')
    setMessage(null)
    try {
      const res = await sendTestNotification()
      setMessage(
        res.sent > 0
          ? `Terkirim ke ${res.sent} perangkat.`
          : 'Tidak ada perangkat aktif untuk dikirimi.'
      )
    } catch {
      setMessage('Gagal mengirim notifikasi uji coba.')
    } finally {
      setStatus('idle')
    }
  }

  if (!supported) {
    return (
      <div className="push-card">
        <p className="push-card__desc">
          Browser ini tidak mendukung notifikasi push. Coba Chrome, Edge, atau
          Safari versi terbaru (di iOS, pasang dulu aplikasi ke layar utama).
        </p>
      </div>
    )
  }

  const busy = status === 'working'

  return (
    <div className="push-card">
      <div className="push-card__row">
        <div className="push-card__copy">
          <span className="push-card__title">Notifikasi push</span>
          <span className="push-card__desc">
            {subscribed
              ? 'Perangkat ini akan menerima notifikasi dari ATLAS.'
              : 'Aktifkan untuk menerima notifikasi dari ATLAS di perangkat ini.'}
          </span>
        </div>
        <button
          className={`push-card__toggle${subscribed ? ' is-on' : ''}`}
          role="switch"
          aria-checked={subscribed}
          disabled={busy || permission === 'denied'}
          onClick={subscribed ? unsubscribe : subscribe}
        >
          <span className="push-card__knob" />
        </button>
      </div>

      {permission === 'denied' && (
        <p className="push-card__note">
          Izin notifikasi diblokir di pengaturan browser. Aktifkan kembali
          melalui ikon gembok pada bilah alamat.
        </p>
      )}

      {subscribed && (
        <button className="push-card__test" disabled={busy} onClick={test}>
          Kirim notifikasi uji coba
        </button>
      )}

      {message && <p className="push-card__msg">{message}</p>}
    </div>
  )
}
