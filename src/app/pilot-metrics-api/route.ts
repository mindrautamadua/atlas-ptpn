import { NextResponse } from 'next/server'
import { withUser, abort } from '@/lib/http-route'
import { computePilotMetrics, pilotCriteria } from '@/lib/pilot-metrics'

export const dynamic = 'force-dynamic'

const CAN = new Set(['ADMIN', 'SUPERADMIN'])

/** Port PilotMetricsController::api — GET /pilot-metrics-api (admin). */
export async function GET() {
  return withUser(async (user) => {
    if (!CAN.has((user.roleType ?? '').toUpperCase())) abort(403, 'Admin only.')
    const [data, criteria] = await Promise.all([computePilotMetrics(), pilotCriteria()])
    return NextResponse.json({ data, criteria })
  })
}
