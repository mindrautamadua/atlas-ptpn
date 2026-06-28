import 'server-only'
import webpush from 'web-push'
import { prisma } from '@/lib/db'

/**
 * Web Push sender. Configure VAPID lazily so the module can be imported even
 * when keys are absent (the UI degrades gracefully instead of crashing).
 */
let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.'
    )
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:divisi.hcm@gmail.com',
    publicKey,
    privateKey
  )
  configured = true
}

export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  )
}

export type PushPayload = {
  title: string
  body?: string
  url?: string
  icon?: string
}

/**
 * Deliver a notification to every device a user has subscribed. Dead
 * subscriptions (HTTP 404/410 from the push service) are pruned automatically.
 */
export async function sendPushToUser(userId: number, payload: PushPayload) {
  ensureConfigured()
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  const data = JSON.stringify(payload)

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired/unsubscribed on the client — drop it.
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {})
          return
        }
        throw err
      }
    })
  )

  return {
    total: subs.length,
    sent: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}
