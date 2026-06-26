import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Port dari app/Services/BroadcastService.php (subset dipakai modul Assignment).
 * Menulis baris BroadcastEvent — dikonsumsi RealtimeController polling 2 detik
 * (lihat memory project_sse_dropped_polling_only). Realtime FE belum diport,
 * tapi event tetap ditulis agar kompatibel saat poller menyusul.
 */
type Client = Prisma.TransactionClient | typeof prisma

export async function broadcastAll(
  eventType: string,
  payload: Record<string, unknown>,
  client: Client = prisma,
): Promise<void> {
  await client.broadcastEvent.create({
    data: { eventType, payload: payload as Prisma.InputJsonValue, userIds: undefined },
  })
}

export async function broadcastToUsers(
  eventType: string,
  payload: Record<string, unknown>,
  userIds: number[],
  client: Client = prisma,
): Promise<void> {
  if (userIds.length === 0) return
  await client.broadcastEvent.create({
    data: {
      eventType,
      payload: payload as Prisma.InputJsonValue,
      userIds: [...new Set(userIds)] as Prisma.InputJsonValue,
    },
  })
}

/** BroadcastService::assignment — broadcast ke semua user connected. */
export async function broadcastAssignment(
  id: number,
  action: string,
  context: Record<string, unknown> = {},
  client: Client = prisma,
): Promise<void> {
  await broadcastAll('assignment:changed', { id, action, ...context }, client)
}

/** BroadcastService::presence — presence:updated ke semua poller.
 *  emoji/message hanya disertakan kalau caller eksplisit kirim (agar event
 *  dari /realtime/ping tidak menimpa nilai existing di FE jadi null). */
export async function broadcastPresence(
  userId: number,
  status: string,
  lastActivityAt?: string | null,
  statusEmoji?: string | null,
  statusMessage?: string | null,
  client: Client = prisma,
): Promise<void> {
  const payload: Record<string, unknown> = {
    userId,
    status,
    lastActivityAt: lastActivityAt ?? new Date().toISOString(),
  }
  if (statusEmoji !== null && statusEmoji !== undefined) payload.statusEmoji = statusEmoji
  if (statusMessage !== null && statusMessage !== undefined) payload.statusMessage = statusMessage
  await broadcastAll('presence:updated', payload, client)
}

/** BroadcastService::presenceActivity — refresh relative-time presence di FE. */
export async function broadcastPresenceActivity(
  userId: number,
  lastActivityAt?: string | null,
  client: Client = prisma,
): Promise<void> {
  await broadcastAll('presence:activity', {
    userId,
    lastActivityAt: lastActivityAt ?? new Date().toISOString(),
  }, client)
}

/**
 * Notification + broadcast selalu berpasangan (CLAUDE.md convention #3).
 * Buat baris Notification untuk satu penerima lalu broadcast `notification:created`.
 */
export async function notifyUser(
  recipientId: number,
  type: string,
  message: string,
  source: string,
  client: Client = prisma,
): Promise<void> {
  const notif = await client.notification.create({
    data: {
      userId: recipientId,
      type,
      message,
      source,
      state: 'UNREAD',
      createdAt: new Date(),
    },
  })
  await broadcastToUsers('notification:created', { notification: notif }, [recipientId], client)
}
