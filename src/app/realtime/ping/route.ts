import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'
import { broadcastPresence, broadcastPresenceActivity } from '@/lib/broadcast'

export const dynamic = 'force-dynamic'

const IDLE_THRESHOLD_MS = 90_000 // 90 detik gap = sesi baru
const ACTIVITY_THROTTLE_MS = 5 * 60_000 // 5 menit throttle presence:activity

/**
 * POST /realtime/ping — heartbeat dari tab aktif tiap 60 detik.
 * Update lastActivityAt + close/open UserSession sesuai idle threshold.
 * Port dari RealtimeController::ping.
 */
export async function POST() {
  try {
    const user = await requireApiUser()
    const now = new Date()
    let newStatus: string | null = null

    // Update UserStatus (auto ONLINE kalau sebelumnya OFFLINE)
    const current = await prisma.userStatus.findUnique({ where: { userId: user.id } })
    const shouldGoOnline = !current || current.status === 'OFFLINE'
    if (shouldGoOnline) newStatus = 'ONLINE'
    const prevActivityAt = current?.lastActivityAt ?? null

    await prisma.userStatus.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: 'ONLINE',
        lastActivityAt: now,
      },
      update: {
        lastActivityAt: now,
        ...(shouldGoOnline ? { status: 'ONLINE' } : {}),
      },
    })

    // Session tracking
    const active = await prisma.userSession.findFirst({
      where: { userId: user.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    })

    if (active) {
      const gapMs = active.lastPingAt ? now.getTime() - active.lastPingAt.getTime() : 0
      if (gapMs <= IDLE_THRESHOLD_MS) {
        // Contiguous activity — extend session
        await prisma.userSession.update({
          where: { id: active.id },
          data: { lastPingAt: now, durationMs: (active.durationMs ?? 0) + gapMs },
        })
      } else {
        // Gap too large — close + open new
        await prisma.userSession.update({
          where: { id: active.id },
          data: { endedAt: active.lastPingAt, endReason: 'idle' },
        })
        await prisma.userSession.create({
          data: { userId: user.id, startedAt: now, lastPingAt: now },
        })
      }
    } else {
      await prisma.userSession.create({
        data: { userId: user.id, startedAt: now, lastPingAt: now },
      })
    }

    // Broadcast
    if (newStatus) {
      // Perubahan status (mis. OFFLINE→ONLINE) penting → broadcast langsung.
      await broadcastPresence(user.id, newStatus, now.toISOString())
    } else {
      // presence:activity hanya refresh relative-time di UI. Throttle: hanya
      // broadcast kalau lastActivityAt sebelumnya > 5 menit lalu (hindari O(N²)
      // spam tanpa cache layer di Next.js).
      const staleEnough =
        !prevActivityAt || now.getTime() - prevActivityAt.getTime() > ACTIVITY_THROTTLE_MS
      if (staleEnough) {
        await broadcastPresenceActivity(user.id, now.toISOString())
      }
    }

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}
