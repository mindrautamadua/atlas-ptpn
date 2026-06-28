'use server'

import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendPushToUser } from '@/lib/webpush'

// Shape produced by PushSubscription.toJSON() in the browser.
type SerializedSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Persist (or refresh) the current user's push subscription for one device. */
export async function savePushSubscription(
  sub: SerializedSubscription,
  userAgent?: string
) {
  const user = await requireUser()
  const ua = userAgent ? userAgent.slice(0, 512) : null

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
    },
    // Re-subscribing on the same endpoint may hand it to a different user
    // (shared device) — reassign ownership and refresh the keys.
    update: {
      userId: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
    },
  })

  return { ok: true }
}

/** Remove a subscription by endpoint (called after the browser unsubscribes). */
export async function removePushSubscription(endpoint: string) {
  await requireUser()
  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
  return { ok: true }
}

/** Send a test notification to all of the current user's devices. */
export async function sendTestNotification() {
  const user = await requireUser()
  return sendPushToUser(user.id, {
    title: 'ATLAS',
    body: 'Notifikasi uji coba berhasil dikirim 🎉',
    url: '/',
  })
}
