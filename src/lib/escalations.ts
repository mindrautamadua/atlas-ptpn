import 'server-only'
import { prisma } from '@/lib/db'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { AuthUser } from '@/lib/auth'

/* Port dari app/Http/Controllers/EscalationController.php + Models/EscalationRequest.php.
 * Shape JSON mengikuti komponen Escalation.tsx (relasi `requester`, append `agingDays`). */

type Client = PrismaClient | Prisma.TransactionClient

export const ESCALATION_INCLUDE = {
  requestedBy: { select: { id: true, name: true, roleType: true, positionTitle: true } },
  escalatedTo: { select: { id: true, name: true, roleType: true, positionTitle: true } },
  reroutedTo: { select: { id: true, name: true } },
  linkedProgram: { select: { id: true, code: true, name: true } },
} satisfies Prisma.EscalationRequestInclude

type EscalationRow = Prisma.EscalationRequestGetPayload<{ include: typeof ESCALATION_INCLUDE }>

/** Mirror EscalationRequest::getAgingDaysAttribute — floor(diffInDays(requestedAt, resolvedAt ?? now)). */
export function agingDays(requestedAt: Date, resolvedAt: Date | null): number {
  const end = resolvedAt ?? new Date()
  return Math.max(0, Math.floor((end.getTime() - requestedAt.getTime()) / 86_400_000))
}

export function isTerminalStatus(status: string): boolean {
  return status === 'CLEARED' || status === 'DECLINED' || status === 'REROUTED'
}

/** Mirror EscalationRequest::generateCode — `E-{year}-{0000count}`. */
export async function generateEscalationCode(client: Client = prisma): Promise<string> {
  const now = new Date()
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const count = await client.escalationRequest.count({ where: { createdAt: { gte: startOfYear } } })
  return `E-${now.getUTCFullYear()}-${String(count + 1).padStart(4, '0')}`
}

/** prisma row → shape yang dipakai Escalation.tsx (rename requestedBy→requester, ISO dates, agingDays). */
export function mapEscalation(r: EscalationRow) {
  return {
    id: r.id,
    code: r.code,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    requestedById: r.requestedById,
    requestedAt: r.requestedAt.toISOString(),
    title: r.title,
    description: r.description,
    escalatedToId: r.escalatedToId,
    linkedProgramId: r.linkedProgramId,
    status: r.status,
    committedAt: r.committedAt?.toISOString() ?? null,
    commitmentDueDate: r.commitmentDueDate?.toISOString() ?? null,
    commitmentNote: r.commitmentNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNote: r.resolutionNote,
    reroutedToId: r.reroutedToId,
    declinedReason: r.declinedReason,
    agingDays: agingDays(r.requestedAt, r.resolvedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    requester: mapPerson(r.requestedBy),
    escalatedTo: mapPerson(r.escalatedTo),
    reroutedTo: r.reroutedTo ?? undefined,
    linkedProgram: r.linkedProgram ?? undefined,
  }
}

/** Coerce nullable roleType/positionTitle → undefined to match the FE type. */
function mapPerson(p: { id: number; name: string; roleType: string | null; positionTitle: string | null } | null) {
  return p ? { id: p.id, name: p.name, roleType: p.roleType ?? undefined, positionTitle: p.positionTitle ?? undefined } : undefined
}

/** Re-fetch satu escalation dengan relasi + map. */
export async function fetchEscalation(id: number, client: Client = prisma) {
  const row = await client.escalationRequest.findUnique({ where: { id }, include: ESCALATION_INCLUDE })
  return row ? mapEscalation(row) : null
}

const ADMIN_ROLES = new Set(['BOD', 'ADMIN', 'SUPERADMIN'])

/** Mirror EscalationController::index — filter incoming|mine|all (+ optional status). */
export async function listEscalations(
  user: AuthUser,
  filter: string,
  status?: string | null,
) {
  const where: Prisma.EscalationRequestWhereInput = {}
  if (filter === 'mine') {
    where.requestedById = user.id
  } else if (filter === 'all' && ADMIN_ROLES.has((user.roleType ?? '').toUpperCase())) {
    // admin sees all — no scope filter
  } else {
    // 'incoming' + default safety
    where.escalatedToId = user.id
  }
  if (status) where.status = status

  const rows = await prisma.escalationRequest.findMany({
    where,
    include: ESCALATION_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map(mapEscalation)
}
