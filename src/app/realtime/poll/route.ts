import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiUser, errorResponse } from '@/lib/channels'

export const dynamic = 'force-dynamic'

type RawEvent = { id: number | bigint; eventType: string; payload: unknown }

/**
 * GET /realtime/poll?since=N — kembalikan event id > N yang relevan untuk user.
 * Port dari RealtimeController::poll (polling 2 detik; SSE di-drop).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser()

    const since = Math.max(0, Number(req.nextUrl.searchParams.get('since') ?? 0) || 0)
    const agg = await prisma.broadcastEvent.aggregate({ _max: { id: true } })
    const currentMax = agg._max.id ?? 0

    // Seed call (since >= max) — skip query, balikkan max sekarang.
    if (since >= currentMax) {
      return NextResponse.json({ events: [], lastEventId: currentMax })
    }

    const rows = await prisma.$queryRaw<RawEvent[]>`
      SELECT "id", "eventType", "payload"
      FROM "ptpn_kmr_app"."broadcast_events"
      WHERE "id" > ${since}
        AND ("userIds" IS NULL OR "userIds"::jsonb @> ${JSON.stringify(user.id)}::jsonb)
      ORDER BY "id" ASC
      LIMIT 200
    `

    const events = rows.map((e) => ({
      id: Number(e.id),
      eventType: e.eventType,
      payload: e.payload,
    }))

    const lastEventId =
      events.length >= 200 ? events[events.length - 1].id : currentMax

    return NextResponse.json({ events, lastEventId })
  } catch (e) {
    return errorResponse(e)
  }
}
